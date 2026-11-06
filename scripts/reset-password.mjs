#!/usr/bin/env node
// Réinitialisation manuelle d'un mot de passe, pour un joueur qui a perdu son mot de passe ET son code de secours.
//
// Usage :
//   npm run reset-password -- <pseudo>            (base en ligne)
//   npm run reset-password -- <pseudo> --local    (base locale de développement)
//
// Le script génère un mot de passe provisoire, calcule son empreinte (même format que le serveur :
// PBKDF2-SHA256, 100 000 itérations), l'écrit dans D1 via wrangler et déconnecte le joueur partout.
// Le mot de passe en clair n'est jamais stocké : transmettez-le au joueur, qui le changera depuis son profil.

import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const pseudo = process.argv[2];
const cible = process.argv.includes("--local") ? "--local" : "--remote";
if (!pseudo || !/^[A-Za-z0-9_.-]{3,16}$/.test(pseudo)) {
  console.error("Usage : npm run reset-password -- <pseudo> [--local]");
  process.exit(1);
}

const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
const provisoire = [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("");
const sel = randomBytes(16);
const iterations = 100_000;
const hash = pbkdf2Sync(provisoire, sel, iterations, 32, "sha256").toString("hex");
const stocke = `pbkdf2$${iterations}$${sel.toString("hex")}$${hash}`;

// Le pseudo est validé par l'expression régulière ci-dessus : aucune apostrophe possible.
const sql =
  `UPDATE joueurs SET mdp_hash = '${stocke}' WHERE pseudo = '${pseudo}' COLLATE NOCASE; ` +
  `DELETE FROM sessions WHERE joueur_id = (SELECT id FROM joueurs WHERE pseudo = '${pseudo}' COLLATE NOCASE); ` +
  `SELECT COUNT(*) AS trouve FROM joueurs WHERE pseudo = '${pseudo}' COLLATE NOCASE;`;

// execFileSync n'utilise pas de shell : les « $ » de l'empreinte ne sont pas interprétés.
const sortie = execFileSync("npx", ["wrangler", "d1", "execute", "estacasino", cible, "--json", "--command", sql], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const resultats = JSON.parse(sortie);
const trouve = resultats.at(-1)?.results?.[0]?.trouve ?? 0;
if (!trouve) {
  console.error(`\nAucun joueur « ${pseudo} » dans la base (${cible}).\n`);
  process.exit(1);
}
console.log(`\nMot de passe provisoire pour « ${pseudo} » : ${provisoire}`);
console.log("Le joueur a été déconnecté partout. Demandez-lui de changer ce mot de passe depuis son profil.\n");
