import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, updateDoc, addDoc, writeBatch, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

import { firebaseConfig, toegestaneEmails, eigenaarEmail, raboDoelStorting, startDatum, spaarpot } from "./config.js";
import { maandOverzicht, spaarStatus } from "./spaar.js";
import { periodeVanBoeking, periodeVandaag, periodeNaam, verstreken, volgendePeriode } from "./periode.js";
import { standaardPotjes } from "./potjes.js";
import { parseAbnRows, parseRaboCsv, gatControle } from "./parse.js";
import { sorteerRegels, deelIn } from "./rules.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const S = { user: null, boekingen: new Map(), regels: [], potjes: {}, rekeningen: {}, abnSamenvatting: { maanden: {} }, maand: null, tab: "maand", import: null, open: null };
const isEigenaar = () => S.user?.email === eigenaarEmail;
// Potjes waarvan de boekingen alleen voor de eigenaar zichtbaar zijn.
const isPrive = (p) => p.rekening === "abn" || ["zakelijk", "inkomen", "apart"].includes(p.soort);
// Oude namen die bij het laden worden bijgewerkt.
const hernoem = { "lening-duo": "Leningen" };

// ---------- hulpfuncties ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (n) => (n < 0 ? "-€ " : "€ ") + Math.abs(n).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eur2 = (n) => (n < 0 ? "-€ " : "€ ") + Math.abs(n).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const maandNaam = (m) => new Date(m + "-01T12:00:00").toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
const potjeLijst = () => Object.values(S.potjes).sort((a, b) => a.volgorde - b.volgorde);
const potjeNaam = (c) => (S.potjes[c] ? S.potjes[c].naam : c);
const rekNaam = (r) => ({ abn: "ABN", rabo: "Rabo", zakelijk: "Zakelijk" }[r] || r);
const melding = (tekst, soort = "info") => { const el = $("#melding"); el.textContent = tekst; el.className = `melding ${soort}`; el.hidden = !tekst; };

async function inBatches(items, fn) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach((it) => fn(batch, it));
    await batch.commit();
  }
}

// ---------- inloggen ----------
$("#login").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { melding("Inloggen mislukt: " + e.message, "fout"); }
});
$("#logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user && !toegestaneEmails.includes(user.email)) {
    melding(`${user.email} heeft geen toegang.`, "fout");
    await signOut(auth);
    return;
  }
  S.user = user;
  $("#uitgelogd").hidden = !!user;
  $("#ingelogd").hidden = !user;
  $("#app").hidden = !user;
  if (user) {
    $("#wie").textContent = user.displayName || user.email;
    await laadAlles();
  }
});

