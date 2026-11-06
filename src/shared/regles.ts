// Règles de l'économie de jetons. Les jetons sont fictifs et n'ont aucune valeur.
// Aucune de ces valeurs ne dépend d'un achat ou d'un abonnement.

export const CAPITAL_DEPART = 10_000;
export const BONUS_QUOTIDIEN = 2_000;
export const BONUS_SERIE_PAR_JOUR = 200;
export const BONUS_SERIE_MAX = 3_000;
export const FILET_SEUIL = 500;
export const FILET_MONTANT = 2_000;
export const FILET_DELAI_MS = 4 * 60 * 60 * 1000;
/** Nombre minimum de mains/tours joués dans la saison pour apparaître au classement. */
export const CLASSEMENT_MIN_PARTIES = 20;

export const ROOM_VIDE_FERMETURE_MS = 15 * 60 * 1000;
export const BLACKJACK_PLACES = 5;
export const ROULETTE_PLACES = 8;

/** Paliers de mises proposés à l'hôte d'une room. */
export const PALIERS_MISE_MIN = [10, 50, 100, 500, 1_000] as const;
export const PALIERS_MISE_MAX = [500, 1_000, 2_000, 5_000, 10_000, 25_000] as const;

export const BLACKJACK_LIMITES_DEFAUT = { min: 100, max: 2_000 };
export const ROULETTE_LIMITES_DEFAUT = { min: 100, max: 5_000 };

export type Jeu = "blackjack" | "roulette";

/** Alphabet des codes de room : pas de I ni de O (confusion avec 1 et 0). */
export const ALPHABET_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;

export const PSEUDO_REGEX = /^[A-Za-z0-9_.-]{3,16}$/;
export const MDP_MIN = 8;

export function formatJetons(n: number): string {
  const signe = n < 0 ? "-" : "";
  return signe + Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatPrix(centimes: number): string {
  return (centimes / 100).toFixed(2).replace(".", ",") + " €";
}
