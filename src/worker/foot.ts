import {
  type Candidat,
  choisir,
  COMPETITIONS,
  type CotesBookmaker,
  heureDeParis,
  interetDeBase,
  interetFinal,
  issueDuMatch,
  nomEquipe,
  nosCotes,
  type Probabilites,
  probabilitesMarche,
} from "../shared/foot";
import { jourParis, veille } from "./economie";
import type { Env } from "./env";
import { heureParis } from "./notifications";
import { annulerRencontre, reglerRencontre } from "./paris";

// Paris foot automatiques, avec API-Football (https://www.api-football.com, version 3) :
//  - vers 10 h, sélection des 2 matchs les plus intéressants du lendemain (compétition, équipes,
//    match serré), proposés à l'admin avec quelques remplaçants ;
//  - les paris s'ouvrent seuls la veille à 20 h, sauf si l'admin les retire ou les ouvre plus tôt ;
//  - le jour du match, les cotes sont recalculées (les paris déjà pris gardent la leur) ;
//  - après le match, le résultat est lu et les paris réglés (ou remboursés si le match est reporté).
// Quota : au plus 90 requêtes par jour (offre gratuite : 100).

const URL_API = "https://v3.football.api-sports.io";
const QUOTA_JOUR = 90;

export class ErreurApiFoot extends Error {}

// ───────── Réglages gardés dans la table config ─────────

async function lireConfig(db: D1Database, cle: string): Promise<string | null> {
  return (await db.prepare("SELECT valeur FROM config WHERE cle = ?").bind(cle).first<{ valeur: string }>())?.valeur ?? null;
}
async function ecrireConfig(db: D1Database, cle: string, valeur: string): Promise<void> {
  await db.prepare("INSERT INTO config (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").bind(cle, valeur).run();
}

/** Compte une requête dans le quota du jour. Retourne false si le quota est atteint. */
async function compterRequete(db: D1Database): Promise<boolean> {
  const jour = jourParis();
  const c = JSON.parse((await lireConfig(db, "api_football_compteur")) ?? "{}") as { jour?: string; n?: number };
  const n = c.jour === jour ? (c.n ?? 0) : 0;
  if (n >= QUOTA_JOUR) return false;
  await ecrireConfig(db, "api_football_compteur", JSON.stringify({ jour, n: n + 1 }));
  return true;
}

export async function requetesDuJour(db: D1Database): Promise<number> {
  const c = JSON.parse((await lireConfig(db, "api_football_compteur")) ?? "{}") as { jour?: string; n?: number };
  return c.jour === jourParis() ? (c.n ?? 0) : 0;
}

