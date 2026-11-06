export type Couleur = "S" | "H" | "D" | "C"; // pique, cœur, carreau, trèfle
export type Rang = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export interface Carte {
  r: Rang;
  c: Couleur;
}

export const RANGS: Rang[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const COULEURS: Couleur[] = ["S", "H", "D", "C"];
export const SYMBOLES: Record<Couleur, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANG_AFFICHE: Record<Rang, string> = {
  A: "A", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "10": "10",
  J: "V", Q: "D", K: "R", // valet, dame, roi
};

/** Tirage aléatoire uniforme dans [0, n). Injecté pour pouvoir tester le moteur. */
export type Aleatoire = (n: number) => number;

export function nouveauSabot(nbJeux: number, aleatoire: Aleatoire): Carte[] {
  const sabot: Carte[] = [];
  for (let j = 0; j < nbJeux; j++) for (const c of COULEURS) for (const r of RANGS) sabot.push({ r, c });
  // Mélange de Fisher-Yates
  for (let i = sabot.length - 1; i > 0; i--) {
    const k = aleatoire(i + 1);
    [sabot[i], sabot[k]] = [sabot[k], sabot[i]];
  }
  return sabot;
}

export function valeurRang(r: Rang): number {
  if (r === "A") return 1;
  if (r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}
