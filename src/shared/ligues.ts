import { CLASSEMENT_MIN_PARTIES } from "./regles";

// Ligues de la saison, calculées sur les gains nets de la saison (comme le classement).
// Chaque ligue débloque des limites de mise plus hautes pour les rooms que l'on ouvre.

export interface Ligue {
  id: "bronze" | "argent" | "or" | "platine" | "diamant" | "legende";
  nom: string;
  /** Gains nets de saison à atteindre. */
  seuil: number;
  couleur: string;
  /** Mise maximum autorisée à l'hôte d'une room. */
  miseMaxRoom: number;
}

export const LIGUES: Ligue[] = [
  { id: "bronze", nom: "Bronze", seuil: Number.NEGATIVE_INFINITY, couleur: "#B9824F", miseMaxRoom: 5_000 },
  { id: "argent", nom: "Argent", seuil: 5_000, couleur: "#C3C8CE", miseMaxRoom: 10_000 },
  { id: "or", nom: "Or", seuil: 15_000, couleur: "#D9B45A", miseMaxRoom: 25_000 },
  { id: "platine", nom: "Platine", seuil: 40_000, couleur: "#9ED3CF", miseMaxRoom: 25_000 },
  { id: "diamant", nom: "Diamant", seuil: 100_000, couleur: "#9CC0FF", miseMaxRoom: 25_000 },
  { id: "legende", nom: "Légende", seuil: 100_000, couleur: "#E8836B", miseMaxRoom: 25_000 },
];

/** Nombre de joueurs Diamant les mieux classés qui deviennent Légende. */
export const PLACES_LEGENDE = 10;

export function ligueDe(gains: number, parties: number, rang: number | null): Ligue {
  if (parties < CLASSEMENT_MIN_PARTIES) return LIGUES[0];
  const atteintes = LIGUES.filter((l) => l.id !== "legende" && gains >= l.seuil);
  const ligue = atteintes[atteintes.length - 1];
  if (ligue.id === "diamant" && rang !== null && rang <= PLACES_LEGENDE) return LIGUES[5];
  return ligue;
}

export function ligueSuivante(l: Ligue): Ligue | null {
  const i = LIGUES.findIndex((x) => x.id === l.id);
  return i >= 0 && i < LIGUES.length - 2 ? LIGUES[i + 1] : null;
}

export function trouverLigue(id: string): Ligue {
  return LIGUES.find((l) => l.id === id) ?? LIGUES[0];
}
