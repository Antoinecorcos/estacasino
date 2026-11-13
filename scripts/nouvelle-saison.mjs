#!/usr/bin/env node
// Passage à une nouvelle saison : la saison en cours est clôturée maintenant (son classement reste archivé),
// la nouvelle commence avec un classement vide. Les soldes sont conservés, sauf si --solde est donné
// (remise à niveau ponctuelle, par exemple au lancement de la Saison 1).
//
// Usage :
//   npm run nouvelle-saison -- --nom "Saison 1" --solde 20000                 → aperçu, ne change rien
//   npm run nouvelle-saison -- --nom "Saison 1" --solde 20000 --confirmer     → exécute sur la base en ligne
// Options : --fin AAAA-MM-JJ (fin prévue, par défaut le 31/12/2027), --local (base de développement).

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};
const cible = args.includes("--local") ? "--local" : "--remote";
const confirmer = args.includes("--confirmer");
const nom = option("--nom");
const soldeTexte = option("--solde");
const finTexte = option("--fin");

if (!nom || !/^[\p{L}\p{N} '’-]{1,40}$/u.test(nom)) {
  console.error('Indiquez le nom de la nouvelle saison : --nom "Saison 1"');
  process.exit(1);
}
const solde = soldeTexte === null ? null : Number(soldeTexte);
if (solde !== null && !(Number.isInteger(solde) && solde >= 0 && solde <= 10_000_000)) {
  console.error("--solde doit être un nombre entier de jetons (ex. 20000).");
  process.exit(1);
}
const fin = finTexte ? Date.parse(`${finTexte}T23:00:00Z`) : Date.UTC(2027, 11, 31, 23, 0, 0);
if (!Number.isFinite(fin) || fin <= Date.now()) {
  console.error("--fin doit être une date future au format AAAA-MM-JJ.");
  process.exit(1);
}

const d1 = (sql) =>
  JSON.parse(
    execFileSync("npx", ["wrangler", "d1", "execute", "estacasino", cible, "--json", "--command", sql], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    }),
  );

const maintenant = Date.now();
const [courante, prochainId, joueurs, forfaits] = d1(
  `SELECT id, nom FROM saisons WHERE debut <= ${maintenant} AND fin > ${maintenant} ORDER BY id DESC LIMIT 1;
   SELECT COALESCE(MAX(id), 0) + 1 AS id FROM saisons;
   SELECT COUNT(*) AS n, COALESCE(SUM(solde), 0) AS total FROM joueurs WHERE supprime_le IS NULL;
   SELECT COUNT(*) AS n FROM forfaits_saison WHERE saison_id = (SELECT id FROM saisons WHERE debut <= ${maintenant} AND fin > ${maintenant} ORDER BY id DESC LIMIT 1);`,
);
const saison = courante.results[0];
const id = prochainId.results[0].id;
const { n: nbJoueurs, total } = joueurs.results[0];
const date = (ms) => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

console.log(`Base : ${cible === "--remote" ? "EN LIGNE" : "locale"}`);
console.log(saison ? `Saison clôturée maintenant : « ${saison.nom} » (archivée, son classement reste en base)` : "Aucune saison en cours.");
console.log(`Nouvelle saison : « ${nom} » (n° ${id}), du ${date(maintenant)} au ${date(fin)}, classement vide`);
if (solde !== null) console.log(`Soldes : ${nbJoueurs} joueur(s) remis à ${solde.toLocaleString("fr-FR")} jetons (total actuel : ${Number(total).toLocaleString("fr-FR")})`);
else console.log("Soldes : conservés");
if (forfaits.results[0].n) console.log(`Forfaits saison de « ${saison.nom} » qui expirent : ${forfaits.results[0].n}`);

if (!confirmer) {
  console.log("\nAperçu seulement, rien n'a changé. Ajoutez --confirmer pour exécuter.");
  process.exit(0);
}

const nomSql = nom.replace(/'/g, "''");
const requetes = [
  saison ? `UPDATE saisons SET fin = ${maintenant} WHERE id = ${saison.id};` : "",
  `INSERT INTO saisons (id, nom, debut, fin) VALUES (${id}, '${nomSql}', ${maintenant}, ${fin});`,
];
if (solde !== null) {
  // L'écart est inscrit comme un ajustement, juste avant le début de la saison : l'historique reste juste
  // et la courbe de la nouvelle saison part bien du nouveau solde.
  requetes.push(
    `INSERT INTO transactions_jetons (joueur_id, montant, type, le)
     SELECT id, ${solde} - solde, 'ajustement', ${maintenant - 1} FROM joueurs WHERE supprime_le IS NULL AND solde <> ${solde};`,
    `UPDATE joueurs SET solde = ${solde} WHERE supprime_le IS NULL;`,
  );
}
d1(requetes.join("\n"));
console.log(`\nC'est fait : « ${nom} » a commencé${solde !== null ? `, tous les soldes sont à ${solde.toLocaleString("fr-FR")} jetons` : ""}.`);
