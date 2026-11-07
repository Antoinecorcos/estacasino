import type { ConfigAvatar } from "./avatar";
import type { Issue } from "./blackjack";
import type { Carte } from "./cartes";
import type { CleMise } from "./roulette";

export interface Limites {
  min: number;
  max: number;
}

// ───────────── Blackjack ─────────────

export interface BjMain {
  cartes: Carte[];
  mise: number;
  separee: boolean;
  doublee: boolean;
  terminee: boolean;
  issue?: Issue;
  rendu?: number;
}

export interface BjJoueur {
  id: string;
  pseudo: string;
  avatar: ConfigAvatar;
  place: number;
  solde: number;
  /** Mise posée pour la prochaine donne (phase de mises). */
  mise: number;
  mains: BjMain[];
  connecte: boolean;
}

export type BjPhase = "attente" | "mises" | "jeu" | "croupier" | "resultats";

export interface BjEtat {
  jeu: "blackjack";
  code: string | null; // null pour une table solo
  solo: boolean;
  hoteId: string | null;
  /** Thème de la room (celui de l'hôte), ou null. */
  theme: string | null;
  phase: BjPhase;
  limites: Limites;
  joueurs: BjJoueur[];
  spectateurs: number;
  /** Cartes du croupier ; `null` = carte cachée. */
  croupier: (Carte | null)[];
  tour: { joueurId: string; main: number } | null;
  /** Échéance de la phase ou du tour en cours (horodatage ms), pour le compte à rebours. */
  echeance: number | null;
  /** Remarque du croupier (la petite touche décalée). */
  remarque: string | null;
}

export type BjAction = "tirer" | "rester" | "doubler" | "separer";

export type BjMessageClient =
  | { t: "miser"; montant: number }
  | { t: "distribuer" }
  | { t: "action"; action: BjAction };

// ───────────── Roulette ─────────────

export interface RlJoueur {
  id: string;
  pseudo: string;
  avatar: ConfigAvatar;
  solde: number;
  mises: Record<CleMise, number>;
  /** Total misé et total rendu (mise comprise) au dernier tirage. */
  dernier: { mise: number; rendu: number } | null;
  connecte: boolean;
}

export type RlPhase = "attente" | "mises" | "tirage" | "resultats";

export interface RlEtat {
  jeu: "roulette";
  code: string | null; // null pour La Grande Roue ou une table solo
  /** Table solo : le joueur lance la bille lui-même. */
  solo: boolean;
  nom: string;
  hoteId: string | null;
  theme: string | null;
  phase: RlPhase;
  limites: Limites;
  joueurs: RlJoueur[];
  spectateurs: number;
  echeance: number | null;
  /** Numéro tiré, envoyé dès le début du tirage pour l'animation. */
  resultat: number | null;
  historique: number[];
  remarque: string | null;
}

export type RlMessageClient =
  | { t: "miser"; cle: CleMise; montant: number }
  | { t: "retirer"; cle: CleMise; montant: number }
  | { t: "annuler" }
  | { t: "lancer" };

// ───────────── Commun ─────────────

export type MessageServeur<E> = { t: "etat"; etat: E; moi: string } | { t: "erreur"; message: string };
