import { type Carte, valeurRang } from "./cartes";

// Règles Estacasino : 6 jeux, le croupier reste à 17 (y compris 17 souple),
// blackjack payé 3 pour 2, doubler sur les 2 premières cartes, séparer une seule fois,
// pas d'assurance. Le croupier vérifie s'il a un blackjack (As ou 10 visible).

export const NB_JEUX = 6;
/** On remélange quand il reste moins de 25 % du sabot. */
export const SEUIL_REMELANGE = Math.floor(NB_JEUX * 52 * 0.25);

export interface Valeur {
  total: number;
  souple: boolean; // un As compte pour 11
}

export function valeurMain(cartes: Carte[]): Valeur {
  let total = 0;
  let as = false;
  for (const c of cartes) {
    total += valeurRang(c.r);
    if (c.r === "A") as = true;
  }
  if (as && total + 10 <= 21) return { total: total + 10, souple: true };
  return { total, souple: false };
}

export function estBlackjack(cartes: Carte[], issueDeSeparation: boolean): boolean {
  return !issueDeSeparation && cartes.length === 2 && valeurMain(cartes).total === 21;
}

export function estBust(cartes: Carte[]): boolean {
  return valeurMain(cartes).total > 21;
}

export function croupierDoitTirer(cartes: Carte[]): boolean {
  return valeurMain(cartes).total < 17;
}

export function peutSeparer(cartes: Carte[], dejaSeparee: boolean): boolean {
  return !dejaSeparee && cartes.length === 2 && valeurRang(cartes[0].r) === valeurRang(cartes[1].r);
}

export function peutDoubler(cartes: Carte[]): boolean {
  return cartes.length === 2;
}

export type Issue = "blackjack" | "gagne" | "egalite" | "perdu" | "bust";

/**
 * Montant total rendu au joueur (mise comprise) pour une main.
 * Retourne aussi l'issue pour l'affichage.
 */
export function reglerMain(
  joueur: Carte[],
  mise: number,
  issueDeSeparation: boolean,
  croupier: Carte[],
): { issue: Issue; rendu: number } {
  const bjJoueur = estBlackjack(joueur, issueDeSeparation);
  const bjCroupier = estBlackjack(croupier, false);
  if (bjJoueur && bjCroupier) return { issue: "egalite", rendu: mise };
  if (bjJoueur) return { issue: "blackjack", rendu: mise + Math.floor((mise * 3) / 2) };
  if (bjCroupier) return { issue: "perdu", rendu: 0 };
  const vj = valeurMain(joueur).total;
  if (vj > 21) return { issue: "bust", rendu: 0 };
  const vc = valeurMain(croupier).total;
  if (vc > 21 || vj > vc) return { issue: "gagne", rendu: mise * 2 };
  if (vj === vc) return { issue: "egalite", rendu: mise };
  return { issue: "perdu", rendu: 0 };
}