// ---------- laden ----------
async function laadAlles() {
  melding("Laden…");
  const eig = isEigenaar();
  const boekQ = eig ? collection(db, "boekingen") : query(collection(db, "boekingen"), where("rekening", "==", "rabo"));
  const [bSnap, rSnap, pSnap] = await Promise.all([getDocs(boekQ), getDocs(collection(db, "regels")), getDocs(collection(db, "potjes"))]);
  S.boekingen = new Map(bSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  S.regels = sorteerRegels(rSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  S.rekeningen = {};
  for (const r of eig ? ["abn", "rabo"] : ["rabo"]) {
    const d = await getDoc(doc(db, "rekeningen", r));
    if (d.exists()) S.rekeningen[r] = d.data();
  }
  if (!eig) {
    const sam = await getDoc(doc(db, "samenvattingen", "abn"));
    S.abnSamenvatting = sam.exists() ? sam.data() : { maanden: {} };
  }
  S.potjes = Object.fromEntries(pSnap.docs.map((d) => [d.id, { code: d.id, ...d.data() }]));
  // Nieuwe standaardpotjes (uit een update van de app) aanvullen; bestaande budgetten blijven staan.
  const ontbrekend = standaardPotjes.filter((p) => !S.potjes[p.code]);
  if (ontbrekend.length) {
    await inBatches(ontbrekend, (b, p) => b.set(doc(db, "potjes", p.code), p));
    ontbrekend.forEach((p) => (S.potjes[p.code] = { ...p }));
  }
  for (const [code, naam] of Object.entries(hernoem)) {
    if (S.potjes[code] && S.potjes[code].naam !== naam) {
      await updateDoc(doc(db, "potjes", code), { naam });
      S.potjes[code].naam = naam;
    }
  }
  // Eenmalige omzetting naar de spaarpot-opzet (versie 2).
  const vak = S.potjes[spaarpot.potje];
  if (vak && vak.versie !== 2) {
    const upd = { naam: "Spaarpot vakantie", budget: spaarpot.maandDoel, soort: "spaar", versie: 2, startSaldo: vak.startSaldo ?? 0 };
    await updateDoc(doc(db, "potjes", spaarpot.potje), upd);
    Object.assign(vak, upd);
  }
  // Versie 3: leefgeld opgesplitst; het oude potje wordt "Contant en overig".
  const lg = S.potjes.leefgeld;
  if (lg && lg.versie !== 3) {
    const upd = { naam: "Contant en overig", budget: 50, groep: "leefgeld", volgorde: 10.8, versie: 3 };
    await updateDoc(doc(db, "potjes", "leefgeld"), upd);
    Object.assign(lg, upd);
  }
  if (eig) await schrijfSamenvatting();
  if (!S.maand) S.maand = alleMaanden()[0] || periodeVandaag();
  melding("");
  render();
}

// Totalen per potje per maand van de ABN, zodat Dorien de balken ziet zonder de boekingen.
async function schrijfSamenvatting() {
  if (!isEigenaar()) return;
  const maanden = {};
  for (const b of S.boekingen.values()) {
    if (b.rekening !== "abn") continue;
    const m = periodeVanBoeking(b);
    const pot = ((maanden[m] ||= { potjes: {} }).potjes);
    pot[b.potje] = Math.round(((pot[b.potje] || 0) + b.bedrag) * 100) / 100;
  }
  const spaar = maandOverzicht([...S.boekingen.values()], spaarpot.potje, spaarpot.uitgavePotje, periodeVanBoeking);
  S.abnSamenvatting = { maanden, spaar };
  await setDoc(doc(db, "samenvattingen", "abn"), { maanden, spaar, bijgewerkt: serverTimestamp() });
}

function alleMaanden() {
  const m = new Set([...S.boekingen.values()].map(periodeVanBoeking));
  if (!isEigenaar()) Object.keys(S.abnSamenvatting.maanden || {}).forEach((x) => m.add(x));
  return [...m].sort().reverse();
}

// ---------- navigatie ----------
document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => { S.tab = b.dataset.tab; render(); }));

function render() {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("actief", b.dataset.tab === S.tab));
  const n = [...S.boekingen.values()].filter((b) => b.potje === "toewijzen").length;
  $("#teller").textContent = n ? String(n) : "";
  const v = { maand: renderMaand, toewijzen: renderToewijzen, import: renderImport, instellingen: renderInstellingen }[S.tab];
  $("#inhoud").innerHTML = "";
  v($("#inhoud"));
}

