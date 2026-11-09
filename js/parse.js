// Pure functies om bankexports te lezen. Geen Firebase, zodat ze los te testen zijn.

export const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function parseBedrag(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/\s/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const r2 = (n) => Math.round(n * 100) / 100;

function datumUitAbn(v) {
  const s = String(Math.round(Number(v)));
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

// Haal tegenpartij en tegenrekening uit een ABN-omschrijving.
export function abnTegenpartij(omschrijving) {
  const d = norm(omschrijving);
  let naam = "", iban = "";
  let m =
    d.match(/\/NAME\/(.*?)\/(?:REMI|EREF|MARF|CSID|IBAN|BIC|ISDT|RTRN|$)/) ||
    d.match(/Naam:\s*(.*?)\s*(?:Omschrijving:|Machtiging:|Kenmerk:|IBAN:|Betalingskenm\.:|$)/) ||
    d.match(/^(?:BEA|GEA|eCom),\s*(?:Apple Pay|Google Pay|Betaalpas|Pas)?\s*(.*?),\s*PAS/i) ||
    d.match(/^eCom,\s*(?:Apple Pay\s*)?(.*?)\s+NR:/i);
  if (m) naam = norm(m[1]);
  else if (/^ABN AMRO Bank/i.test(d)) naam = "ABN AMRO Bank";
  else naam = d.slice(0, 40);
  const ib = d.match(/\/IBAN\/([A-Z]{2}\d{2}[A-Z0-9 ]{10,30}?)\//) || d.match(/IBAN:\s*([A-Z]{2}\d{2}[A-Z0-9]{10,30})/);
  if (ib) iban = ib[1].replace(/\s/g, "");
  return { naam, iban };
}

const veiligeId = (s) => s.replace(/[^\w.-]/g, "_");

// rows = array van arrays uit SheetJS (header: 1), inclusief kopregel.
export function parseAbnRows(rows) {
  const hi = rows.findIndex((r) => r && r.some((c) => String(c).trim() === "Transactiedatum"));
  if (hi < 0) throw new Error("Geen ABN-export: kolom 'Transactiedatum' niet gevonden.");
  const kop = rows[hi].map((c) => String(c).trim());
  const k = (naam) => {
    const i = kop.indexOf(naam);
    if (i < 0) throw new Error(`Kolom '${naam}' ontbreekt in de ABN-export.`);
    return i;
  };
  const iRek = k("Rekeningnummer"), iDat = k("Transactiedatum"), iBegin = k("Beginsaldo"),
    iEind = k("Eindsaldo"), iBedrag = k("Transactiebedrag"), iOms = k("Omschrijving");
  const boekingen = [];
  const telPerSleutel = {};
  for (const r of rows.slice(hi + 1)) {
    if (!r || r[iDat] === undefined || r[iDat] === "") continue;
    const datum = datumUitAbn(r[iDat]);
    const bedrag = r2(parseBedrag(r[iBedrag]));
    const beginsaldo = r2(parseBedrag(r[iBegin]));
    const eindsaldo = r2(parseBedrag(r[iEind]));
    const omschrijving = norm(r[iOms]);
    const { naam, iban } = abnTegenpartij(omschrijving);
    const basis = `abn_${datum}_${bedrag.toFixed(2)}_${beginsaldo.toFixed(2)}_${eindsaldo.toFixed(2)}`;
    telPerSleutel[basis] = (telPerSleutel[basis] || 0) + 1;
    const id = veiligeId(telPerSleutel[basis] > 1 ? `${basis}_${telPerSleutel[basis]}` : basis);
    boekingen.push({ id, rekening: "abn", rekeningnummer: String(r[iRek]).replace(/\.0$/, ""), datum, bedrag,
      beginsaldo, eindsaldo, tegenpartij: naam, tegenrekening: iban, omschrijving });
  }
  // Interne controle: beginsaldo moet gelijk zijn aan het vorige eindsaldo.
  let breuken = 0;
  for (let i = 1; i < boekingen.length; i++) {
    if (Math.abs(boekingen[i].beginsaldo - boekingen[i - 1].eindsaldo) > 0.005) breuken++;
  }
  return samenvatting("abn", boekingen, breuken,
    boekingen.length ? boekingen[0].beginsaldo : 0,
    boekingen.length ? boekingen.at(-1).eindsaldo : 0);
}

// Eenvoudige, robuuste CSV-parser (aanhalingstekens, komma of puntkomma).
export function parseCsv(text) {
  const eersteRegel = text.split(/\r?\n/, 1)[0];
  const sep = (eersteRegel.match(/;/g) || []).length > (eersteRegel.match(/,/g) || []).length ? ";" : ",";
  const rijen = [];
  let rij = [], veld = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { veld += '"'; i++; } else inQ = false; }
      else veld += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { rij.push(veld); veld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rij.push(veld); veld = "";
      if (rij.some((v) => v !== "")) rijen.push(rij);
      rij = [];
    } else veld += c;
  }
  if (veld !== "" || rij.length) { rij.push(veld); if (rij.some((v) => v !== "")) rijen.push(rij); }
  return rijen;
}

export function parseRaboCsv(text) {
  const rijen = parseCsv(text.replace(/^﻿/, ""));
  if (!rijen.length) throw new Error("Leeg bestand.");
  const kop = rijen[0].map((c) => norm(c));
  const zoek = (...namen) => {
    for (const n of namen) { const i = kop.findIndex((k) => k.toLowerCase() === n.toLowerCase()); if (i >= 0) return i; }
    return -1;
  };
  const iIban = zoek("IBAN/BBAN"), iVolg = zoek("Volgnr"), iDat = zoek("Datum"), iBedrag = zoek("Bedrag"),
    iSaldo = zoek("Saldo na trn"), iTegen = zoek("Tegenrekening IBAN/BBAN"), iNaam = zoek("Naam tegenpartij"),
    iUit = zoek("Naam uiteindelijke partij"), iRef = zoek("Transactiereferentie");
  const iOms = [zoek("Omschrijving-1"), zoek("Omschrijving-2"), zoek("Omschrijving-3"), zoek("Omschrijving")].filter((i) => i >= 0);
  if (iDat < 0 || iBedrag < 0 || (iVolg < 0 && iRef < 0)) {
    throw new Error("Geen Rabo-export herkend: kolommen 'Datum', 'Bedrag' en 'Volgnr' niet gevonden. Kopregel: " + kop.slice(0, 8).join(", "));
  }
  const boekingen = [];
  for (const r of rijen.slice(1)) {
    if (!r[iDat]) continue;
    const ruweDatum = norm(r[iDat]);
    const datum = /^\d{2}-\d{2}-\d{4}$/.test(ruweDatum) ? ruweDatum.split("-").reverse().join("-") : ruweDatum;
    const bedrag = r2(parseBedrag(r[iBedrag]));
    const saldo = iSaldo >= 0 ? r2(parseBedrag(r[iSaldo])) : NaN;
    const volgnr = iVolg >= 0 ? norm(r[iVolg]) : "";
    const naam = norm((iNaam >= 0 && r[iNaam]) || (iUit >= 0 && r[iUit]) || "");
    const omschrijving = norm(iOms.map((i) => r[i] || "").join(" "));
    const ref = iRef >= 0 ? norm(r[iRef]) : "";
    const id = veiligeId(`rabo_${volgnr || ref || `${datum}_${bedrag}_${saldo}`}`);
    boekingen.push({ id, rekening: "rabo", rekeningnummer: iIban >= 0 ? norm(r[iIban]) : "", datum, bedrag,
      saldo, volgnr, tegenpartij: naam || omschrijving.slice(0, 40), tegenrekening: iTegen >= 0 ? norm(r[iTegen]) : "",
      omschrijving });
  }
  boekingen.sort((a, b) => (a.volgnr && b.volgnr ? Number(a.volgnr) - Number(b.volgnr) : a.datum.localeCompare(b.datum)));
  let breuken = 0;
  for (let i = 1; i < boekingen.length; i++) {
    const a = boekingen[i - 1], b = boekingen[i];
    if (Number.isFinite(a.saldo) && Number.isFinite(b.saldo) && Math.abs(a.saldo + b.bedrag - b.saldo) > 0.005) breuken++;
  }
  const eerste = boekingen[0];
  return samenvatting("rabo", boekingen, breuken,
    eerste && Number.isFinite(eerste.saldo) ? r2(eerste.saldo - eerste.bedrag) : NaN,
    boekingen.length ? boekingen.at(-1).saldo : NaN);
}

function samenvatting(rekening, boekingen, breuken, beginSaldo, eindSaldo) {
  const data = boekingen.map((b) => b.datum).sort();
  return { rekening, boekingen, interneBreuken: breuken, beginSaldo, eindSaldo,
    van: data[0] || null, tot: data.at(-1) || null };
}

// Signaleer een gat tussen wat er al is en een nieuwe import.
export function gatControle(bestaand, nieuw) {
  if (!bestaand || !bestaand.totDatum || !nieuw.van) return null;
  if (nieuw.van <= bestaand.totDatum) return null; // overlap of aansluitend op dezelfde dag: prima
  if (Number.isFinite(bestaand.eindSaldo) && Number.isFinite(nieuw.beginSaldo) &&
      Math.abs(bestaand.eindSaldo - nieuw.beginSaldo) <= 0.005) return null; // saldo sluit aan: niets gemist
  return `Er mist mogelijk data tussen ${bestaand.totDatum} en ${nieuw.van}: het saldo sluit niet aan (${bestaand.eindSaldo} tegenover ${nieuw.beginSaldo}).`;
}

export function isStorno(b) {
  return /terugboeking|onvoldoende saldo|storno/i.test(b.omschrijving || "");
}
