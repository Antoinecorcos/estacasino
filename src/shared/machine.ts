// Machine à sous « Les Années folles » : 5 rouleaux × 3 rangées, 243 voies de gain.
// Tout le hasard est tiré sur le serveur ; ce module est pur (le générateur est passé en paramètre),
// ce qui permet de le simuler sur des millions de tours pour régler le taux de redistribution.
//
//  - Gains de gauche à droite sur des rouleaux adjacents, à partir de 3 symboles identiques.
//  - Le WILD (rouleaux 2 à 4) remplace tous les symboles sauf BONUS et pièces.
//  - 3, 4 ou 5 BONUS n'importe où : 6, 9 ou 15 tours gratuits avec un multiplicateur qui monte
//    de 1 à chaque tour gagnant (jusqu'à ×4). 3 BONUS pendant les tours gratuits : +5 tours.
//
// Volatilité réglée en novembre 2026 : environ 68 % de la mise revient par le jeu de base et 30 % par
// les fonctions (total ≈ 97 %). Avant, 40 % passaient par les fonctions rares, et les joueurs qui ne
// les touchaient pas perdaient vite (perte médiane de 1 465 jetons sur 40 lancers à 100, 930 désormais).
//  - 6 pièces ou plus : « Pluie d'or ». Les pièces restent en place, 3 relances, chaque nouvelle
//    pièce remet le compteur à 3. Valeurs en multiples de la mise, ou jackpots MINI, MINEUR, MAJEUR.
//    Les 15 cases remplies : jackpot GRAND.

export type Symbole = "trefle" | "carreau" | "coeur" | "pique" | "perles" | "chapeau" | "cocktail" | "diamant" | "wild" | "bonus" | "piece";
export type SymbolePayant = Exclude<Symbole, "wild" | "bonus" | "piece">;
export type Jackpot = "mini" | "mineur" | "majeur" | "grand";

export const ROULEAUX = 5;
export const RANGEES = 3;

/** Une case de la grille. `v` : valeur d'une pièce en multiples de la mise ; `j` : jackpot porté par la pièce. */
export interface Case {
  s: Symbole;
  v?: number;
  j?: Jackpot;
}
/** grille[rouleau][rangée] */
export type Grille = Case[][];
export type Position = [number, number];

export const SYMBOLES_PAYANTS: SymbolePayant[] = ["diamant", "cocktail", "chapeau", "perles", "pique", "coeur", "carreau", "trefle"];

/** Gains par voie, en centièmes de la mise, pour 3, 4 et 5 symboles. */
export const GAINS: Record<SymbolePayant, [number, number, number]> = {
  trefle: [35, 80, 180],
  carreau: [35, 80, 180],
  coeur: [45, 100, 230],
  pique: [45, 100, 230],
  perles: [65, 150, 380],
  chapeau: [80, 200, 550],
  cocktail: [100, 300, 900],
  diamant: [150, 500, 1500],
};

/** BONUS n'importe où : gain (× mise) et tours gratuits. */
export const GAINS_BONUS: Record<number, number> = { 3: 2, 4: 10, 5: 50 };
export const TOURS_GRATUITS: Record<number, number> = { 3: 6, 4: 9, 5: 15 };
export const RELANCE_TOURS = 5;
export const MULTIPLICATEUR_MAX = 4;

export const JACKPOTS: Record<Jackpot, number> = { mini: 20, mineur: 50, majeur: 200, grand: 1000 };
export const NOMS_JACKPOTS: Record<Jackpot, string> = { mini: "Mini", mineur: "Mineur", majeur: "Majeur", grand: "Grand" };
export const PIECES_DECLENCHEMENT = 6;
export const RELANCES_PIECES = 3;

/** Gain maximum d'un tour, toutes fonctions comprises (× mise). */
export const GAIN_MAX = 5000;

