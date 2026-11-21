import { Hono, type Context } from "hono";
import { lireAvatar } from "../shared/avatar";
import {
  type Evenement,
  increment,
  jeuCompte,
  jourDuCalendrier,
  type ParamsBoost,
  type ParamsCalendrier,
  type ParamsClassement,
  type ParamsObjectif,
  type TypeEvenement,
  type Visibilite,
} from "../shared/evenements";
import type { Jeu } from "../shared/regles";
import { joueurConnecte } from "./auth";
import { crediter, jourParis } from "./economie";
import type { Env } from "./env";
import { notifierJoueur } from "./notifications";

// Moteur des événements paramétrables. Tant qu'aucun événement n'est en visibilité « admins » ou
// « tous », rien ne change pour personne : la liste est gardée en mémoire 20 secondes et vide,
// donc aucune requête de plus pendant les parties.

/** Après la fin, un événement reste affiché 48 h (résultats, récompense collective à récupérer). */
export const RETENUE_MS = 48 * 3600 * 1000;

interface Ligne {
  id: number;
  type: TypeEvenement;
  titre: string;
  description: string;
  debut: number;
  fin: number;
  visibilite: Visibilite;
  notifier: number;
  params: string;
  cloture: number;
}

export function lireLigne(l: Ligne): Evenement {
  return { ...l, notifier: !!l.notifier, cloture: !!l.cloture, params: JSON.parse(l.params) };
}

let cache: { liste: Evenement[]; expire: number } | null = null;

/** Événements publiés (admins ou tous) qui ne sont pas terminés depuis plus de 48 h. */
async function publies(db: D1Database): Promise<Evenement[]> {
  const now = Date.now();
  if (cache && cache.expire > now) return cache.liste;
  const r = await db
    .prepare("SELECT * FROM evenements WHERE visibilite <> 'brouillon' AND fin > ? AND debut <= ? ORDER BY debut")
    .bind(now - RETENUE_MS, now + 60_000)
    .all<Ligne>();
  cache = { liste: r.results.map(lireLigne), expire: now + 20_000 };
  return cache.liste;
}

/** À appeler après une modification dans l'Admin. */
export function oublierEvenements(): void {
  cache = null;
}

const enCours = (e: Evenement, now = Date.now()) => e.debut <= now && now < e.fin;
const visiblePour = (e: Evenement, admin: boolean) => e.visibilite === "tous" || (e.visibilite === "admins" && admin);

/** Événements visibles par ce joueur (en cours, ou terminés depuis moins de 48 h). */
export async function evenementsPour(db: D1Database, role: string): Promise<Evenement[]> {
  const liste = await publies(db);
  const now = Date.now();
  return liste.filter((e) => visiblePour(e, role === "admin") && e.debut <= now);
}

/** Multiplicateurs des boosts en cours (le plus fort l'emporte s'il y en a plusieurs). */
export async function boosts(db: D1Database, role: string): Promise<{ defis: number; bonus: number }> {
  const actifs = (await evenementsPour(db, role)).filter((e) => e.type === "boost" && enCours(e));
  return {
    defis: Math.max(1, ...actifs.map((e) => (e.params as ParamsBoost).multDefis)),
    bonus: Math.max(1, ...actifs.map((e) => (e.params as ParamsBoost).multBonus)),
  };
}

/**
 * Après chaque partie (blackjack, roulette, machine, poker) : fait avancer les défis collectifs et les
 * classements éclairs concernés. Aucune requête quand aucun événement n'est en cours.
 */
export async function progresserEvenements(db: D1Database, joueurId: string, jeu: Jeu, mise: number, net: number): Promise<void> {
  try {
    const now = Date.now();
    const concernes = (await publies(db)).filter(
      (e) => (e.type === "objectif" || e.type === "classement") && enCours(e, now) && jeuCompte((e.params as ParamsObjectif | ParamsClassement).jeu, jeu),
    );
    if (!concernes.length) return;
    let admin: boolean | null = null;
    const requetes: D1PreparedStatement[] = [];
    for (const e of concernes) {
      if (e.visibilite === "admins") {
        admin ??= (await db.prepare("SELECT role FROM joueurs WHERE id = ?").bind(joueurId).first<{ role: string }>())?.role === "admin";
        if (!admin) continue;
      }
      const p = e.params as ParamsObjectif | ParamsClassement;
      requetes.push(
        db.prepare(
          `INSERT INTO evenements_joueurs (evenement_id, joueur_id, valeur, parties) VALUES (?1, ?2, ?3, 1)
           ON CONFLICT (evenement_id, joueur_id) DO UPDATE SET valeur = valeur + excluded.valeur, parties = parties + 1`,
        ).bind(e.id, joueurId, increment(p.mesure, mise, net)),
      );
    }
    if (requetes.length) await db.batch(requetes);
  } catch (e) {
    console.error("événements", e); // un événement ne doit jamais bloquer une partie
  }
}

// ───────── Vue joueur ─────────

