// Spaarpot: stortingen en opnames per maand, gelukte maanden en reeks. Pure functies.

const r2 = (n) => Math.round(n * 100) / 100;

export function volgendeMaand(m) {
  const [j, mm] = m.split("-").map(Number);
  return mm === 12 ? `${j + 1}-01` : `${j}-${String(mm + 1).padStart(2, "0")}`;
}

function dagenTussen(a, b) {
  return Math.abs((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 86400000);
}

// Een opname telt niet als "aangebroken" als hij is gemarkeerd als vakantiegeld,
// of als er binnen 10 dagen een vakantie-uitgave tegenover staat.
export function isVakantieOpname(opname, vakantieUitgaven) {
  if (opname.opnameVoorVakantie === true) return true;
  if (opname.opnameVoorVakantie === false) return false;
  return vakantieUitgaven.some((u) => dagenTussen(u.datum, opname.datum) <= 10);
}

// boekingen: alle boekingen; potje: code van de spaarpot; uitgavePotje: code van de vakantie-uitgaven.
export function maandOverzicht(boekingen, potje, uitgavePotje) {
  const pot = boekingen.filter((b) => b.potje === potje);
  const uitgaven = boekingen.filter((b) => b.potje === uitgavePotje && b.bedrag < 0);
  const maanden = {};
  let totaal = 0;
  for (const b of pot) {
    const m = b.datum.slice(0, 7);
    const x = (maanden[m] ||= { storting: 0, opname: 0, aangebroken: false });
    totaal += -b.bedrag; // van de betaalrekening af = in de pot
    if (b.bedrag < 0) x.storting = r2(x.storting - b.bedrag);
    else {
      x.opname = r2(x.opname + b.bedrag);
      if (!isVakantieOpname(b, uitgaven)) x.aangebroken = true;
    }
  }
  return { maanden, netto: r2(totaal) };
}

// overzicht: uitkomst van maandOverzicht (of de samenvatting daarvan).
export function spaarStatus(overzicht, { startMaand, huidigeMaand, maandDoel, jaarDoel, startSaldo = 0 }) {
  const rij = [];
  for (let m = startMaand; m <= huidigeMaand; m = volgendeMaand(m)) {
    const x = overzicht.maanden[m] || { storting: 0, opname: 0, aangebroken: false };
    const gelukt = x.storting >= maandDoel - 0.005 && !x.aangebroken;
    const status = gelukt ? "gelukt" : x.aangebroken ? "aangebroken" : m === huidigeMaand ? "bezig" : "gemist";
    rij.push({ maand: m, ...x, status });
  }
  const afgerond = rij.filter((x) => x.status !== "bezig");
  const gelukt = afgerond.filter((x) => x.status === "gelukt").length;
  let reeks = 0;
  for (let i = rij.length - 1; i >= 0; i--) {
    if (rij[i].status === "bezig") continue;
    if (rij[i].status === "gelukt") reeks++; else break;
  }
  const jaar = huidigeMaand.slice(0, 4);
  const ditJaar = rij.filter((x) => x.maand.startsWith(jaar));
  const gespaardDitJaar = r2(Object.entries(overzicht.maanden)
    .filter(([m]) => m.startsWith(jaar)).reduce((s, [, x]) => s + x.storting, 0));
  return {
    rij, gelukt, afgerond: afgerond.length, reeks, jaar, jaarDoel,
    gespaardDitJaar, verwachtDitJaar: r2(ditJaar.length * maandDoel),
    saldo: r2(startSaldo + overzicht.netto),
  };
}