// ---------- Deze maand ----------
function renderMaand(el) {
  const eig = isEigenaar();
  const maanden = alleMaanden();
  if (!maanden.length) {
    el.innerHTML = `<div class="kaart"><h2>Nog geen boekingen</h2><p>Ga naar <b>Importeren</b> en upload een export${eig ? " van de ABN en de Rabo" : " van de Rabo"}. Zet eerst bij <b>Instellingen</b> de startregels erin.</p></div>`;
    return;
  }
  if (!maanden.includes(S.maand)) S.maand = maanden[0];
  const deze = [...S.boekingen.values()].filter((b) => periodeVanBoeking(b) === S.maand);
  const perPotje = {};
  for (const b of deze) (perPotje[b.potje] ||= []).push(b);
  const som = (lijst) => (lijst || []).reduce((s, b) => s + b.bedrag, 0);
  // Voor Dorien: ABN-deel per potje uit de samenvatting (zonder losse boekingen).
  const abnDeel = (code) => (eig ? 0 : ((S.abnSamenvatting.maanden || {})[S.maand]?.potjes?.[code] || 0));
  const totaal = (code) => som(perPotje[code]) + abnDeel(code);

  const storting = som((perPotje.intern || []).filter((b) => b.rekening === "rabo" && b.bedrag > 0));
  const inkomen = ["in-salaris", "in-toeslag", "in-omzet"].map((c) => [c, som(perPotje[c])]);
  // Inkomsten die al binnen zijn maar bij de volgende periode horen (toeslag rond de 20e).
  const volgende = volgendePeriode(S.maand);
  const klaargezet = [...S.boekingen.values()]
    .filter((b) => ["in-salaris", "in-toeslag"].includes(b.potje) && periodeVanBoeking(b) === volgende && b.datum.slice(0, 7) <= S.maand)
    .reduce((s, b) => s + b.bedrag, 0);
  const storno = deze.filter((b) => b.label === "storno");
  const nToewijzen = (perPotje.toewijzen || []).length;

  const saldi = ["abn", "rabo"].filter((r) => S.rekeningen[r]).map((r) => {
    const k = S.rekeningen[r];
    return `<div class="saldo ${k.eindSaldo < 0 ? "neg" : ""}"><span>${rekNaam(r)}</span><b>${eur2(k.eindSaldo)}</b><small>stand ${esc(k.totDatum)}</small></div>`;
  }).join("");

  const balk = (p) => {
    const lijst = perPotje[p.code] || [];
    const besteed = -totaal(p.code);
    const pct = p.budget ? besteed / p.budget : 0;
    const spaar = p.soort === "spaar";
    const kleur = kleurVoor(p, besteed);
    const magOpen = eig || !isPrive(p);
    const open = magOpen && S.open === p.code;
    const verborgen = -abnDeel(p.code);
    return `<div class="potje" data-code="${esc(p.code)}">
      <div class="potje-kop ${magOpen ? "klikbaar" : "dicht"}"><span>${esc(p.naam)}${magOpen ? "" : ' <small class="slot">alleen Ricky</small>'}</span><span>${eur(besteed)}${p.budget ? ` <small>/ ${eur(p.budget)}</small>` : ""}</span></div>
      ${p.nulDoel ? `<div class="over ${besteed > 0.005 ? "neg" : ""}">${besteed > 0.005 ? "doel is € 0: stap over op direct betalen" : "niets achteraf betaald ✓"}</div>` : ""}
      ${p.budget ? `<div class="balk"><div class="vul ${kleur}" style="width:${Math.min(100, Math.max(0, pct * 100))}%"></div></div>
      <div class="over ${kleur}">${overTekst(p, besteed, klaar)}</div>` : ""}
      ${open ? lijstHtml(lijst) + (verborgen ? `<div class="lijst"><small>Plus ${eur2(verborgen)} via de ABN-rekening van Ricky.</small></div>` : "") : ""}
    </div>`;
  };
  const klaar = verstreken(S.maand) >= 1;
  const toon = (p) => p.budget || p.nulDoel || perPotje[p.code] || abnDeel(p.code);
  const groepKaart = (groep, titel) => {
    const leden = potjeLijst().filter((p) => p.groep === groep);
    if (!leden.length) return "";
    const besteed = leden.reduce((s, p) => s - totaal(p.code), 0);
    const budget = leden.reduce((s, p) => s + (p.budget || 0), 0);
    const pct = budget ? besteed / budget : 0;
    const kleur = kleurVoor({ budget, soort: "uitgave" }, besteed);
    return `<div class="kaart groep"><div class="potje-kop"><h2>${esc(titel)}</h2><span><b>${eur(besteed)}</b> <small>/ ${eur(budget)}</small></span></div>
      <div class="balk dik"><div class="vul ${kleur}" style="width:${Math.min(100, Math.max(0, pct * 100))}%"></div></div>
      <div class="over ${kleur}">${overTekst({ budget, soort: "uitgave" }, besteed, klaar)}</div>
      <div class="groep-leden">${leden.filter(toon).map(balk).join("")}</div></div>`;
  };
  const groep = (soorten) => potjeLijst().filter((p) => soorten.includes(p.soort) && toon(p)).map(balk).join("");

  el.innerHTML = `
    <div class="maandkeuze"><select id="maand">${maanden.map((m) => `<option value="${m}" ${m === S.maand ? "selected" : ""}>${periodeNaam(m)}</option>`).join("")}</select></div>
    ${storno.length ? `<div class="kaart alarm"><b>${storno.length} teruggeboekte incasso${storno.length > 1 ? "'s" : ""}</b> deze maand: ${storno.map((b) => esc(b.tegenpartij)).join(", ")}. Check of die alsnog betaald zijn.</div>` : ""}
    ${nToewijzen ? `<div class="kaart actie" id="naarToewijzen">${nToewijzen} boeking${nToewijzen > 1 ? "en" : ""} deze maand om toe te wijzen →</div>` : ""}
    <div class="kaart"><div class="saldi">${saldi || "<small>Nog geen saldo bekend</small>"}</div>
      <div class="storting ${storting < raboDoelStorting ? "neg" : ""}">Naar Rabo deze maand: <b>${eur(storting)}</b> van ${eur(raboDoelStorting)}</div></div>
    ${spaarKaart()}
    <div class="kaart"><h2>Rabo, huishouden</h2>${potjeLijst().filter((p) => p.soort === "uitgave" && p.rekening !== "abn" && toon(p)).map(balk).join("")}</div>
    <div class="kaart"><h2>ABN, potjes van Ricky</h2>${potjeLijst().filter((p) => (p.soort === "uitgave" || p.soort === "spaar") && p.rekening === "abn" && !p.groep && toon(p)).map(balk).join("")}</div>
    ${groepKaart("leefgeld", "Leefgeld")}
    ${eig ? `<div class="kaart"><h2>Inkomsten</h2>${inkomen.map(([c, v]) => `<div class="regel"><span>${esc(potjeNaam(c))}</span><b>${eur(v)}</b></div>`).join("")}
      ${klaargezet ? `<div class="regel klaar"><span>Al binnen voor ${esc(periodeNaam(volgendePeriode(S.maand)).split(" (")[0])}</span><b>${eur(klaargezet)}</b></div>` : ""}</div>
    <div class="kaart"><h2>Zakelijk en apart</h2>${groep(["zakelijk", "apart"]) || "<small>Niets deze maand</small>"}</div>` : ""}`;

  $("#maand").addEventListener("change", (e) => { S.maand = e.target.value; S.open = null; render(); });
  $("#naarToewijzen")?.addEventListener("click", () => { S.tab = "toewijzen"; render(); });
  el.querySelectorAll(".potje-kop.klikbaar").forEach((k) => k.addEventListener("click", () => {
    const c = k.parentElement.dataset.code; S.open = S.open === c ? null : c; render();
  }));
  koppelWijzig(el);
}