/** Appel à l'API. Les erreurs (clé, quota, offre) arrivent avec un code 200 et un champ `errors`. */
export async function appelApi<T = unknown>(env: Env, chemin: string, params: Record<string, string | number>): Promise<T> {
  if (!env.API_FOOTBALL_KEY) throw new ErreurApiFoot("Clé API-Football absente (secret API_FOOTBALL_KEY).");
  if (!(await compterRequete(env.DB))) throw new ErreurApiFoot(`Quota du jour atteint (${QUOTA_JOUR} requêtes).`);
  const url = new URL(chemin, env.API_FOOTBALL_URL || URL_API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const rep = await fetch(url, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
  const json = (await rep.json().catch(() => null)) as { errors?: unknown; response?: unknown } | null;
  if (!rep.ok || !json) throw new ErreurApiFoot(`API-Football a répondu ${rep.status}.`);
  const e = json.errors;
  const messages = Array.isArray(e) ? e.map(String) : e && typeof e === "object" ? Object.values(e).map(String) : [];
  if (messages.length) throw new ErreurApiFoot(messages.join(" · "));
  return json as T;
}

// ───────── Formats de l'API (les champs utilisés seulement) ─────────

interface Score {
  home: number | null;
  away: number | null;
}
interface Fixture {
  fixture: { id: number; timestamp: number; status: { short: string } };
  league: { id: number; name: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: Score;
  score?: { fulltime?: Score };
}
interface Cotes {
  bookmakers?: { name: string; bets?: { id: number; name: string; values?: { value: string; odd: string }[] }[] }[];
}

/** Cotes « vainqueur du match » de chaque bookmaker, puis probabilités du marché. */
async function probabilitesDuMatch(env: Env, fixtureId: number): Promise<Probabilites | null> {
  const r = await appelApi<{ response?: Cotes[] }>(env, "/odds", { fixture: fixtureId, bet: 1 });
  const lignes: CotesBookmaker[] = [];
  for (const b of r.response?.[0]?.bookmakers ?? []) {
    const pari = b.bets?.find((x) => x.id === 1 || /match winner/i.test(x.name));
    const v = (nom: string) => Number(pari?.values?.find((x) => x.value === nom)?.odd);
    if (pari) lignes.push({ home: v("Home"), draw: v("Draw"), away: v("Away") });
  }
  return probabilitesMarche(lignes);
}

// ───────── Sélection quotidienne ─────────

export interface BilanSelection {
  jour: string;
  le: number;
  matchsDuJour: number;
  candidats: number;
  retenus: string[];
  erreur?: string;
}

/** Choisit les 2 matchs d'un jour (AAAA-MM-JJ) et les propose. Remplace une proposition non entamée. */
export async function selectionnerJour(env: Env, jour: string): Promise<BilanSelection> {
  const db = env.DB;
  const bilan: BilanSelection = { jour, le: Date.now(), matchsDuJour: 0, candidats: 0, retenus: [] };
  try {
    const r = await appelApi<{ response?: Fixture[] }>(env, "/fixtures", { date: jour, timezone: "Europe/Paris" });
    const matchs = r.response ?? [];
    bilan.matchsDuJour = matchs.length;
    const candidats: Candidat[] = matchs
      .filter((m) => COMPETITIONS[m.league.id] && ["NS", "TBD"].includes(m.fixture.status.short))
      .map((m) => {
        const debut = m.fixture.timestamp * 1000;
        return { fixtureId: m.fixture.id, ligueId: m.league.id, equipe1: m.teams.home.name, equipe2: m.teams.away.name, debut, heureParis: heureParis(debut) };
      })
      .filter((c) => c.heureParis >= 12 && c.heureParis <= 23);
    // Les cotes coûtent une requête par match : seulement pour les 5 plus prometteurs.
    const prometteurs = [...candidats].sort((a, b) => interetDeBase(b) - interetDeBase(a)).filter((c) => interetDeBase(c) >= 45).slice(0, 5);
    const notes: (Candidat & { interet: number; p: Probabilites })[] = [];
    for (const c of prometteurs) {
      const p = await probabilitesDuMatch(env, c.fixtureId);
      if (p) notes.push({ ...c, p, interet: interetFinal(c, p) });
    }
    bilan.candidats = notes.length;
    const retenus = choisir(notes, 2);

    // Une proposition déjà faite pour ce jour, sans pari, est remplacée.
    const debutJour = heureDeParis(jour, 0);
    const finJour = debutJour + 24 * 3600 * 1000;
    await db
      .prepare("DELETE FROM rencontres WHERE source = 'api' AND statut = 'brouillon' AND debut >= ? AND debut < ? AND id NOT IN (SELECT rencontre_id FROM paris)")
      .bind(debutJour, finJour)
      .run();
    const ouverture = heureDeParis(veille(jour), 20); // la veille à 20 h
    const now = Date.now();
    for (const c of notes) {
      const choisi = retenus.includes(c);
      const cotes = nosCotes(c.p);
      await db
        .prepare(
          `INSERT OR IGNORE INTO rencontres (sport, competition, equipe1, equipe2, debut, cote1, coteN, cote2, statut, cree_le,
             source, fixture_id, ligue_id, selection, interet, ouverture_auto, cotes_marche, cotes_maj)
           VALUES ('Football', ?, ?, ?, ?, ?, ?, ?, 'brouillon', ?, 'api', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          COMPETITIONS[c.ligueId].nom, nomEquipe(c.equipe1), nomEquipe(c.equipe2), c.debut, cotes.cote1, cotes.coteN, cotes.cote2, now,
          c.fixtureId, c.ligueId, choisi ? 1 : 0, c.interet, choisi ? ouverture : null, JSON.stringify(c.p), now,
        )
        .run();
      if (choisi) bilan.retenus.push(`${nomEquipe(c.equipe1)} – ${nomEquipe(c.equipe2)}`);
    }
  } catch (e) {
    bilan.erreur = (e as Error).message;
  }
  await ecrireConfig(db, "paris_selection_jour", jour);
  await ecrireConfig(db, "paris_selection_bilan", JSON.stringify(bilan));
  return bilan;
}

export async function dernierBilan(db: D1Database): Promise<BilanSelection | null> {
  const v = await lireConfig(db, "paris_selection_bilan");
  return v ? (JSON.parse(v) as BilanSelection) : null;
}

/** Recalcule les cotes d'une rencontre importée (les paris déjà pris gardent leur cote). */
export async function rafraichirCotes(env: Env, id: number, fixtureId: number): Promise<boolean> {
  const p = await probabilitesDuMatch(env, fixtureId);
  if (!p) return false;
  const c = nosCotes(p);
  await env.DB.prepare("UPDATE rencontres SET cote1 = ?, coteN = ?, cote2 = ?, cotes_marche = ?, cotes_maj = ? WHERE id = ? AND statut IN ('brouillon', 'ouverte')")
    .bind(c.cote1, c.coteN, c.cote2, JSON.stringify(p), Date.now(), id)
    .run();
  return true;
}

// ───────── Tâche planifiée (toutes les 15 minutes) ─────────

export async function tacheParisFoot(env: Env): Promise<{ ouvertes: number; reglees: number; erreur?: string }> {
  const bilan: { ouvertes: number; reglees: number; erreur?: string } = { ouvertes: 0, reglees: 0 };
  if (!env.API_FOOTBALL_KEY) return bilan;
  const db = env.DB;
  const now = Date.now();
  try {
    // 1) Ouverture automatique des matchs retenus (la veille à 20 h).
    const o = await db
      .prepare("UPDATE rencontres SET statut = 'ouverte' WHERE source = 'api' AND selection = 1 AND statut = 'brouillon' AND ouverture_auto IS NOT NULL AND ouverture_auto <= ?1 AND debut > ?1")
      .bind(now)
      .run();
    bilan.ouvertes = o.meta.changes ?? 0;

    // 2) Sélection du lendemain, une fois par jour, à partir de 10 h.
    const demain = jourParis(now + 24 * 3600 * 1000);
    if (heureParis(now) >= 10 && (await lireConfig(db, "paris_selection_jour")) !== demain) await selectionnerJour(env, demain);

    // 3) Le jour du match, à partir de 8 h : cotes recalculées une fois.
    if (heureParis(now) >= 8) {
      const huitHeures = heureDeParis(jourParis(now), 8);
      const aJour = await db
        .prepare(
          `SELECT id, fixture_id FROM rencontres WHERE source = 'api' AND selection = 1 AND statut IN ('brouillon', 'ouverte')
             AND debut > ?1 AND debut < ?2 AND (cotes_maj IS NULL OR cotes_maj < ?3) LIMIT 3`,
        )
        .bind(now, heureDeParis(jourParis(now), 0) + 24 * 3600 * 1000, huitHeures)
        .all<{ id: number; fixture_id: number }>();
      for (const r of aJour.results) await rafraichirCotes(env, r.id, r.fixture_id);
    }

    // 4) Résultats : à partir de 1 h 55 après le coup d'envoi.
    const aRegler = await db
      .prepare("SELECT id, fixture_id, statut, selection, debut FROM rencontres WHERE source = 'api' AND statut IN ('brouillon', 'ouverte') AND debut < ? ORDER BY debut LIMIT 4")
      .bind(now - 115 * 60_000)
      .all<{ id: number; fixture_id: number; statut: string; selection: number; debut: number }>();
    for (const r of aRegler.results) {
      // Remplaçante jamais retenue, ou match jamais ouvert : rien à régler, on range.
      if (r.selection === 0 || r.statut === "brouillon") {
        const paris = await db.prepare("SELECT COUNT(*) AS n FROM paris WHERE rencontre_id = ?").bind(r.id).first<{ n: number }>();
        if (!paris?.n) {
          await db.prepare("DELETE FROM rencontres WHERE id = ?").bind(r.id).run();
          continue;
        }
      }
      const f = (await appelApi<{ response?: Fixture[] }>(env, "/fixtures", { id: r.fixture_id })).response?.[0];
      if (!f) continue;
      const issue = issueDuMatch(f.fixture.status.short, f.score?.fulltime ?? null, f.goals);
      if (issue === "annuler" || (issue === null && now - r.debut > 3 * 86_400_000)) {
        await annulerRencontre(db, r.id);
        bilan.reglees++;
      } else if (issue) {
        await reglerRencontre(db, r.id, issue);
        bilan.reglees++;
      }
    }
  } catch (e) {
    bilan.erreur = (e as Error).message;
    console.error("paris foot", e);
  }
  return bilan;
}

/** Bouton « Tester la connexion » : état du compte API-Football. */
export async function etatCompte(env: Env): Promise<{ plan: string; requetes: number; limite: number }> {
  const r = await appelApi<{ response?: { subscription?: { plan?: string }; requests?: { current?: number; limit_day?: number } } }>(env, "/status", {});
  return { plan: r.response?.subscription?.plan ?? "?", requetes: r.response?.requests?.current ?? 0, limite: r.response?.requests?.limit_day ?? 0 };
}
