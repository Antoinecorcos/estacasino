// Défis quotidiens : 3 par jour et par joueur, récompensés en jetons (gratuits, sans valeur).
// Le choix est déterministe (même joueur, même jour = mêmes défis) : pas besoin de tirage stocké à l'avance.

export type TypeDefi = "main_bj" | "gain_bj" | "blackjack" | "double_gagne" | "tour_rl" | "gain_rl" | "plein_gagne" | "rouge_gagne" | "room";

export interface ModeleDefi {
  id: string;
  type: TypeDefi;
  objectif: number;
  recompense: number;
  titre: string;
  jeu: "blackjack" | "roulette" | "room";
}

export const DEFIS: ModeleDefi[] = [
  { id: "bj10", type: "main_bj", objectif: 10, recompense: 600, titre: "Jouer 10 mains de blackjack", jeu: "blackjack" },
  { id: "bjg3", type: "gain_bj", objectif: 3, recompense: 800, titre: "Gagner 3 mains de blackjack", jeu: "blackjack" },
  { id: "bjbj", type: "blackjack", objectif: 1, recompense: 1_000, titre: "Obtenir un blackjack", jeu: "blackjack" },
  { id: "bjdb", type: "double_gagne", objectif: 1, recompense: 1_000, titre: "Doubler… et gagner", jeu: "blackjack" },
  { id: "rl8", type: "tour_rl", objectif: 8, recompense: 600, titre: "Jouer 8 tours de roulette", jeu: "roulette" },
  { id: "rlg3", type: "gain_rl", objectif: 3, recompense: 800, titre: "Finir 3 tours de roulette gagnant", jeu: "roulette" },
  { id: "rlpl", type: "plein_gagne", objectif: 1, recompense: 1_500, titre: "Toucher un plein à la roulette", jeu: "roulette" },
  { id: "rlr3", type: "rouge_gagne", objectif: 3, recompense: 700, titre: "Gagner 3 fois sur le rouge", jeu: "roulette" },
  { id: "room3", type: "room", objectif: 3, recompense: 1_000, titre: "Jouer 3 parties à une table entre amis", jeu: "room" },
];

function hachage(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Les 3 défis du jour d'un joueur : un de blackjack, un de roulette, et un troisième parmi les autres. */
export function defisDuJour(joueurId: string, jour: string): ModeleDefi[] {
  const h = hachage(`${joueurId}|${jour}`);
  const bj = DEFIS.filter((d) => d.jeu === "blackjack");
  const rl = DEFIS.filter((d) => d.jeu === "roulette");
  const a = bj[h % bj.length];
  const b = rl[(h >>> 8) % rl.length];
  const restants = DEFIS.filter((d) => d !== a && d !== b);
  const c = restants[(h >>> 16) % restants.length];
  return [a, b, c];
}

export interface DefiDuJour {
  defi: string;
  titre: string;
  objectif: number;
  progression: number;
  recompense: number;
  reclame: boolean;
}