// Kleur: groen = binnen budget of gehaald, geel = net over (max € 10 of 5%), rood = echt over. Sparen: blauw tot het gehaald is.
function kleurVoor(p, besteed) {
  if (!p.budget) return "";
  if (p.soort === "spaar") return besteed >= p.budget - 0.005 ? "groen" : "blauw";
  const over = besteed - p.budget;
  if (over <= 0.005) return "groen";
  return over <= Math.max(10, p.budget * 0.05) ? "geel" : "rood";
}

function overTekst(p, besteed, klaar) {
  if (p.soort === "spaar") return besteed >= p.budget - 0.005 ? "gehaald deze maand ✓" : `nog ${eur(p.budget - besteed)} te zetten`;
  const rest = p.budget - besteed;
  if (rest >= -0.005) return klaar ? `gehaald ✓ ${eur(rest)} over` : `${eur(rest)} over`;
  return `${eur(-rest)} over budget`;
}

function spaarKaart() {
  const p = S.potjes[spaarpot.potje];
  if (!p) return "";
  const overzicht = isEigenaar()
    ? maandOverzicht([...S.boekingen.values()], spaarpot.potje, spaarpot.uitgavePotje, periodeVanBoeking)
    : (S.abnSamenvatting.spaar || { maanden: {}, netto: 0 });
  const vandaag = periodeVandaag();
  const huidig = S.maand > vandaag ? S.maand : vandaag;
  if (huidig < spaarpot.startMaand) {
    return `<div class="kaart spaar"><h2>Spaarpot vakantie</h2><p>Start in ${maandNaam(spaarpot.startMaand)}: zet een automatische overboeking van ${eur(spaarpot.maandDoel)} naar de spaarrekening, op de dag na je salaris.</p></div>`;
  }
  const st = spaarStatus(overzicht, { startMaand: spaarpot.startMaand, huidigeMaand: huidig, maandDoel: p.budget || spaarpot.maandDoel,
    jaarDoel: spaarpot.jaarDoel, startSaldo: p.startSaldo || 0 });
  const pctJaar = Math.min(100, (st.gespaardDitJaar / st.jaarDoel) * 100);
  const afk = (m) => new Date(m + "-01T12:00:00").toLocaleDateString("nl-NL", { month: "short" }).replace(".", "");
  const uitleg = { gelukt: "gelukt", gemist: "niet gezet", aangebroken: "aangebroken", bezig: "loopt nog" };
  return `<div class="kaart spaar">
    <div class="spaar-kop"><h2>Spaarpot vakantie</h2><b class="spaar-saldo">${eur(st.saldo)}</b></div>
    <div class="regel"><span>${st.jaar}: ${eur(st.gespaardDitJaar)} van ${eur(st.jaarDoel)}</span><small>verwacht nu ${eur(st.verwachtDitJaar)}</small></div>
    <div class="balk"><div class="vul ${st.gespaardDitJaar >= st.verwachtDitJaar ? "groen" : "blauw"}" style="width:${pctJaar}%"></div></div>
    <div class="vakjes">${st.rij.slice(-12).map((x) => `<div class="vakje ${x.status}" title="${esc(periodeNaam(x.maand))}: ${uitleg[x.status]}${x.storting ? `, ${eur(x.storting)} gezet` : ""}${x.opname ? `, ${eur(x.opname)} opgenomen` : ""}"><span>${afk(x.maand)}</span></div>`).join("")}</div>
    <div class="spaar-tekst"><b>${st.gelukt} van ${st.afgerond}</b> maanden gelukt${st.reeks > 1 ? ` · <b>${st.reeks} op rij</b>` : ""}</div>
  </div>`;
}

