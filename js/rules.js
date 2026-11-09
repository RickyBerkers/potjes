// Regels toepassen: de eerste regel (laagste volgorde) die past, wint.
import { isStorno } from "./parse.js";

export function sorteerRegels(regels) {
  return [...regels].sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0));
}

export function zoekRegel(boeking, gesorteerdeRegels) {
  const hooiberg = `${boeking.tegenpartij || ""} ${boeking.omschrijving || ""}`.toLowerCase();
  for (const r of gesorteerdeRegels) {
    if (r.rekening !== "beide" && r.rekening !== boeking.rekening) continue;
    if (r.bevat && hooiberg.includes(String(r.bevat).toLowerCase())) return r;
  }
  return null;
}

// Geeft { potje, label, regelId } voor een boeking.
export function deelIn(boeking, gesorteerdeRegels) {
  const r = zoekRegel(boeking, gesorteerdeRegels);
  const label = isStorno(boeking) ? "storno" : (r && r.label) || null;
  return { potje: r ? r.potje : "toewijzen", label, regelId: r ? r.id || null : null };
}