export interface VueEvenement {
  id: number;
  type: TypeEvenement;
  titre: string;
  description: string;
  debut: number;
  fin: number;
  enCours: boolean;
  test: boolean; // visible des admins seulement
  boost?: ParamsBoost;
  objectif?: ParamsObjectif & { total: number; maContribution: number; atteint: boolean; recupere: boolean };
  classement?: ParamsClassement & {
    lignes: { rang: number; pseudo: string; avatar: unknown; valeur: number }[];
    moi: { rang: number; valeur: number } | null;
    cloture: boolean;
    maRecompense: number | null;
  };
  calendrier?: { recompenses: number[]; jour: number; recuperes: number[] };
}

async function vue(db: D1Database, e: Evenement, joueurId: string): Promise<VueEvenement> {
  const base: VueEvenement = {
    id: e.id, type: e.type, titre: e.titre, description: e.description, debut: e.debut, fin: e.fin,
    enCours: enCours(e), test: e.visibilite === "admins",
  };
  if (e.type === "boost") return { ...base, boost: e.params as ParamsBoost };
  if (e.type === "objectif") {
    const [total, moi] = await db.batch([
      db.prepare("SELECT COALESCE(SUM(valeur), 0) AS total FROM evenements_joueurs WHERE evenement_id = ?").bind(e.id),
      db.prepare("SELECT valeur, recompense_le FROM evenements_joueurs WHERE evenement_id = ? AND joueur_id = ?").bind(e.id, joueurId),
    ]);
    const p = e.params as ParamsObjectif;
    const t = (total.results[0] as { total: number }).total;
    const m = moi.results[0] as { valeur: number; recompense_le: number | null } | undefined;
    return { ...base, objectif: { ...p, total: t, maContribution: m?.valeur ?? 0, atteint: t >= p.cible, recupere: !!m?.recompense_le } };
  }
  if (e.type === "classement") {
    const p = e.params as ParamsClassement;
    const [top, moi] = await db.batch([
      db.prepare(
        `SELECT j.pseudo, j.avatar, ej.valeur FROM evenements_joueurs ej JOIN joueurs j ON j.id = ej.joueur_id
         WHERE ej.evenement_id = ? AND ej.parties > 0 AND j.suspendu = 0 AND j.supprime_le IS NULL
         ORDER BY ej.valeur DESC, ej.parties ASC LIMIT 10`,
      ).bind(e.id),
      db.prepare(
        `SELECT ej.valeur, ej.parties, ej.recompense,
           (SELECT COUNT(*) + 1 FROM evenements_joueurs x WHERE x.evenement_id = ej.evenement_id AND x.valeur > ej.valeur) AS rang
         FROM evenements_joueurs ej WHERE ej.evenement_id = ? AND ej.joueur_id = ?`,
      ).bind(e.id, joueurId),
    ]);
    const m = moi.results[0] as { valeur: number; parties: number; recompense: number | null; rang: number } | undefined;
    return {
      ...base,
      classement: {
        ...p,
        lignes: (top.results as { pseudo: string; avatar: string; valeur: number }[]).map((l, i) => ({ rang: i + 1, pseudo: l.pseudo, avatar: lireAvatar(l.avatar), valeur: l.valeur })),
        // Un participant est classé dès sa première partie, même en perte (gains nets négatifs).
        moi: m && m.parties > 0 ? { rang: m.rang, valeur: m.valeur } : null,
        cloture: e.cloture,
        maRecompense: m?.recompense ?? null,
      },
    };
  }
  const p = e.params as ParamsCalendrier;
  const r = await db.prepare("SELECT jour FROM evenements_cadeaux WHERE evenement_id = ? AND joueur_id = ?").bind(e.id, joueurId).all<{ jour: number }>();
  return { ...base, calendrier: { recompenses: p.recompenses, jour: jourDuCalendrier(jourParis(e.debut), jourParis()), recuperes: r.results.map((x) => x.jour) } };
}

// ───────── Routes joueurs ─────────

type C = Context<{ Bindings: Env }>;
export const evenements = new Hono<{ Bindings: Env }>();

