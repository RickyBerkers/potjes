// Budgetmaanden lopen van salaris tot salaris: van de startdag (27e) tot en met de 26e van de maand erna.
// Een periode heet naar de maand waarin hij eindigt: 27 nov t/m 26 dec = "december".
import { periodeStartDag } from "./config.js";

const pad = (n) => String(n).padStart(2, "0");

// vooruit = hoeveel dagen vóór de startdag een boeking al bij de nieuwe periode hoort.
export function periodeVan(datum, vooruit = 0) {
  let [j, m, d] = datum.split("-").map(Number);
  if (d >= periodeStartDag - vooruit) {
    m += 1;
    if (m > 12) { m = 1; j += 1; }
  }
  return `${j}-${pad(m)}`;
}

// Salaris dat door een weekend eerder komt (tot 5 dagen) en de toeslag van rond de 20e
// horen bij de periode die op de 27e begint: dat geld is bedoeld voor die periode.
export const periodeVanBoeking = (b) =>
  periodeVan(b.datum, b.potje === "in-salaris" ? 5 : b.potje === "in-toeslag" ? 12 : 0);

export function volgendePeriode(p) {
  const [j, m] = p.split("-").map(Number);
  return m === 12 ? `${j + 1}-01` : `${j}-${pad(m + 1)}`;
}


export function periodeVandaag() {
  const n = new Date();
  return periodeVan(`${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`);
}

export function periodeNaam(p) {
  const [j, m] = p.split("-").map(Number);
  const eind = new Date(j, m - 1, periodeStartDag - 1);
  const start = new Date(j, m - 2, periodeStartDag);
  const kort = (d) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }).replace(".", "");
  const naam = new Date(j, m - 1, 15).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  return `${naam} (${kort(start)} t/m ${kort(eind)})`;
}

// Hoeveel van de periode is verstreken (0 tot 1).
export function verstreken(p) {
  const [j, m] = p.split("-").map(Number);
  const start = new Date(j, m - 2, periodeStartDag), eind = new Date(j, m - 1, periodeStartDag);
  return Math.min(1, Math.max(0, (Date.now() - start) / (eind - start)));
}
