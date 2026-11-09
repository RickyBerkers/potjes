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

export const raboDoelStorting = 4800;

// Boekingen van vóór deze datum worden bij het importeren overgeslagen.
export const startDatum = "2026-01-01";