/** Mises proposées. La mise maximum dépend de la ligue (comme pour les rooms). */
export const MISES_MACHINE = [10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 25_000] as const;

/** Tirage des valeurs de pièces (poids relatifs). */
const VALEURS_PIECES: { v: number; j?: Jackpot; poids: number }[] = [
  { v: 1, poids: 300 },
  { v: 2, poids: 230 },
  { v: 3, poids: 150 },
  { v: 5, poids: 120 },
  { v: 8, poids: 75 },
  { v: 10, poids: 55 },
  { v: 15, poids: 35 },
  { v: JACKPOTS.mini, j: "mini", poids: 22 },
  { v: JACKPOTS.mineur, j: "mineur", poids: 8 },
  { v: JACKPOTS.majeur, j: "majeur", poids: 2 },
];
const POIDS_PIECES = VALEURS_PIECES.reduce((a, x) => a + x.poids, 0);

/** Probabilité qu'une case vide reçoive une pièce à chaque relance de la Pluie d'or. */
export const CHANCE_PIECE_RELANCE = 0.04;

export type Hasard = () => number; // [0, 1)

// ───────── Bandes des rouleaux ─────────

type Composition = Partial<Record<Symbole, number>>;

const BASE_EXT: Composition = { trefle: 9, carreau: 9, coeur: 8, pique: 8, perles: 6, chapeau: 5, cocktail: 4, diamant: 3, bonus: 2, piece: 8 };
const BASE_INT: Composition = { trefle: 8, carreau: 8, coeur: 8, pique: 8, perles: 6, chapeau: 5, cocktail: 4, diamant: 3, wild: 3, bonus: 2, piece: 7 };
// Tours gratuits : pas de pièces, un peu plus de wilds et de beaux symboles.
const LIBRES_EXT: Composition = { trefle: 9, carreau: 9, coeur: 8, pique: 8, perles: 7, chapeau: 6, cocktail: 5, diamant: 4, bonus: 2 };
const LIBRES_INT: Composition = { trefle: 8, carreau: 8, coeur: 8, pique: 8, perles: 7, chapeau: 6, cocktail: 4, diamant: 3, wild: 4, bonus: 2 };

/** Générateur déterministe (mulberry32) : les bandes sont identiques partout, à chaque démarrage. */
function graine(n: number): Hasard {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function construireBande(comp: Composition, h: Hasard): Symbole[] {
  const liste: Symbole[] = [];
  for (const [s, n] of Object.entries(comp) as [Symbole, number][]) for (let i = 0; i < n; i++) liste.push(s);
  // Mélange jusqu'à ce que deux BONUS soient toujours à au moins 3 cases d'écart (au plus un visible par rouleau)
  // que deux wilds ne se suivent pas, et qu'il n'y ait jamais 3 pièces d'affilée.
  for (;;) {
    for (let i = liste.length - 1; i > 0; i--) {
      const k = Math.floor(h() * (i + 1));
      [liste[i], liste[k]] = [liste[k], liste[i]];
    }
    const n = liste.length;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let d = 1; d <= 2; d++) {
        const a = liste[i];
        const b = liste[(i + d) % n];
        if (a === "bonus" && b === "bonus") ok = false;
        if (d === 1 && a === "wild" && b === "wild") ok = false;
      }
      // Jamais 3 pièces d'affilée : la fréquence de la Pluie d'or ne dépend pas du hasard du mélange.
      if (liste[i] === "piece" && liste[(i + 1) % n] === "piece" && liste[(i + 2) % n] === "piece") ok = false;
    }
    if (ok) return liste;
  }
}

function construireBandes(ext: Composition, int: Composition, n: number): Symbole[][] {
  const h = graine(n);
  return [ext, int, int, int, ext].map((c) => construireBande(c, h));
}

export const BANDES_BASE = construireBandes(BASE_EXT, BASE_INT, 1925);
export const BANDES_LIBRES = construireBandes(LIBRES_EXT, LIBRES_INT, 1929);