function lijstHtml(lijst) {
  if (!lijst.length) return `<div class="lijst"><small>Geen boekingen</small></div>`;
  return `<div class="lijst">${[...lijst].sort((a, b) => b.datum.localeCompare(a.datum)).map((b) =>
    `<div class="boeking"><div><small>${esc(b.datum)} · ${rekNaam(b.rekening)}</small><div>${esc(b.tegenpartij)}</div></div>
     <div class="rechts"><b class="${b.bedrag < 0 ? "" : "pos"}">${eur2(b.bedrag)}</b>${b.potje === spaarpot.potje && b.bedrag > 0 && isEigenaar()
       ? `<button class="link opname" data-id="${esc(b.id)}">${b.opnameVoorVakantie === false ? "aangebroken" : b.opnameVoorVakantie === true ? "voor vakantie ✓" : "auto"} ↻</button>` : ""}<button class="link wijzig" data-id="${esc(b.id)}">wijzig</button></div></div>`).join("")}</div>`;
}

function koppelWijzig(el) {
  el.querySelectorAll(".opname").forEach((btn) => btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const b = S.boekingen.get(btn.dataset.id);
    // auto → voor vakantie → aangebroken → auto
    const volgende = b.opnameVoorVakantie === undefined || b.opnameVoorVakantie === null ? true : b.opnameVoorVakantie === true ? false : null;
    await updateDoc(doc(db, "boekingen", b.id), { opnameVoorVakantie: volgende });
    b.opnameVoorVakantie = volgende;
    await schrijfSamenvatting();
    render();
  }));
  el.querySelectorAll(".wijzig").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = S.boekingen.get(btn.dataset.id);
    const rij = btn.closest(".boeking");
    rij.outerHTML = toewijsKaart(b);
    koppelToewijs(el);
  }));
}

// ---------- Toewijzen ----------
function potjeOpties(huidig) {
  return potjeLijst().filter((p) => p.soort !== "toewijzen" && (isEigenaar() || !["zakelijk", "inkomen"].includes(p.soort)))
    .map((p) => `<option value="${esc(p.code)}" ${p.code === huidig ? "selected" : ""}>${esc(p.naam)}</option>`).join("");
}

function toewijsKaart(b) {
  return `<div class="toewijs" data-id="${esc(b.id)}">
    <div class="boeking"><div><small>${esc(b.datum)} · ${rekNaam(b.rekening)}</small><div><b>${esc(b.tegenpartij)}</b></div>
      <small class="oms">${esc(b.omschrijving.slice(0, 140))}</small></div><div class="rechts"><b class="${b.bedrag < 0 ? "" : "pos"}">${eur2(b.bedrag)}</b></div></div>
    <div class="toewijs-acties"><select>${b.potje === "toewijzen" ? `<option value="">Kies een potje…</option>` : ""}${potjeOpties(b.potje)}</select>
      <label><input type="checkbox" checked> onthoud voor “${esc(b.tegenpartij.slice(0, 30))}”</label>
      <button class="knop">Opslaan</button></div></div>`;
}

