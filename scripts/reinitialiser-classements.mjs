#!/usr/bin/env node
// Remise à zéro des classements de la saison en cours (lancement officiel).
//
// Usage :
//   npm run reinitialiser-classements                          → aperçu, ne change rien
//   npm run reinitialiser-classements -- --confirmer           → exécute sur la base en ligne
//   npm run reinitialiser-classements -- --confirmer --nom "Saison 1"
//   … --local                                                  → base de développement
//
// Efface les statistiques de la saison en cours et fait démarrer la saison maintenant.
// Ne touche ni aux comptes, ni aux soldes, ni aux achats, ni aux cosmétiques.

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const cible = args.includes("--local") ? "--local" : "--remote";
const confirmer = args.includes("--confirmer");
const iNom = args.indexOf("--nom");
const nom = iNom >= 0 ? args[iNom + 1] : null;
if (nom !== null && !/^[\p{L}\p{N} '’-]{1,40}$/u.test(nom ?? "")) {
  console.error("Nom de saison invalide (lettres, chiffres, espaces, 40 caractères au plus).");
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
const saisonCourante = `(SELECT id FROM saisons WHERE debut <= ${maintenant} AND fin > ${maintenant} ORDER BY id DESC LIMIT 1)`;
const [apercu] = d1(
  `SELECT s.id, s.nom, (SELECT COUNT(*) FROM stats_saison WHERE saison_id = s.id) AS lignes FROM saisons s WHERE s.id = ${saisonCourante};`,
);
const saison = apercu.results[0];
if (!saison) {
  console.error("Aucune saison en cours : rien à remettre à zéro.");
  process.exit(1);
}
console.log(`Base : ${cible === "--remote" ? "EN LIGNE" : "locale"}`);
console.log(`Saison en cours : « ${saison.nom} » (n° ${saison.id}), ${saison.lignes} joueur(s) au classement.`);
if (!confirmer) {
  console.log("\nAperçu seulement. Pour remettre le classement à zéro :\n  npm run reinitialiser-classements -- --confirmer" + (cible === "--local" ? " --local" : ""));
  process.exit(0);
}
const renommer = nom ? `, nom = '${nom.replace(/'/g, "''")}'` : "";
d1(`DELETE FROM stats_saison WHERE saison_id = ${saison.id}; UPDATE saisons SET debut = ${maintenant}${renommer} WHERE id = ${saison.id};`);
console.log(`\nC'est fait : classement vide, saison${nom ? ` renommée « ${nom} » et` : ""} démarrée maintenant.`);
