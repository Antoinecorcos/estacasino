import type { Jeu } from "./regles";

// Événements paramétrables : quatre types, réglés depuis l'espace Admin.
//  - boost       : pendant l'événement, récompenses des défis et bonus quotidien multipliés.
//  - objectif    : défi collectif (« l'école »). Si le total atteint la cible, chaque participant
//                  récupère la récompense.
//  - classement  : classement éclair sur la durée de l'événement ; récompenses du podium
//                  distribuées automatiquement à la fin.
//  - calendrier  : un cadeau par jour à récupérer (ex. calendrier de l'Avent).
// Les récompenses sont des jetons fictifs : jamais de lot réel.

export type TypeEvenement = "boost" | "objectif" | "classement" | "calendrier";
export type Visibilite = "brouillon" | "admins" | "tous";
export type JeuEvenement = "tous" | Jeu;
export type Mesure = "parties" | "mises" | "gains";

export interface ParamsBoost {
  multDefis: number;
  multBonus: number;
}
export interface ParamsObjectif {
  mesure: "parties" | "mises";
  jeu: JeuEvenement;
  cible: number;
  recompense: number;
}
export interface ParamsClassement {
  mesure: "gains" | "parties";
  jeu: JeuEvenement;
  recompenses: number[]; // 1re place, 2e, 3e…
}
export interface ParamsCalendrier {
  recompenses: number[]; // jetons du jour 1, du jour 2…
}
export type Params = ParamsBoost | ParamsObjectif | ParamsClassement | ParamsCalendrier;

export interface Evenement {
  id: number;
  type: TypeEvenement;
  titre: string;
  description: string;
  debut: number;
  fin: number;
  visibilite: Visibilite;
  notifier: boolean;
  params: Params;
  cloture: boolean;
}

export const NOMS_TYPES: Record<TypeEvenement, string> = {
  boost: "Boost (heure dorée)",
  objectif: "Défi collectif",
  classement: "Classement éclair",
  calendrier: "Calendrier de cadeaux",
};

export const NOMS_JEUX: Record<JeuEvenement, string> = {
  tous: "tous les jeux",
  blackjack: "blackjack",
  roulette: "roulette",
  poker: "poker",
  machine: "machine à sous",
};

export const NOMS_MESURES: Record<Mesure, string> = {
  parties: "parties jouées",
  mises: "jetons misés",
  gains: "gains nets",
};

const entier = (x: unknown, min: number, max: number) => Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const JEUX: JeuEvenement[] = ["tous", "blackjack", "roulette", "poker", "machine"];

/** Vérifie les réglages d'un événement. Retourne un message d'erreur, ou null. */
export function validerParams(type: TypeEvenement, p: unknown): string | null {
  const o = (p ?? {}) as Record<string, unknown>;
  switch (type) {
    case "boost":
      if (typeof o.multDefis !== "number" || o.multDefis < 1 || o.multDefis > 5) return "Multiplicateur des défis : entre 1 et 5.";
      if (typeof o.multBonus !== "number" || o.multBonus < 1 || o.multBonus > 5) return "Multiplicateur du bonus quotidien : entre 1 et 5.";
      if (o.multDefis === 1 && o.multBonus === 1) return "Un boost doit multiplier au moins quelque chose.";
      return null;
    case "objectif":
      if (o.mesure !== "parties" && o.mesure !== "mises") return "Mesure invalide.";
      if (!JEUX.includes(o.jeu as JeuEvenement)) return "Jeu invalide.";
      if (!entier(o.cible, 1, 1_000_000_000)) return "Cible invalide.";
      if (!entier(o.recompense, 1, 1_000_000)) return "Récompense invalide (1 à 1 000 000 jetons).";
      return null;
    case "classement":
      if (o.mesure !== "gains" && o.mesure !== "parties") return "Mesure invalide.";
      if (!JEUX.includes(o.jeu as JeuEvenement)) return "Jeu invalide.";
      if (!Array.isArray(o.recompenses) || o.recompenses.length < 1 || o.recompenses.length > 20 || !o.recompenses.every((r) => entier(r, 1, 1_000_000)))
        return "Récompenses du classement : de 1 à 20 montants, entre 1 et 1 000 000 jetons.";
      return null;
    case "calendrier":
      if (!Array.isArray(o.recompenses) || o.recompenses.length < 1 || o.recompenses.length > 60 || !o.recompenses.every((r) => entier(r, 1, 1_000_000)))
        return "Cadeaux : de 1 à 60 montants (un par jour), entre 1 et 1 000 000 jetons.";
      return null;
  }
}

/** Le jeu d'une partie compte-t-il pour cet événement ? */
export function jeuCompte(jeuEvt: JeuEvenement, jeu: Jeu): boolean {
  return jeuEvt === "tous" || jeuEvt === jeu;
}

/** Valeur ajoutée par une partie, selon la mesure. */
export function increment(mesure: Mesure, mise: number, net: number): number {
  return mesure === "parties" ? 1 : mesure === "mises" ? Math.max(0, mise) : net;
}

/** Numéro du jour (0 = premier jour) d'un calendrier, à partir des dates de Paris (AAAA-MM-JJ). */
export function jourDuCalendrier(jourDebut: string, jourActuel: string): number {
  return Math.round((Date.parse(`${jourActuel}T12:00:00Z`) - Date.parse(`${jourDebut}T12:00:00Z`)) / 86_400_000);
}

/** Modèles prêts à l'emploi pour le formulaire de l'Admin (dates proposées à partir de maintenant). */
export const MODELES: { nom: string; type: TypeEvenement; titre: string; description: string; dureeHeures: number; params: Params }[] = [
  {
    nom: "Heure dorée",
    type: "boost",
    titre: "L'heure dorée",
    description: "Pendant une heure, les récompenses des défis du jour sont doublées.",
    dureeHeures: 1,
    params: { multDefis: 2, multBonus: 1 },
  },
  {
    nom: "Défi de l'école",
    type: "objectif",
    titre: "Le défi de l'école",
    description: "Tous ensemble : 20 000 mains de blackjack cette semaine. Si on y arrive, chaque participant gagne 5 000 jetons.",
    dureeHeures: 7 * 24,
    params: { mesure: "parties", jeu: "blackjack", cible: 20_000, recompense: 5_000 },
  },
  {
    nom: "Rush du week-end",
    type: "classement",
    titre: "Le rush du week-end",
    description: "48 heures pour faire le plus gros gain net à la machine à sous. Le podium est récompensé.",
    dureeHeures: 48,
    params: { mesure: "gains", jeu: "machine", recompenses: [50_000, 25_000, 10_000] },
  },
  {
    nom: "Calendrier de l'Avent",
    type: "calendrier",
    titre: "Le calendrier de l'Avent",
    description: "Une case à ouvrir chaque jour jusqu'à Noël.",
    dureeHeures: 24 * 24,
    params: { recompenses: [...Array.from({ length: 23 }, (_, i) => ((i + 1) % 7 === 0 ? 5_000 : 1_500)), 20_000] },
  },
];
