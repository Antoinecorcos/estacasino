import { COTE_MAX, REDISTRIBUTION } from "./paris";

// Paris foot automatiques : sélection des matchs du jour et calcul des cotes Estacasino à partir
// des cotes du marché (API-Football). Module pur, testé à part.

/** Compétitions suivies (identifiants API-Football) et leur poids dans l'intérêt d'un match. */
export const COMPETITIONS: Record<number, { nom: string; poids: number }> = {
  2: { nom: "Ligue des champions", poids: 100 },
  3: { nom: "Ligue Europa", poids: 60 },
  848: { nom: "Ligue Conférence", poids: 40 },
  61: { nom: "Ligue 1", poids: 75 },
  39: { nom: "Premier League", poids: 60 },
  140: { nom: "Liga", poids: 55 },
  135: { nom: "Serie A", poids: 50 },
  78: { nom: "Bundesliga", poids: 50 },
  66: { nom: "Coupe de France", poids: 45 },
};

/** Équipes qui attirent les parieurs (motif cherché dans le nom fourni par l'API, et bonus). */
const POPULAIRES: [RegExp, number][] = [
  [/paris saint|psg/i, 40],
  [/marseille/i, 35],
  [/^lyon|olympique lyon/i, 25],
  [/monaco/i, 18],
  [/^lille|losc/i, 18],
  [/^lens/i, 18],
  [/^nice/i, 12],
  [/rennes/i, 12],
  [/real madrid/i, 35],
  [/barcelona/i, 35],
  [/atletico/i, 18],
  [/bayern/i, 30],
  [/dortmund/i, 18],
  [/manchester city/i, 28],
  [/manchester united/i, 25],
  [/liverpool/i, 28],
  [/arsenal/i, 25],
  [/chelsea/i, 20],
  [/tottenham/i, 15],
  [/juventus/i, 20],
  [/^inter\b|internazionale/i, 22],
  [/ac milan|^milan/i, 20],
  [/napoli/i, 15],
];

/** Noms courts à afficher pour quelques clubs (sinon, le nom de l'API). */
const NOMS_COURTS: [RegExp, string][] = [
  [/paris saint.?germain/i, "Paris SG"],
  [/^marseille$/i, "Marseille"],
  [/^olympique lyonnais$/i, "Lyon"],
  [/bayern m(ü|u)nchen|bayern munich/i, "Bayern Munich"],
  [/borussia dortmund/i, "Dortmund"],
  [/atletico madrid/i, "Atlético Madrid"],
  [/inter$|internazionale/i, "Inter Milan"],
];

export function nomEquipe(nom: string): string {
  for (const [m, court] of NOMS_COURTS) if (m.test(nom)) return court;
  return nom.length > 40 ? `${nom.slice(0, 39)}…` : nom;
}

export function popularite(nom: string): number {
  for (const [m, bonus] of POPULAIRES) if (m.test(nom)) return bonus;
  return 0;
}

export interface Candidat {
  fixtureId: number;
  ligueId: number;
  equipe1: string;
  equipe2: string;
  debut: number; // ms
  heureParis: number; // 0-23
}

/** Intérêt d'un match avant de connaître les cotes : compétition, équipes, horaire. */
export function interetDeBase(c: Candidat): number {
  const comp = COMPETITIONS[c.ligueId]?.poids ?? 0;
  const p1 = popularite(c.equipe1);
  const p2 = popularite(c.equipe2);
  const affiche = p1 > 0 && p2 > 0 ? 25 : 0; // deux grosses équipes : une affiche
  const soiree = c.heureParis >= 18 && c.heureParis <= 22 ? 10 : 0;
  return comp + p1 + p2 + affiche + soiree;
}

export interface Probabilites {
  p1: number;
  pN: number;
  p2: number;
}

export interface CotesBookmaker {
  home: number;
  draw: number;
  away: number;
}

/**
 * Probabilités « vraies » estimées par le marché : pour chaque bookmaker, on retire sa marge
 * (normalisation), puis on fait la moyenne. Retourne null sans cotes exploitables.
 */
