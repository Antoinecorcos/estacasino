// Règles de l'économie de jetons. Les jetons sont fictifs et n'ont aucune valeur.
// Aucune de ces valeurs ne dépend d'un achat ou d'un abonnement.

export const CAPITAL_DEPART = 10_000;
export const BONUS_QUOTIDIEN = 2_000;
export const BONUS_SERIE_PAR_JOUR = 200;
export const BONUS_SERIE_MAX = 3_000;
/** Bonus quotidien selon la série de jours consécutifs. */
export function montantBonus(serie: number): number {
  return BONUS_QUOTIDIEN + Math.min(BONUS_SERIE_PAR_JOUR * (serie - 1), BONUS_SERIE_MAX);
}
export const FILET_SEUIL = 500;
export const FILET_MONTANT = 2_000;
export const FILET_DELAI_MS = 4 * 60 * 60 * 1000;

/** Forfait saison : 2 000 jetons crédités dès que le solde tombe à zéro (sous la plus petite mise possible). */
export const FORFAIT_MONTANT = 2_000;
export const FORFAIT_SEUIL = 10;
/** Plafond d'achats de packs de jetons par joueur sur 24 heures glissantes. */
export const PLAFOND_PACKS_JOUR = 5;
/** Comptes multiples : comptes par appareil, et inscriptions par adresse IP sur 24 heures. */
export const COMPTES_PAR_APPAREIL = 1;
/** Large : tout un Wi-Fi d'école peut partager la même adresse IP. La vraie barrière est l'appareil. */
export const INSCRIPTIONS_PAR_IP_JOUR = 50;
/** Nombre minimum de mains/tours joués dans la saison pour apparaître au classement. */
export const CLASSEMENT_MIN_PARTIES = 5;

export const ROOM_VIDE_FERMETURE_MS = 15 * 60 * 1000;
export const BLACKJACK_PLACES = 5;
export const ROULETTE_PLACES = 8;

/** Paliers de mises proposés à l'hôte d'une room. */
export const PALIERS_MISE_MIN = [10, 50, 100, 500, 1_000] as const;
export const PALIERS_MISE_MAX = [500, 1_000, 2_000, 5_000, 10_000, 25_000] as const;

export const BLACKJACK_LIMITES_DEFAUT = { min: 100, max: 2_000 };
export const ROULETTE_LIMITES_DEFAUT = { min: 100, max: 5_000 };

export type Jeu = "blackjack" | "roulette" | "poker" | "machine";

// ───── Poker Texas Hold'em (no-limit) ─────
export const POKER_PLACES = 6;
export const POKER_DELAI_ACTION_MS = 20_000;
export const POKER_RESERVE_MS = 30_000; // réserve de réflexion, par main
export const CAVE_MIN_GB = 40; // cave minimum, en grosses blindes
export const CAVE_MAX_GB = 100;

export interface NiveauPoker {
  id: string;
  petite: number;
  grosse: number;
  /** Ligue minimum pour s'y asseoir. */
  ligue: string;
}
export const NIVEAUX_POKER: NiveauPoker[] = [
  { id: "n1", petite: 10, grosse: 20, ligue: "bronze" },
  { id: "n2", petite: 50, grosse: 100, ligue: "bronze" },
  { id: "n3", petite: 250, grosse: 500, ligue: "argent" },
  { id: "n4", petite: 1_000, grosse: 2_000, ligue: "or" },
];

export interface EntreeSng {
  id: string;
  entree: number;
  ligue: string;
}
export const ENTREES_SNG: EntreeSng[] = [
  { id: "s1", entree: 500, ligue: "bronze" },
  { id: "s2", entree: 2_000, ligue: "bronze" },
  { id: "s3", entree: 10_000, ligue: "argent" },
];
export const SNG_TAPIS = 1_500; // jetons de tournoi
export const SNG_DUREE_NIVEAU_MS = 4 * 60 * 1000;
/** Structure des blindes du Sit & Go. */
export const SNG_BLINDES: [number, number][] = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1_000], [750, 1_500], [1_000, 2_000],
];
/** Répartition des gains du Sit & Go selon le nombre de participants. */
export function repartitionSng(participants: number): number[] {
  return participants <= 3 ? [1] : [0.65, 0.35];
}

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