// ───────── Tirages ─────────

export function tirerPiece(h: Hasard): Case {
  let x = h() * POIDS_PIECES;
  for (const p of VALEURS_PIECES) {
    x -= p.poids;
    if (x < 0) return p.j ? { s: "piece", v: p.v, j: p.j } : { s: "piece", v: p.v };
  }
  return { s: "piece", v: 1 };
}

export function tirerGrille(bandes: Symbole[][], h: Hasard): Grille {
  return bandes.map((bande) => {
    const arret = Math.floor(h() * bande.length);
    return Array.from({ length: RANGEES }, (_, r) => {
      const s = bande[(arret + r) % bande.length];
      return s === "piece" ? tirerPiece(h) : { s };
    });
  });
}

// ───────── Évaluation ─────────

export interface GainVoie {
  symbole: SymbolePayant;
  longueur: number; // 3, 4 ou 5 rouleaux
  voies: number;
  positions: Position[];
  montant: number; // jetons
}

export interface ResultatTour {
  grille: Grille;
  gains: GainVoie[];
  /** BONUS présents sur la grille (gain éventuel compris dans `total`). */
  bonus: { positions: Position[]; montant: number };
  /** Gain du tour en jetons (multiplicateur compris pendant les tours gratuits). */
  total: number;
}

const enJetons = (centiemes: number, mise: number) => Math.floor((centiemes * mise) / 100);

export function evaluerVoies(grille: Grille, mise: number, multiplicateur = 1): GainVoie[] {
  const gains: GainVoie[] = [];
  for (const symbole of SYMBOLES_PAYANTS) {
    let voies = 1;
    let longueur = 0;
    const positions: Position[] = [];
    for (let r = 0; r < ROULEAUX; r++) {
      const ici = grille[r].map((c, rang) => (c.s === symbole || c.s === "wild" ? rang : -1)).filter((x) => x >= 0);
      if (ici.length === 0) break;
      voies *= ici.length;
      longueur++;
      for (const rang of ici) positions.push([r, rang]);
    }
    if (longueur >= 3) {
      gains.push({ symbole, longueur, voies, positions, montant: enJetons(GAINS[symbole][longueur - 3] * voies * multiplicateur, mise) });
    }
  }
  return gains;
}

export function positionsDe(grille: Grille, s: Symbole): Position[] {
  const p: Position[] = [];
  grille.forEach((col, r) => col.forEach((c, rang) => c.s === s && p.push([r, rang])));
  return p;
}

function evaluerTour(grille: Grille, mise: number, multiplicateur = 1): ResultatTour {
  const gains = evaluerVoies(grille, mise, multiplicateur);
  const positions = positionsDe(grille, "bonus");
  const montantBonus = positions.length >= 3 ? GAINS_BONUS[Math.min(5, positions.length)] * mise * multiplicateur : 0;
  return {
    grille,
    gains,
    bonus: { positions, montant: montantBonus },
    total: gains.reduce((a, g) => a + g.montant, 0) + montantBonus,
  };
}

// ───────── Tours gratuits ─────────

export interface TourLibre extends ResultatTour {
  numero: number;
  multiplicateur: number; // appliqué à ce tour
  ajoutes: number; // tours ajoutés par ce tour (relance)
}

export interface Libres {
  tours: TourLibre[];
  total: number;
}

function jouerLibres(nombre: number, mise: number, h: Hasard): Libres {
  const tours: TourLibre[] = [];
  let restants = nombre;
  let multiplicateur = 1;
  let total = 0;
  while (restants > 0 && tours.length < 200) {
    restants--;
    const t = evaluerTour(tirerGrille(BANDES_LIBRES, h), mise, multiplicateur);
    const ajoutes = t.bonus.positions.length >= 3 ? RELANCE_TOURS : 0;
    restants += ajoutes;
    tours.push({ ...t, numero: tours.length + 1, multiplicateur, ajoutes });
    total += t.total;
    if (t.total > 0) multiplicateur = Math.min(MULTIPLICATEUR_MAX, multiplicateur + 1);
  }
  return { tours, total };
}

