# Potjes

Huishoudbudget van Ricky en Dorien. Statische site (GitHub Pages) met Firebase (Google-inlog + Firestore).

## Online zetten

1. Upload naar de GitHub-repo `potjes`: `index.html`, `css/`, `js/`, `README.md`, `firestore.rules`, `.gitignore`. **Niet** de map `data/`.
2. Repo > Settings > Pages > Source: *Deploy from a branch*, branch `main`, map `/ (root)`.
3. Na een minuut staat de site op https://rickyberkers.github.io/potjes/

## Eerste keer gebruiken

1. Inloggen met Google.
2. Instellingen > kies `data/regels.json` (startregels).
3. Importeren > ABN `.xls` en Rabo `.csv`.
4. Toewijzen: wat de regels niet kennen, wijs je één keer toe.

## Bestanden

- `js/config.js`: Firebase-config, toegestane e-mailadressen, startdatum, doelbedrag Rabo.
- `js/potjes.js`: standaard potjes en budgetten (alleen bij de eerste start; daarna in Instellingen).
- `js/parse.js`: inlezen van ABN `.xls` en Rabo `.csv`, ontdubbelen, gatencontrole.
- `js/rules.js`: regels toepassen.
- `js/app.js`: de app.
- `firestore.rules`: kopie van de beveiligingsregels in Firebase.

Bankdata en `regels.json` komen nooit in de repo (zie `.gitignore`).
