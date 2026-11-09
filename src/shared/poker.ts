import type { Carte, Couleur, Rang } from "./cartes";

// Moteur de poker Texas Hold'em : évaluation des mains, libellés en français, pots annexes.
// Utilisé par le serveur (règlement des mains) et par le client (aide « votre combinaison »).

const VALEUR: Record<Rang, number> = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };

export const CATEGORIES = [
  "Carte haute", "Paire", "Deux paires", "Brelan", "Quinte", "Couleur", "Full", "Carré", "Quinte flush",
] as const;

export interface Evaluation {
  /** Plus grand = meilleure main. Comparable entre joueurs. */
  score: number;
  categorie: number;
  libelle: string;
  /** Les 5 cartes qui forment la main. */
  cartes: Carte[];
}

const NOMS: Record<number, [string, string]> = {
  14: ["as", "as"], 13: ["roi", "rois"], 12: ["dame", "dames"], 11: ["valet", "valets"],
  10: ["10", "10"], 9: ["9", "9"], 8: ["8", "8"], 7: ["7", "7"], 6: ["6", "6"], 5: ["5", "5"], 4: ["4", "4"], 3: ["3", "3"], 2: ["2", "2"],
};
const COULEURS: Record<Couleur, string> = { S: "pique", H: "cœur", D: "carreau", C: "trèfle" };

/** « d'as », « de rois », « de 8 ». */
const de = (v: number) => (v === 14 ? "d'as" : `de ${NOMS[v][1]}`);
/** « à l'as », « au roi », « à la dame », « au 10 ». */
const a = (v: number) => (v === 14 ? "à l'as" : v === 12 ? "à la dame" : `au ${NOMS[v][0]}`);
/** « aux as », « aux rois », « aux 8 ». */
const aux = (v: number) => `aux ${NOMS[v][1]}`;

function evaluer5(cartes: Carte[]): Omit<Evaluation, "cartes"> {
  const v = cartes.map((c) => VALEUR[c.r]).sort((x, y) => y - x);
  const couleur = cartes.every((c) => c.c === cartes[0].c);
  const uniques = [...new Set(v)];
  let hauteurQuinte = 0;
  if (uniques.length === 5) {
    if (v[0] - v[4] === 4) hauteurQuinte = v[0];
    else if (v[0] === 14 && v[1] === 5) hauteurQuinte = 5; // quinte blanche A-2-3-4-5
  }
  const comptes = new Map<number, number>();
  v.forEach((x) => comptes.set(x, (comptes.get(x) ?? 0) + 1));
  const groupes = [...comptes.entries()].sort((p, q) => q[1] - p[1] || q[0] - p[0]);
  const forme = groupes.map((g) => g[1]).join("");

  let categorie: number;
  let departage: number[];
  let libelle: string;
  if (hauteurQuinte && couleur) {
    categorie = 8;
    departage = [hauteurQuinte];
    libelle = hauteurQuinte === 14 ? "Quinte flush royale" : `Quinte flush ${a(hauteurQuinte)}`;
  } else if (forme === "41") {
    categorie = 7;
    departage = groupes.map((g) => g[0]);
    libelle = `Carré ${de(groupes[0][0])}`;
  } else if (forme === "32") {
    categorie = 6;
    departage = groupes.map((g) => g[0]);
    libelle = `Full ${aux(groupes[0][0])} par les ${NOMS[groupes[1][0]][1]}`;
  } else if (couleur) {
    categorie = 5;
    departage = v;
    libelle = `Couleur à ${COULEURS[cartes[0].c]}`;
  } else if (hauteurQuinte) {
    categorie = 4;
    departage = [hauteurQuinte];
    libelle = `Quinte ${a(hauteurQuinte)}`;
  } else if (forme === "311") {
    categorie = 3;
    departage = groupes.map((g) => g[0]);
    libelle = `Brelan ${de(groupes[0][0])}`;
  } else if (forme === "221") {
    categorie = 2;
    departage = groupes.map((g) => g[0]);
    libelle = `Deux paires, ${NOMS[groupes[0][0]][1]} et ${NOMS[groupes[1][0]][1]}`;
  } else if (forme === "2111") {
    categorie = 1;
    departage = groupes.map((g) => g[0]);
    libelle = `Paire ${de(groupes[0][0])}`;
  } else {
    categorie = 0;
    departage = v;
    libelle = `Hauteur ${NOMS[v[0]][0]}`;
  }
  let score = categorie;
  for (let i = 0; i < 5; i++) score = score * 15 + (departage[i] ?? 0);
  return { score, categorie, libelle };
}