function renderToewijzen(el) {
  const lijst = [...S.boekingen.values()].filter((b) => b.potje === "toewijzen").sort((a, b) => b.datum.localeCompare(a.datum));
  el.innerHTML = lijst.length
    ? `<p class="uitleg">Kies een potje. Met “onthoud” maakt de app een regel, zodat dezelfde tegenpartij voortaan vanzelf goed gaat.</p>${lijst.map(toewijsKaart).join("")}`
    : `<div class="kaart"><h2>Alles is toegewezen</h2><p>Niets te doen.</p></div>`;
  koppelToewijs(el);
}

function koppelToewijs(el) {
  el.querySelectorAll(".toewijs").forEach((k) => {
    k.querySelector("button").addEventListener("click", async () => {
      const potje = k.querySelector("select").value;
      if (!potje) return melding("Kies eerst een potje.", "fout");
      const onthoud = k.querySelector("input").checked;
      await wijsToe(S.boekingen.get(k.dataset.id), potje, onthoud);
    });
  });
}

async function wijsToe(b, potje, onthoud) {
  const door = S.user.email;
  const wijzigingen = [{ b, potje }];
  if (onthoud && b.tegenpartij) {
    const regel = { rekening: b.rekening, bevat: b.tegenpartij, potje, volgorde: -Date.now(), door, op: serverTimestamp() };
    const ref = await addDoc(collection(db, "regels"), regel);
    S.regels = sorteerRegels([...S.regels, { ...regel, id: ref.id }]);
    for (const x of S.boekingen.values()) {
      if (x.id !== b.id && x.potje === "toewijzen" && x.rekening === b.rekening && x.tegenpartij === b.tegenpartij) wijzigingen.push({ b: x, potje });
    }
  }
  await inBatches(wijzigingen, (batch, w) => batch.update(doc(db, "boekingen", w.b.id), { potje: w.potje, toegewezenDoor: door, toegewezenOp: serverTimestamp() }));
  wijzigingen.forEach((w) => Object.assign(w.b, { potje: w.potje, toegewezenDoor: door }));
  await schrijfSamenvatting();
  melding(`${wijzigingen.length} boeking${wijzigingen.length > 1 ? "en" : ""} naar ${potjeNaam(potje)}.`, "ok");
  render();
}

// ---------- Importeren ----------
function renderImport(el) {
  const imp = S.import;
  el.innerHTML = `
    <div class="kaart"><h2>Bankexport uploaden</h2>
      <p>${isEigenaar() ? "" : "Jij kunt de Rabo-export uploaden. "}ABN: <b>.xls</b> uit Internet Bankieren (Mutaties downloaden). Rabo: <b>.csv</b> (Transacties downloaden). Overlap met eerdere uploads is prima: dubbele boekingen worden overgeslagen.</p>
      <input type="file" id="bestand" accept=".xls,.xlsx,.csv,.txt"></div>
    ${imp ? `<div class="kaart"><h2>Voorvertoning ${rekNaam(imp.rekening)}</h2>
      <div class="regel"><span>Periode</span><b>${esc(imp.van)} t/m ${esc(imp.tot)}</b></div>
      <div class="regel"><span>Nieuw</span><b>${imp.nieuw.length}</b></div>
      <div class="regel"><span>Al aanwezig (overgeslagen)</span><b>${imp.dubbel}</b></div>
      ${imp.teOud ? `<div class="regel"><span>Van vóór ${esc(startDatum)} (overgeslagen)</span><b>${imp.teOud}</b></div>` : ""}
      <div class="regel"><span>Nieuw en nog toe te wijzen</span><b>${imp.nieuw.filter((b) => b.potje === "toewijzen").length}</b></div>
      ${imp.interneBreuken ? `<p class="neg">Let op: ${imp.interneBreuken} keer sluit het saldo binnen dit bestand niet aan. Mogelijk is het bestand onvolledig.</p>` : ""}
      ${imp.gat ? `<p class="neg">${esc(imp.gat)}</p>` : ""}
      ${!S.regels.length ? `<p class="neg">Er staan nog geen regels in. Zet eerst bij Instellingen de startregels erin, anders komt alles bij Toewijzen.</p>` : ""}
      <button class="knop" id="opslaan" ${imp.nieuw.length ? "" : "disabled"}>${imp.nieuw.length} boekingen opslaan</button>
      <button class="link" id="annuleer">annuleren</button></div>` : ""}
    <div class="kaart"><h2>Stand per rekening</h2>${(isEigenaar() ? ["abn", "rabo"] : ["rabo"]).map((r) => S.rekeningen[r]
      ? `<div class="regel"><span>${rekNaam(r)}</span><span>t/m ${esc(S.rekeningen[r].totDatum)} · ${eur2(S.rekeningen[r].eindSaldo)}</span></div>`
      : `<div class="regel"><span>${rekNaam(r)}</span><small>nog niets</small></div>`).join("")}</div>`;

  $("#bestand").addEventListener("change", (e) => leesBestand(e.target.files[0]));
  $("#annuleer")?.addEventListener("click", () => { S.import = null; render(); });
  $("#opslaan")?.addEventListener("click", slaImportOp);
}