// ───────── Pluie d'or (pièces) ─────────

export interface EtapePieces {
  nouvelles: { r: number; rang: number; piece: Case }[];
  relances: number; // relances restantes après cette étape
}

export interface Pieces {
  depart: { r: number; rang: number; piece: Case }[];
  etapes: EtapePieces[];
  grand: boolean;
  total: number;
  jackpots: Jackpot[];
}

function jouerPieces(grille: Grille, mise: number, h: Hasard): Pieces {
  const plateau: (Case | null)[][] = grille.map((col) => col.map((c) => (c.s === "piece" ? c : null)));
  const depart = plateau.flatMap((col, r) => col.flatMap((c, rang) => (c ? [{ r, rang, piece: c }] : [])));
  const etapes: EtapePieces[] = [];
  let relances = RELANCES_PIECES;
  const plein = () => plateau.every((col) => col.every(Boolean));
  while (relances > 0 && !plein()) {
    const nouvelles: EtapePieces["nouvelles"] = [];
    plateau.forEach((col, r) =>
      col.forEach((c, rang) => {
        if (!c && h() < CHANCE_PIECE_RELANCE) {
          const piece = tirerPiece(h);
          col[rang] = piece;
          nouvelles.push({ r, rang, piece });
        }
      }),
    );
    relances = nouvelles.length > 0 ? RELANCES_PIECES : relances - 1;
    etapes.push({ nouvelles, relances: plein() ? 0 : relances });
  }
  const toutes = plateau.flat().filter((c): c is Case => !!c);
  const grand = plein();
  const jackpots = toutes.flatMap((c) => (c.j ? [c.j] : []));
  if (grand) jackpots.push("grand");
  const multiples = toutes.reduce((a, c) => a + (c.v ?? 0), 0) + (grand ? JACKPOTS.grand : 0);
  return { depart, etapes, grand, total: multiples * mise, jackpots };
}

// ───────── Un tour complet ─────────

export interface ResultatMachine {
  mise: number;
  base: ResultatTour;
  libres: Libres | null;
  pieces: Pieces | null;
  /** Gain total en jetons (plafonné à GAIN_MAX × mise). */
  total: number;
  plafonne: boolean;
}

export function jouerTour(mise: number, h: Hasard): ResultatMachine {
  const base = evaluerTour(tirerGrille(BANDES_BASE, h), mise);
  const nbBonus = base.bonus.positions.length;
  const nbPieces = positionsDe(base.grille, "piece").length;
  const pieces = nbPieces >= PIECES_DECLENCHEMENT ? jouerPieces(base.grille, mise, h) : null;
  const libres = nbBonus >= 3 ? jouerLibres(TOURS_GRATUITS[Math.min(5, nbBonus)], mise, h) : null;
  const brut = base.total + (pieces?.total ?? 0) + (libres?.total ?? 0);
  const total = Math.min(brut, GAIN_MAX * mise);
  return { mise, base, libres, pieces, total, plafonne: total < brut };
}

/** Palier de célébration d'un gain, relatif à la mise. */
export type Palier = "aucun" | "petit" | "joli" | "gros" | "enorme" | "epique";
export function palierGain(gain: number, mise: number): Palier {
  const x = gain / mise;
  if (gain <= 0) return "aucun";
  if (x < 2) return "petit";
  if (x < 10) return "joli";
  if (x < 25) return "gros";
  if (x < 50) return "enorme";
  return "epique";
}
export const TITRES_PALIERS: Record<Palier, string> = {
  aucun: "",
  petit: "Gain",
  joli: "Joli gain",
  gros: "Gros gain",
  enorme: "Énorme gain",
  epique: "Gain épique",
};