/** Toutes les façons de choisir k éléments parmi n (indices). */
function combinaisons(n: number, k: number): number[][] {
  const res: number[][] = [];
  const cur: number[] = [];
  const rec = (debut: number) => {
    if (cur.length === k) {
      res.push([...cur]);
      return;
    }
    for (let i = debut; i < n; i++) {
      cur.push(i);
      rec(i + 1);
      cur.pop();
    }
  };
  rec(0);
  return res;
}
const COMBIS = new Map<number, number[][]>([5, 6, 7].map((n) => [n, combinaisons(n, 5)]));

/** Meilleure main de 5 cartes parmi 5 à 7 cartes. */
export function meilleureMain(cartes: Carte[]): Evaluation {
  const combis = COMBIS.get(cartes.length);
  if (!combis) throw new Error("Il faut 5 à 7 cartes");
  let meilleure: Evaluation | null = null;
  for (const idx of combis) {
    const main = idx.map((k) => cartes[k]);
    const e = evaluer5(main);
    if (!meilleure || e.score > meilleure.score) meilleure = { ...e, cartes: main };
  }
  return meilleure!;
}

/** Libellé court d'une main incomplète (moins de 5 cartes : paire servie, brelan, ou hauteur). */
export function libelleProvisoire(cartes: Carte[]): string {
  if (cartes.length >= 5) return meilleureMain(cartes).libelle;
  const v = cartes.map((c) => VALEUR[c.r]).sort((x, y) => y - x);
  const comptes = new Map<number, number>();
  v.forEach((x) => comptes.set(x, (comptes.get(x) ?? 0) + 1));
  const groupes = [...comptes.entries()].sort((p, q) => q[1] - p[1] || q[0] - p[0]);
  if (groupes[0][1] === 4) return `Carré ${de(groupes[0][0])}`;
  if (groupes[0][1] === 3) return `Brelan ${de(groupes[0][0])}`;
  if (groupes[0][1] === 2 && groupes[1]?.[1] === 2) return `Deux paires, ${NOMS[groupes[0][0]][1]} et ${NOMS[groupes[1][0]][1]}`;
  if (groupes[0][1] === 2) return `Paire ${de(groupes[0][0])}`;
  return `Hauteur ${NOMS[v[0]][0]}`;
}

// ───────────── Pots ─────────────

export interface Engagement {
  id: string;
  /** Total misé pendant la main (toutes rues confondues). */
  engage: number;
  couche: boolean;
}

export interface Pot {
  montant: number;
  eligibles: string[];
}

/** Découpe ce qui a été misé en pot principal et pots annexes (cas des tapis). */
export function calculerPots(joueurs: Engagement[]): Pot[] {
  const niveaux = [...new Set(joueurs.filter((j) => !j.couche && j.engage > 0).map((j) => j.engage))].sort((x, y) => x - y);
  const pots: Pot[] = [];
  let precedent = 0;
  for (const niveau of niveaux) {
    const montant = joueurs.reduce((s, j) => s + Math.max(0, Math.min(j.engage, niveau) - precedent), 0);
    const eligibles = joueurs.filter((j) => !j.couche && j.engage >= niveau).map((j) => j.id);
    const dernier = pots[pots.length - 1];
    if (dernier && dernier.eligibles.length === eligibles.length) dernier.montant += montant;
    else if (montant > 0) pots.push({ montant, eligibles });
    precedent = niveau;
  }
  // Mises des joueurs couchés au-delà du plus gros engagement restant (impossible en pratique) : au dernier pot.
  const reste = joueurs.reduce((s, j) => s + j.engage, 0) - pots.reduce((s, p) => s + p.montant, 0);
  if (reste > 0 && pots.length) pots[pots.length - 1].montant += reste;
  return pots;
}

/**
 * Partage les pots entre les meilleures mains. `ordre` = joueurs dans l'ordre à partir de la gauche du bouton :
 * en cas de partage, les jetons indivisibles vont au premier gagnant dans cet ordre.
 */
export function partagerPots(pots: Pot[], scores: Map<string, number>, ordre: string[]): Map<string, number> {
  const gains = new Map<string, number>();
  for (const pot of pots) {
    const meilleur = Math.max(...pot.eligibles.map((id) => scores.get(id) ?? -1));
    const gagnants = ordre.filter((id) => pot.eligibles.includes(id) && (scores.get(id) ?? -1) === meilleur);
    const part = Math.floor(pot.montant / gagnants.length);
    let reste = pot.montant - part * gagnants.length;
    for (const id of gagnants) {
      gains.set(id, (gains.get(id) ?? 0) + part + (reste > 0 ? 1 : 0));
      if (reste > 0) reste--;
    }
  }
  return gains;
}
