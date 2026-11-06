// Roulette européenne : 37 cases (0 à 36), un seul zéro.
// Sur le zéro, toutes les mises simples (rouge, noir, pair, impair, manque, passe) sont perdues.

export const ROUGES = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Ordre des numéros sur la roue européenne, dans le sens horaire à partir du zéro. */
export const ORDRE_ROUE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22,
  18, 29, 7, 28, 12, 35, 3, 26,
];

export function couleurNumero(n: number): "vert" | "rouge" | "noir" {
  if (n === 0) return "vert";
  return ROUGES.has(n) ? "rouge" : "noir";
}

/**
 * Clé d'une mise : "plein:17", "rouge", "noir", "pair", "impair", "manque", "passe",
 * "douzaine:1|2|3", "colonne:1|2|3".
 */
export type CleMise = string;

export interface DefinitionMise {
  cle: CleMise;
  libelle: string;
  /** Gain net pour 1 jeton misé. */
  paiement: number;
}

export function definitionMise(cle: CleMise): DefinitionMise | null {
  const [type, arg] = cle.split(":");
  const n = arg === undefined ? NaN : Number(arg);
  switch (type) {
    case "plein":
      if (Number.isInteger(n) && n >= 0 && n <= 36 && arg === String(n)) return { cle, libelle: `Plein ${n}`, paiement: 35 };
      return null;
    case "rouge":
    case "noir":
    case "pair":
    case "impair":
      if (arg !== undefined) return null;
      return { cle, libelle: type[0].toUpperCase() + type.slice(1), paiement: 1 };
    case "manque":
      return arg === undefined ? { cle, libelle: "Manque (1-18)", paiement: 1 } : null;
    case "passe":
      return arg === undefined ? { cle, libelle: "Passe (19-36)", paiement: 1 } : null;
    case "douzaine":
      if (arg === "1" || arg === "2" || arg === "3") return { cle, libelle: `${["1re", "2e", "3e"][n - 1]} douzaine`, paiement: 2 };
      return null;
    case "colonne":
      if (arg === "1" || arg === "2" || arg === "3") return { cle, libelle: `${["1re", "2e", "3e"][n - 1]} colonne`, paiement: 2 };
      return null;
    default:
      return null;
  }
}

export function miseGagnante(cle: CleMise, numero: number): boolean {
  const [type, arg] = cle.split(":");
  const n = Number(arg);
  if (type === "plein") return numero === n;
  if (numero === 0) return false;
  switch (type) {
    case "rouge":
      return ROUGES.has(numero);
    case "noir":
      return !ROUGES.has(numero);
    case "pair":
      return numero % 2 === 0;
    case "impair":
      return numero % 2 === 1;
    case "manque":
      return numero <= 18;
    case "passe":
      return numero >= 19;
    case "douzaine":
      return Math.ceil(numero / 12) === n;
    case "colonne":
      return ((numero - 1) % 3) + 1 === n;
    default:
      return false;
  }
}

/** Montant total rendu (mise comprise) pour une mise donnée. */
export function rendreMise(cle: CleMise, montant: number, numero: number): number {
  const def = definitionMise(cle);
  if (!def || !miseGagnante(cle, numero)) return 0;
  return montant * (def.paiement + 1);
}
