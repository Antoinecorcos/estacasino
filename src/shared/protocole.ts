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
  /** Numéro de la donne en cours : change à chaque distribution (sert à animer chaque nouvelle carte). */
  donne: number;
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

// ───────────── Poker ─────────────

export interface PkJoueur {
  id: string;
  pseudo: string;
  avatar: ConfigAvatar;
  place: number;
  /** Jetons devant le joueur (hors mises de la rue en cours). */
  tapis: number;
  /** Mise de la rue en cours. */
  mise: number;
  couche: boolean;
  tapisTout: boolean;
  enMain: boolean;
  /** Cartes privées : visibles par leur propriétaire, ou une fois montrées ; sinon `null` (dos). */
  cartes: (Carte | null)[];
  /** Dernière action affichée : « Suit », « Relance à 400 », « Parole »… */
  action: string | null;
  connecte: boolean;
  /** Gain de la dernière main (abattage). */
  gain: number;
  /** Combinaison montrée à l'abattage. */
  combinaison: string | null;
  /** Cartes de la combinaison gagnante (à mettre en valeur). */
  meilleures: Carte[];
  /** Réserve de réflexion restante (ms). */
  reserve: number;
  /** Sit & Go : place finale si éliminé. */
  rang: number | null;
  partant: boolean;
}

export type PkPhase = "attente" | "preflop" | "flop" | "turn" | "river" | "abattage" | "termine";

export interface PkEtat {
  jeu: "poker";
  mode: "cash" | "sng";
  code: string | null;
  nom: string;
  hoteId: string | null;
  theme: string | null;
  phase: PkPhase;
  donne: number;
  blindes: { petite: number; grosse: number };
  /** Partie libre : cave minimum et maximum. */
  cave: { min: number; max: number } | null;
  joueurs: PkJoueur[];
  spectateurs: number;
  board: Carte[];
  /** Total des pots (mises des rues précédentes) + mises en cours. */
  pot: number;
  bouton: number | null;
  tour: string | null;
  echeance: number | null;
  /** Montant le plus haut misé sur la rue en cours, et relance minimum (montant total à atteindre). */
  miseCourante: number;
  relanceMin: number;
  sng: {
    entree: number;
    prix: number[];
    demarre: boolean;
    niveau: number;
    prochainNiveau: number | null;
    classement: { pseudo: string; place: number; gain: number }[];
    depart: number | null; // démarrage automatique prévu (tables publiques)
  } | null;
  remarque: string | null;
}

export type PkAction = "coucher" | "parole" | "suivre" | "relancer";

export type PkMessageClient =
  | { t: "asseoir"; cave?: number }
  | { t: "quitter" }
  | { t: "action"; action: PkAction; montant?: number }
  | { t: "montrer" }
  | { t: "demarrer" };

/** Réactions rapides en room : de courtes phrases, dans le ton de la maison. */
export const REACTIONS = ["Bien joué", "Bravo !", "Aïe…", "Allez !", "Chanceux…", "Encore !"] as const;

/** Message commun aux deux jeux, envoyé par le client. */
export type MessageCommun = { t: "reaction"; r: number };

export type MessageServeur<E> =
  | { t: "etat"; etat: E; moi: string }
  | { t: "erreur"; message: string }
  | { t: "defi"; titre: string; recompense: number }
  | { t: "reaction"; joueurId: string; pseudo: string; r: number };