async function leesBestand(file) {
  if (!file) return;
  try {
    let res;
    if (/\.(xls|xlsx)$/i.test(file.name)) {
      if (!isEigenaar()) throw new Error("ABN-bestanden kan alleen Ricky importeren.");
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
      res = parseAbnRows(rows);
    } else {
      const buf = await file.arrayBuffer();
      let tekst = new TextDecoder("utf-8").decode(buf);
      if (tekst.includes("�")) tekst = new TextDecoder("windows-1252").decode(buf);
      res = parseRaboCsv(tekst);
    }
    const nieuw = [];
    let dubbel = 0, teOud = 0;
    for (const b of res.boekingen) {
      if (b.datum < startDatum) { teOud++; continue; }
      if (S.boekingen.has(b.id)) { dubbel++; continue; }
      nieuw.push({ ...b, ...deelIn(b, S.regels, spaarpot) });
    }
    S.import = { ...res, nieuw, dubbel, teOud, gat: gatControle(S.rekeningen[res.rekening], res), bestand: file.name };
    melding("");
  } catch (e) {
    S.import = null;
    melding(e.message, "fout");
  }
  render();
}

async function slaImportOp() {
  const imp = S.import;
  const door = S.user.email;
  $("#opslaan").disabled = true;
  melding(`Opslaan van ${imp.nieuw.length} boekingen…`);
  await inBatches(imp.nieuw, (batch, b) => batch.set(doc(db, "boekingen", b.id),
    { ...b, toegewezenDoor: b.potje === "toewijzen" ? null : "regel", geimporteerdDoor: door, geimporteerdOp: serverTimestamp() }));
  imp.nieuw.forEach((b) => S.boekingen.set(b.id, { ...b, toegewezenDoor: b.potje === "toewijzen" ? null : "regel" }));
  const oud = S.rekeningen[imp.rekening];
  if (!oud || !oud.totDatum || imp.tot >= oud.totDatum) {
    const stand = { totDatum: imp.tot, eindSaldo: imp.eindSaldo };
    await setDoc(doc(db, "rekeningen", imp.rekening), stand, { merge: true });
    S.rekeningen[imp.rekening] = { ...oud, ...stand };
  }
  await addDoc(collection(db, "imports"), { rekening: imp.rekening, bestand: imp.bestand, van: imp.van, tot: imp.tot,
    nieuw: imp.nieuw.length, dubbel: imp.dubbel, door, op: serverTimestamp() });
  await schrijfSamenvatting();
  melding(`${imp.nieuw.length} boekingen opgeslagen.`, "ok");
  S.import = null;
  S.maand = alleMaanden()[0];
  render();
}

