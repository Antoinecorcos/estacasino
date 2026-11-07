import { PSEUDO_REGEX } from "./regles";

// Filtre de pseudos : format, noms réservés (usurpation de l'équipe) et grossièretés courantes.
// La comparaison se fait sur une forme « normalisée » pour déjouer les variantes simples
// (majuscules, chiffres à la place des lettres, séparateurs).

const RESERVES = ["admin", "moderat", "modo", "croupier", "estacasino", "support", "staff", "officiel", "official", "systeme", "root"];

const GROSSIERETES = [
  "connard", "connasse", "salope", "salaud", "encule", "enkule", "pute", "putain", "batard", "bite", "couille", "chatte", "nique", "niktamer", "ntm", "fdp", "pd", "tapette", "pedale", "negro", "negre", "bougnoul", "youpin", "nazi", "hitler", "pedo", "viol",
  "fuck", "shit", "bitch", "cunt", "dick", "pussy", "whore", "slut", "nigger", "nigga", "faggot", "retard", "rape",
];

/** Mots courts : refusés seulement s'ils forment tout le pseudo ou un segment, pour ne pas bloquer « Pedro » ou « Bitcoin ». */
const COURTS = new Set(["pd", "ntm", "fdp", "bite", "pute", "dick", "viol", "pedo", "nazi", "nique", "retard", "rape", "shit"]);

const SUBSTITUTIONS: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s" };

function normaliser(pseudo: string): string {
  return pseudo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split("")
    .map((c) => SUBSTITUTIONS[c] ?? c)
    .join("");
}

export type VerdictPseudo = { ok: true } | { ok: false; raison: string };

export function verifierPseudo(pseudo: string): VerdictPseudo {
  if (!PSEUDO_REGEX.test(pseudo)) return { ok: false, raison: "Pseudo : 3 à 16 caractères (lettres, chiffres, « _ », « - » ou « . »)." };
  const n = normaliser(pseudo);
  const colle = n.replace(/[^a-z]/g, "");
  const segments = n.split(/[^a-z]+/).filter(Boolean);
  if (RESERVES.some((r) => colle.includes(r))) return { ok: false, raison: "Ce pseudo est réservé. Choisissez-en un autre." };
  for (const g of GROSSIERETES) {
    const interdit = COURTS.has(g) ? segments.includes(g) || colle === g : colle.includes(g);
    if (interdit) return { ok: false, raison: "Ce pseudo n'est pas autorisé. Restons élégants." };
  }
  return { ok: true };
}
