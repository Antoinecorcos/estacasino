import { CLASSEMENT_MIN_PARTIES, formatJetons } from "../shared/regles";
import { crediter, oublierSaison } from "./economie";
import type { Env } from "./env";
import { notifierJoueur } from "./notifications";

// Fin de saison : quand une saison avec des récompenses prévues se termine, la tâche planifiée
// désigne les champions, verse les jetons et inscrit le palmarès (badges affichés la saison suivante).
//  - général : le premier du classement général reçoit `general` jetons ;
//  - chaque jeu : le premier reçoit `parJeu` jetons, sauf s'il est déjà le champion général
//    (il garde alors le titre et le badge du jeu, sans jetons en plus).

export type TitrePalmares = "general" | "blackjack" | "roulette" | "poker" | "machine";
export interface RecompensesSaison {
  general: number;
  parJeu: number;
}

export const NOMS_TITRES: Record<TitrePalmares, string> = {
  general: "classement général",
  blackjack: "blackjack",
  roulette: "roulette",
  poker: "poker",
  machine: "machine à sous",
};

/** Colonnes du classement de chaque titre (mêmes règles que la page Classement). */
const COLONNES: Record<TitrePalmares, [gains: string, parties: string]> = {
  general: ["gains_nets", "mains"],
  blackjack: ["gains_bj", "mains_bj"],
  roulette: ["gains_roulette", "tours_roulette"],
  poker: ["gains_poker", "mains_poker"],
  machine: ["gains_machine", "tours_machine"],
};

export function validerRecompenses(r: unknown): RecompensesSaison | null {
  const o = r as Partial<RecompensesSaison> | null;
  if (!o) return null;
  const ok = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 10_000_000;
  return ok(o.general) && ok(o.parJeu) ? { general: o.general!, parJeu: o.parJeu! } : null;
}

/** Premier d'un classement de la saison (au moins 5 parties, comptes actifs), ou null. */
async function premier(db: D1Database, saisonId: number, titre: TitrePalmares): Promise<{ id: string; pseudo: string } | null> {
  const [gains, parties] = COLONNES[titre];
  return db
    .prepare(
      `SELECT j.id, j.pseudo FROM stats_saison s JOIN joueurs j ON j.id = s.joueur_id
       WHERE s.saison_id = ? AND s.${parties} >= ? AND j.suspendu = 0 AND j.supprime_le IS NULL
       ORDER BY s.${gains} DESC, s.${parties} ASC LIMIT 1`,
    )
    .bind(saisonId, CLASSEMENT_MIN_PARTIES)
    .first<{ id: string; pseudo: string }>();
}

/**
 * Distribue les récompenses d'une saison terminée. Une seule fois : la saison est marquée avant tout
 * versement. Retourne le palmarès établi.
 */
export async function distribuerRecompensesSaison(
  env: Env,
  saison: { id: number; nom: string; recompenses: string | null },
): Promise<{ titre: TitrePalmares; pseudo: string; jetons: number }[]> {
  const db = env.DB;
  const r = validerRecompenses(saison.recompenses ? JSON.parse(saison.recompenses) : null);
  if (!r) return [];
  const marque = await db.prepare("UPDATE saisons SET recompenses_le = ? WHERE id = ? AND recompenses_le IS NULL").bind(Date.now(), saison.id).run();
  if (marque.meta.changes !== 1) return []; // déjà fait

  const resultat: { titre: TitrePalmares; pseudo: string; jetons: number; id: string }[] = [];
  const champion = await premier(db, saison.id, "general");
  if (champion) resultat.push({ titre: "general", pseudo: champion.pseudo, id: champion.id, jetons: r.general });
  for (const titre of ["blackjack", "roulette", "poker", "machine"] as const) {
    const p = await premier(db, saison.id, titre);
    if (p) resultat.push({ titre, pseudo: p.pseudo, id: p.id, jetons: p.id === champion?.id ? 0 : r.parJeu });
  }
  const now = Date.now();
  for (const x of resultat) {
    await db.prepare("INSERT OR IGNORE INTO palmares (saison_id, titre, joueur_id, jetons, le) VALUES (?, ?, ?, ?, ?)").bind(saison.id, x.titre, x.id, x.jetons, now).run();
    if (x.jetons > 0) await crediter(db, x.id, x.jetons, "saison", null, `saison-${saison.id}`);
  }
  // Prévenir les champions sur leur téléphone (s'ils ont activé les notifications).
  const parJoueur = new Map<string, { titres: string[]; jetons: number }>();
  for (const x of resultat) {
    const e = parJoueur.get(x.id) ?? { titres: [], jetons: 0 };
    e.titres.push(NOMS_TITRES[x.titre]);
    e.jetons += x.jetons;
    parJoueur.set(x.id, e);
  }
  for (const [id, e] of parJoueur) {
    await notifierJoueur(env, id, {
      titre: `Champion de la ${saison.nom} !`,
      texte: `Premier au ${e.titres.join(", ")}${e.jetons ? ` : ${formatJetons(e.jetons)} jetons crédités` : ""}. Votre badge vous suit toute la saison prochaine.`,
      url: "/classement",
      tag: `saison-${saison.id}`,
    }).catch(() => 0);
  }
  oublierSaison();
  palmaresEnCache = null;
  return resultat.map(({ titre, pseudo, jetons }) => ({ titre, pseudo, jetons }));
}