// ---------- Instellingen ----------
function renderInstellingen(el) {
  el.innerHTML = `
    <div class="kaart"><h2>Budgetten per maand</h2>
      ${potjeLijst().filter((p) => ["uitgave", "spaar"].includes(p.soort)).map((p) =>
        `<div class="regel"><span>${esc(p.naam)} <small>${rekNaam(p.rekening)}</small></span><input type="number" inputmode="numeric" class="budget" data-code="${esc(p.code)}" value="${p.budget}"></div>`).join("")}
      ${S.potjes[spaarpot.potje] ? `<div class="regel"><span>Saldo spaarrekening vóór de eerste geïmporteerde overboeking</span><input type="number" inputmode="decimal" id="startSaldo" value="${S.potjes[spaarpot.potje].startSaldo || 0}"></div>` : ""}
      <button class="knop" id="budgetOpslaan">Budgetten opslaan</button></div>
    <div class="kaart"><h2>Regels (${S.regels.length})</h2>
      <p>Startregels inladen: kies <b>regels.json</b> uit de map Potjes/data.</p>
      <input type="file" id="regelsBestand" accept=".json">
      <p>Na het aanpassen van regels: deel alle boekingen opnieuw in. Wat jullie zelf hebben toegewezen, blijft staan.</p>
      <button class="knop" id="opnieuw">Opnieuw indelen</button></div>`;

  $("#budgetOpslaan").addEventListener("click", async () => {
    const items = [...el.querySelectorAll(".budget")].map((i) => ({ code: i.dataset.code, budget: Number(i.value) || 0 }));
    await inBatches(items, (b, it) => b.update(doc(db, "potjes", it.code), { budget: it.budget }));
    items.forEach((it) => (S.potjes[it.code].budget = it.budget));
    const ss = $("#startSaldo");
    if (ss) {
      const v = Number(ss.value) || 0;
      await updateDoc(doc(db, "potjes", spaarpot.potje), { startSaldo: v });
      S.potjes[spaarpot.potje].startSaldo = v;
      await schrijfSamenvatting();
    }
    melding("Budgetten opgeslagen.", "ok");
  });
  $("#regelsBestand").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const lijst = (data.regels || data).map((r, i) => ({ rekening: r.rekening, bevat: r.bevat, potje: r.potje,
        label: r.label || null, woordbegin: !!r.woordbegin, volgorde: r.volgorde ?? i + 1 }));
      const sleutel = (r) => `${r.rekening}|${String(r.bevat).toLowerCase()}`;
      const bestaand = new Map(S.regels.map((r) => [sleutel(r), r]));
      const nieuw = [], gewijzigd = [];
      for (const r of lijst) {
        const oud = bestaand.get(sleutel(r));
        if (!oud) nieuw.push(r);
        else if (oud.potje !== r.potje || (oud.label ?? null) !== r.label || !!oud.woordbegin !== r.woordbegin || oud.volgorde !== r.volgorde) gewijzigd.push({ oud, r });
      }
      const refs = nieuw.map(() => doc(collection(db, "regels")));
      await inBatches(nieuw.map((r, i) => [refs[i], r]), (b, [ref, r]) => b.set(ref, r));
      await inBatches(gewijzigd, (b, { oud, r }) => b.update(doc(db, "regels", oud.id), { potje: r.potje, label: r.label, woordbegin: r.woordbegin, volgorde: r.volgorde }));
      gewijzigd.forEach(({ oud, r }) => Object.assign(oud, r));
      S.regels = sorteerRegels([...S.regels, ...nieuw.map((r, i) => ({ ...r, id: refs[i].id }))]);
      melding(`${nieuw.length} regels toegevoegd, ${gewijzigd.length} bijgewerkt. Klik nu op "Opnieuw indelen".`, "ok");
      render();
    } catch (err) { melding("Kon regels niet lezen: " + err.message, "fout"); }
  });
  $("#opnieuw").addEventListener("click", async () => {
    const wijzig = [];
    for (const b of S.boekingen.values()) {
      if (b.toegewezenDoor && b.toegewezenDoor !== "regel") continue; // handmatig: laten staan
      const d = deelIn(b, S.regels, spaarpot);
      if (d.potje !== b.potje || d.label !== (b.label ?? null)) wijzig.push({ b, d });
    }
    await inBatches(wijzig, (batch, w) => batch.update(doc(db, "boekingen", w.b.id),
      { potje: w.d.potje, label: w.d.label, toegewezenDoor: w.d.potje === "toewijzen" ? null : "regel" }));
    wijzig.forEach((w) => Object.assign(w.b, { potje: w.d.potje, label: w.d.label, toegewezenDoor: w.d.potje === "toewijzen" ? null : "regel" }));
    await schrijfSamenvatting();
    melding(`${wijzig.length} boekingen opnieuw ingedeeld.`, "ok");
    render();
  });
}
