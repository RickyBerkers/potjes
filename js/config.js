// Publieke Firebase web-config (veilig om te delen; beveiliging zit in de Firestore-regels).
export const firebaseConfig = {
  apiKey: "AIzaSyAeWbiY-H5fT6a4Vo1aKJCQjpwBfBzpEI4",
  authDomain: "potjes-fa507.firebaseapp.com",
  projectId: "potjes-fa507",
  storageBucket: "potjes-fa507.firebasestorage.app",
  messagingSenderId: "491419257326",
  appId: "1:491419257326:web:0c0115338f3df6d2e4e6ff"
};

// Moet overeenkomen met de lijst in de Firestore-regels.
export const toegestaneEmails = ["djwicky@gmail.com", "dorienvantuijl1990@gmail.com"];

// Alleen deze gebruiker ziet de ABN-boekingen (ook vastgelegd in de Firestore-regels).
export const eigenaarEmail = "djwicky@gmail.com";

export const raboDoelStorting = 4800;

// Boekingen van vóór deze datum worden bij het importeren overgeslagen.
export const startDatum = "2026-01-01";

// Spaarpot vakantie: overboekingen van/naar deze ABN-spaarrekening (NL46 ABNA 0895 1447 35).
export const spaarpot = {
  potje: "vakantie",
  uitgavePotje: "vakantie-uitgaven",
  rekeningCijfers: "0895144735",
  maandDoel: 333,
  jaarDoel: 4000,
  startMaand: "2026-12",
};

// Budgetmaand begint op de dag van het salaris (Devapo betaalt de 27e). Toeslag (20e) valt in dezelfde periode.
export const periodeStartDag = 27;