/** Tâche planifiée : récompenses des saisons terminées qui en prévoient. */
export async function tacheSaisons(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT id, nom, recompenses FROM saisons WHERE fin <= ? AND recompenses IS NOT NULL AND recompenses_le IS NULL ORDER BY id")
    .bind(Date.now())
    .all<{ id: number; nom: string; recompenses: string | null }>();
  let n = 0;
  for (const s of r.results) n += (await distribuerRecompensesSaison(env, s)).length;
  return n;
}

/**
 * Palmarès de la saison précédant celle-ci (les badges affichés pendant la saison en cours) :
 * joueur → titres remportés.
 */
export async function badgesSaisonPrecedente(db: D1Database, saisonId: number): Promise<{ saison: string | null; badges: Map<string, TitrePalmares[]> }> {
  const r = await db
    .prepare(
      `SELECT p.joueur_id, p.titre, s.nom FROM palmares p JOIN saisons s ON s.id = p.saison_id
       WHERE p.saison_id = (SELECT MAX(id) FROM saisons WHERE id < ? AND recompenses_le IS NOT NULL)`,
    )
    .bind(saisonId)
    .all<{ joueur_id: string; titre: TitrePalmares; nom: string }>();
  const badges = new Map<string, TitrePalmares[]>();
  for (const l of r.results) badges.set(l.joueur_id, [...(badges.get(l.joueur_id) ?? []), l.titre]);
  return { saison: r.results[0]?.nom ?? null, badges };
}

let palmaresEnCache: { valeur: PalmaresRecent | null; expire: number } | null = null;
export interface PalmaresRecent {
  saison: string;
  champions: { titre: TitrePalmares; pseudo: string; jetons: number }[];
}

/** Palmarès de la dernière saison récompensée, pendant les 7 jours qui suivent (gardé 60 s en mémoire). */
export async function palmaresRecent(db: D1Database): Promise<PalmaresRecent | null> {
  const now = Date.now();
  if (palmaresEnCache && palmaresEnCache.expire > now) return palmaresEnCache.valeur;
  const s = await db
    .prepare("SELECT id, nom FROM saisons WHERE recompenses_le IS NOT NULL AND recompenses_le > ? ORDER BY id DESC LIMIT 1")
    .bind(now - 7 * 24 * 3600 * 1000)
    .first<{ id: number; nom: string }>();
  let valeur: PalmaresRecent | null = null;
  if (s) {
    const r = await db
      .prepare(
        `SELECT p.titre, j.pseudo, p.jetons FROM palmares p JOIN joueurs j ON j.id = p.joueur_id WHERE p.saison_id = ?
         ORDER BY CASE p.titre WHEN 'general' THEN 0 WHEN 'blackjack' THEN 1 WHEN 'roulette' THEN 2 WHEN 'poker' THEN 3 ELSE 4 END`,
      )
      .bind(s.id)
      .all<{ titre: TitrePalmares; pseudo: string; jetons: number }>();
    if (r.results.length) valeur = { saison: s.nom, champions: r.results };
  }
  palmaresEnCache = { valeur, expire: now + 60_000 };
  return valeur;
}
