// Paris sportifs : règles partagées entre le serveur et l'interface.

export type Choix = "1" | "N" | "2";
export type StatutRencontre = "brouillon" | "ouverte" | "reglee" | "annulee";
export type StatutPari = "en_cours" | "gagne" | "perdu" | "rembourse";
export type VisibiliteParis = "off" | "admins" | "tous";

export const SPORTS = ["Football", "Rugby", "Basket", "Tennis", "Handball", "Hockey", "Formule 1", "Autre"] as const;

export const PARI_MIN = 10;
export const COTE_MIN = 1.01;
export const COTE_MAX = 100;

export interface Rencontre {
  id: number;
  sport: string;
  competition: string;
  equipe1: string;
  equipe2: string;
  debut: number;
  cote1: number;
  coteN: number | null;
  cote2: number;
  statut: StatutRencontre;
  resultat: Choix | null;
}

export interface Pari {
  id: number;
  rencontre_id: number;
  choix: Choix;
  mise: number;
  cote: number;
  statut: StatutPari;
  gain: number;
  le: number;
}

/** Gain total rendu si le pari est gagnant (mise comprise), arrondi au jeton inférieur. */
export function gainPotentiel(mise: number, cote: number): number {
  return Math.floor(mise * cote + 1e-9);
}

export function coteDe(r: Pick<Rencontre, "cote1" | "coteN" | "cote2">, choix: Choix): number | null {
  return choix === "1" ? r.cote1 : choix === "2" ? r.cote2 : r.coteN;
}

export function libelleChoix(r: Pick<Rencontre, "equipe1" | "equipe2">, choix: Choix): string {
  return choix === "1" ? r.equipe1 : choix === "2" ? r.equipe2 : "Match nul";
}

/** Marge de la « maison » implicite dans les cotes (100 % = cotes justes, sans marge). */
export function sommeProbabilites(r: Pick<Rencontre, "cote1" | "coteN" | "cote2">): number {
  return 1 / r.cote1 + 1 / r.cote2 + (r.coteN ? 1 / r.coteN : 0);
}

const coteValide = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= COTE_MIN && x <= COTE_MAX;

/** Vérifie une rencontre saisie par l'équipe. Retourne un message d'erreur, ou null. */
export function validerRencontre(r: Partial<Rencontre>): string | null {
  if (!r.sport || !(SPORTS as readonly string[]).includes(r.sport)) return "Sport invalide.";
  if ((r.competition ?? "").length > 60) return "Compétition : 60 caractères au plus.";
  for (const e of [r.equipe1, r.equipe2]) if (!e?.trim() || e.trim().length > 40) return "Chaque équipe (ou joueur) : de 1 à 40 caractères.";
  if (r.equipe1!.trim().toLowerCase() === r.equipe2!.trim().toLowerCase()) return "Les deux équipes doivent être différentes.";
  if (!Number.isFinite(r.debut)) return "Date du coup d'envoi invalide.";
  if (!coteValide(r.cote1) || !coteValide(r.cote2)) return `Cotes entre ${COTE_MIN} et ${COTE_MAX}.`;
  if (r.coteN !== null && r.coteN !== undefined && !coteValide(r.coteN)) return `Cote du nul entre ${COTE_MIN} et ${COTE_MAX}, ou vide s'il n'y a pas de nul.`;
  return null;
}