export function probabilitesMarche(bookmakers: CotesBookmaker[]): Probabilites | null {
  const valides = bookmakers.filter((b) => [b.home, b.draw, b.away].every((x) => Number.isFinite(x) && x > 1));
  if (!valides.length) return null;
  let p1 = 0;
  let pN = 0;
  let p2 = 0;
  for (const b of valides) {
    const s = 1 / b.home + 1 / b.draw + 1 / b.away;
    if (s < 0.95 || s > 1.3) continue; // cotes incohérentes : ignorées
    p1 += 1 / b.home / s;
    pN += 1 / b.draw / s;
    p2 += 1 / b.away / s;
  }
  const n = p1 + pN + p2;
  if (!n) return null;
  return { p1: p1 / n, pN: pN / n, p2: p2 / n };
}

/** Cote Estacasino : redistribution de 95 %, arrondie au centième inférieur, plafonnée à 6. */
export function coteEstacasino(p: number, redistribution = REDISTRIBUTION): number {
  if (!(p > 0)) return COTE_MAX;
  return Math.min(COTE_MAX, Math.max(1.01, Math.floor((redistribution / p) * 100) / 100));
}

export function nosCotes(p: Probabilites): { cote1: number; coteN: number; cote2: number } {
  return { cote1: coteEstacasino(p.p1), coteN: coteEstacasino(p.pN), cote2: coteEstacasino(p.p2) };
}

/** Équilibre d'un match (1 = indécis, 0 = joué d'avance), d'après l'écart entre les deux équipes. */
export function equilibre(p: Probabilites): number {
  return Math.max(0, 1 - Math.abs(p.p1 - p.p2) / 0.8);
}

/** Intérêt final : base + équilibre (un match serré est plus amusant à parier). */
export function interetFinal(c: Candidat, p: Probabilites): number {
  return interetDeBase(c) + Math.round(equilibre(p) * 30);
}

/** Les meilleurs matchs du jour, sans dépasser `n`, et seulement s'ils sont assez intéressants. */
export function choisir<T extends { interet: number }>(liste: T[], n = 2, seuil = 60): T[] {
  return [...liste].sort((a, b) => b.interet - a.interet).filter((x) => x.interet >= seuil).slice(0, n);
}

/** Codes de statut API-Football. */
const TERMINES = new Set(["FT", "AET", "PEN"]);
const ANNULES = new Set(["PST", "CANC", "ABD", "AWD", "WO"]);

/**
 * Issue d'un match pour un pari 1 / N / 2, sur le temps réglementaire (90 minutes, arrêts de jeu
 * compris), comme chez les bookmakers. « annuler » : reporté, annulé, arrêté… (mises rendues).
 * null : pas encore terminé.
 */
export function issueDuMatch(statut: string, tempsReglementaire: { home: number | null; away: number | null } | null, final: { home: number | null; away: number | null } | null): "1" | "N" | "2" | "annuler" | null {
  if (ANNULES.has(statut)) return "annuler";
  if (!TERMINES.has(statut)) return null;
  const s = tempsReglementaire && tempsReglementaire.home !== null && tempsReglementaire.away !== null ? tempsReglementaire : final;
  if (!s || s.home === null || s.away === null) return null;
  return s.home > s.away ? "1" : s.home < s.away ? "2" : "N";
}

/** Date (ms) d'une heure de Paris donnée, pour un jour AAAA-MM-JJ (heure d'été comprise). */
export function heureDeParis(jour: string, heure: number, minute = 0): number {
  const [a, m, j] = jour.split("-").map(Number);
  const guess = Date.UTC(a, m - 1, j, heure, minute);
  const partie = (ms: number) => {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms);
    return Number(f.find((x) => x.type === "hour")!.value) * 60 + Number(f.find((x) => x.type === "minute")!.value);
  };
  // Décalage de Paris à cette date : 60 ou 120 minutes.
  const decalage = partie(guess) - (heure * 60 + minute);
  const d = ((decalage % 1440) + 1440) % 1440;
  return guess - d * 60_000;
}
