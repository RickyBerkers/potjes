// Standaard potjes. Worden bij de eerste start in Firestore gezet; daarna aanpasbaar in Instellingen.
// soort: uitgave | spaar | inkomen | intern | apart | zakelijk | toewijzen
export const standaardPotjes = [
  { code: "kinderopvang", naam: "Kinderopvang", rekening: "rabo", budget: 2967, soort: "uitgave", volgorde: 1 },
  { code: "boodschappen", naam: "Boodschappen en drogist", rekening: "rabo", budget: 1050, soort: "uitgave", volgorde: 2 },
  { code: "huishouden-kinderen", naam: "Huishouden, kleding, kinderen", rekening: "rabo", budget: 250, soort: "uitgave", volgorde: 3 },
  { code: "energie-water", naam: "Energie en water", rekening: "rabo", budget: 280, soort: "uitgave", volgorde: 4 },
  { code: "gemeentebelasting", naam: "Gemeentebelasting", rekening: "rabo", budget: 155, soort: "uitgave", volgorde: 5 },
  { code: "internet-tv", naam: "Internet, tv, streaming", rekening: "rabo", budget: 50, soort: "uitgave", volgorde: 6 },
  { code: "bank", naam: "Bankkosten", rekening: "beide", budget: 5, soort: "uitgave", volgorde: 7 },
  { code: "lening-duo", naam: "Lening en DUO", rekening: "abn", budget: 310, soort: "uitgave", volgorde: 8 },
  { code: "vaste-lasten-abn", naam: "Vaste lasten ABN (zorg, telefoon)", rekening: "abn", budget: 280, soort: "uitgave", volgorde: 9 },
  { code: "leefgeld", naam: "Leefgeld", rekening: "abn", budget: 900, soort: "uitgave", volgorde: 10 },
  { code: "vakantie", naam: "Vakantie en uitjes", rekening: "abn", budget: 300, soort: "spaar", volgorde: 11 },
  { code: "buffer", naam: "Buffer", rekening: "abn", budget: 250, soort: "spaar", volgorde: 12 },
  { code: "bedrijfskosten", naam: "Bedrijfskosten", rekening: "abn", budget: 0, soort: "zakelijk", volgorde: 20 },
  { code: "belasting", naam: "Belastingdienst (btw/IB)", rekening: "abn", budget: 0, soort: "zakelijk", volgorde: 21 },
  { code: "in-salaris", naam: "Salaris", rekening: "abn", budget: 0, soort: "inkomen", volgorde: 30 },
  { code: "in-toeslag", naam: "Kinderopvangtoeslag", rekening: "abn", budget: 0, soort: "inkomen", volgorde: 31 },
  { code: "in-omzet", naam: "Omzet eigen bedrijf", rekening: "abn", budget: 0, soort: "inkomen", volgorde: 32 },
  { code: "intern", naam: "Eigen overboeking (ABN ↔ Rabo)", rekening: "beide", budget: 0, soort: "intern", volgorde: 40 },
  { code: "szg-doorgeefgeld", naam: "SZG doorgeefgeld", rekening: "abn", budget: 0, soort: "apart", volgorde: 41 },
  { code: "toewijzen", naam: "Nog toewijzen", rekening: "beide", budget: 0, soort: "toewijzen", volgorde: 99 },
];