evenements.get("/", async (c: C) => {
  const moi = await joueurConnecte(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const liste = await evenementsPour(c.env.DB, moi.role);
  return c.json({ evenements: await Promise.all(liste.map((e) => vue(c.env.DB, e, moi.id))) });
});

evenements.post("/:id/recuperer", async (c: C) => {
  const moi = await joueurConnecte(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const db = c.env.DB;
  const e = (await evenementsPour(db, moi.role)).find((x) => x.id === Number(c.req.param("id")));
  if (!e) return c.json({ erreur: "Cet événement n'est pas disponible." }, 404);
  const now = Date.now();

  if (e.type === "objectif") {
    const p = e.params as ParamsObjectif;
    const total = await db.prepare("SELECT COALESCE(SUM(valeur), 0) AS t FROM evenements_joueurs WHERE evenement_id = ?").bind(e.id).first<{ t: number }>();
    if ((total?.t ?? 0) < p.cible) return c.json({ erreur: "L'objectif n'est pas encore atteint. On compte sur vous !" }, 409);
    // Une seule fois, et seulement pour ceux qui ont participé.
    const r = await db
      .prepare("UPDATE evenements_joueurs SET recompense = ?, recompense_le = ? WHERE evenement_id = ? AND joueur_id = ? AND parties > 0 AND recompense_le IS NULL")
      .bind(p.recompense, now, e.id, moi.id)
      .run();
    if (r.meta.changes !== 1) return c.json({ erreur: "Récompense déjà récupérée, ou vous n'avez pas participé." }, 409);
    const solde = await crediter(db, moi.id, p.recompense, "evenement", null, `evt-${e.id}`);
    return c.json({ ok: true, montant: p.recompense, solde });
  }

  if (e.type === "calendrier") {
    if (!enCours(e, now)) return c.json({ erreur: "Le calendrier est terminé." }, 409);
    const p = e.params as ParamsCalendrier;
    const jour = jourDuCalendrier(jourParis(e.debut), jourParis(now));
    const montant = p.recompenses[jour];
    if (montant === undefined || jour < 0) return c.json({ erreur: "Pas de cadeau aujourd'hui." }, 409);
    const r = await db.prepare("INSERT OR IGNORE INTO evenements_cadeaux (evenement_id, joueur_id, jour, le) VALUES (?, ?, ?, ?)").bind(e.id, moi.id, jour, now).run();
    if (r.meta.changes !== 1) return c.json({ erreur: "Cadeau du jour déjà ouvert. Revenez demain !" }, 409);
    const solde = await crediter(db, moi.id, montant, "evenement", null, `evt-${e.id}`);
    return c.json({ ok: true, montant, solde });
  }
  return c.json({ erreur: "Rien à récupérer pour cet événement." }, 400);
});

// ───────── Tâche planifiée : clôtures et notifications ─────────

/** Distribue les récompenses d'un classement terminé (une seule fois). Retourne le nombre de gagnants. */
export async function cloturerClassement(db: D1Database, e: Evenement): Promise<number> {
  const marque = await db.prepare("UPDATE evenements SET cloture = 1 WHERE id = ? AND cloture = 0").bind(e.id).run();
  if (marque.meta.changes !== 1) return 0; // déjà fait (ou en cours ailleurs)
  const p = e.params as ParamsClassement;
  const top = await db
    .prepare(
      `SELECT ej.joueur_id FROM evenements_joueurs ej JOIN joueurs j ON j.id = ej.joueur_id
       WHERE ej.evenement_id = ? AND ej.parties > 0 AND j.suspendu = 0 AND j.supprime_le IS NULL
       ORDER BY ej.valeur DESC, ej.parties ASC LIMIT ?`,
    )
    .bind(e.id, p.recompenses.length)
    .all<{ joueur_id: string }>();
  const now = Date.now();
  for (const [i, l] of top.results.entries()) {
    await db.prepare("UPDATE evenements_joueurs SET recompense = ?, recompense_le = ? WHERE evenement_id = ? AND joueur_id = ?").bind(p.recompenses[i], now, e.id, l.joueur_id).run();
    await crediter(db, l.joueur_id, p.recompenses[i], "evenement", null, `evt-${e.id}`);
  }
  oublierEvenements();
  return top.results.length;
}

/** Passage de la tâche planifiée : clôture des classements terminés, notifications de démarrage. */
export async function tacheEvenements(env: Env, budget = 20): Promise<{ clotures: number; notifies: number }> {
  const db = env.DB;
  const now = Date.now();
  let clotures = 0;
  let notifies = 0;
  const aCloturer = await db
    .prepare("SELECT * FROM evenements WHERE type = 'classement' AND visibilite <> 'brouillon' AND cloture = 0 AND fin <= ?")
    .bind(now)
    .all<Ligne>();
  for (const l of aCloturer.results) clotures += await cloturerClassement(db, lireLigne(l));

  const aAnnoncer = await db
    .prepare("SELECT * FROM evenements WHERE notifier = 1 AND visibilite = 'tous' AND debut <= ?1 AND fin > ?1")
    .bind(now)
    .all<Ligne>();
  for (const l of aAnnoncer.results) {
    if (budget <= 0) break;
    const destinataires = await db
      .prepare(
        `SELECT DISTINCT a.joueur_id FROM abonnements_push a JOIN joueurs j ON j.id = a.joueur_id
         WHERE j.suspendu = 0 AND j.supprime_le IS NULL
           AND NOT EXISTS (SELECT 1 FROM evenements_notifs n WHERE n.evenement_id = ? AND n.joueur_id = a.joueur_id)
         LIMIT ?`,
      )
      .bind(l.id, budget)
      .all<{ joueur_id: string }>();
    for (const d of destinataires.results) {
      await db.prepare("INSERT OR IGNORE INTO evenements_notifs (evenement_id, joueur_id) VALUES (?, ?)").bind(l.id, d.joueur_id).run();
      notifies += await notifierJoueur(env, d.joueur_id, { titre: l.titre, texte: l.description || "Un événement vient de commencer.", url: "/", tag: `evt-${l.id}` });
      budget--;
    }
  }
  return { clotures, notifies };
}
