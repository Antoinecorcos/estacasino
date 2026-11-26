import { Hono, type Context } from "hono";
import { ligueDe } from "../shared/ligues";
import { type Choix, COTE_PARIABLE_MIN, coteDe, gainPotentiel, MISE_MAX_RENCONTRE, PARI_MIN, type Pari, type Rencontre, validerRencontre, type VisibiliteParis } from "../shared/paris";
import { formatJetons } from "../shared/regles";
import { joueurConnecte, type JoueurSession } from "./auth";
import { crediter, debiter, saisonCourante } from "./economie";
import type { Env } from "./env";

// Paris sportifs, en mode « fantôme » : tant que l'interrupteur (config « paris_sportifs ») vaut
// « off », toutes les routes répondent « introuvable » et rien n'apparaît sur le site.
// « admins » : visible et utilisable par les admins seulement (test). « tous » : ouvert.

type C = Context<{ Bindings: Env }>;
const CLE = "paris_sportifs";

let cache: { valeur: VisibiliteParis; expire: number } | null = null;

export async function visibiliteParis(db: D1Database): Promise<VisibiliteParis> {
  const now = Date.now();
  if (cache && cache.expire > now) return cache.valeur;
  const l = await db.prepare("SELECT valeur FROM config WHERE cle = ?").bind(CLE).first<{ valeur: string }>();
  const valeur: VisibiliteParis = l?.valeur === "admins" || l?.valeur === "tous" ? l.valeur : "off";
  cache = { valeur, expire: now + 20_000 };
  return valeur;
}

export async function changerVisibiliteParis(db: D1Database, v: VisibiliteParis): Promise<void> {
  await db.prepare("INSERT INTO config (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").bind(CLE, v).run();
  cache = null;
}

/** Ce joueur voit-il les paris sportifs ? */
export async function parisVisibles(db: D1Database, role: string): Promise<boolean> {
  const v = await visibiliteParis(db);
  return v === "tous" || (v === "admins" && role === "admin");
}

const lireRencontre = (l: Record<string, unknown>): Rencontre => ({
  id: l.id as number, sport: l.sport as string, competition: l.competition as string, equipe1: l.equipe1 as string, equipe2: l.equipe2 as string,
  debut: l.debut as number, cote1: l.cote1 as number, coteN: (l.coteN as number | null) ?? null, cote2: l.cote2 as number,
  statut: l.statut as Rencontre["statut"], resultat: (l.resultat as Choix | null) ?? null,
});

/**
 * Statistiques de saison d'un pari réglé : il compte dans le classement général (gains nets et une
 * partie jouée) et dans l'onglet « Paris sportifs ». Il compte dans la saison où il est réglé.
 */
async function enregistrerPari(db: D1Database, joueurId: string, mise: number, rendu: number): Promise<void> {
  const saison = await saisonCourante(db);
  if (!saison) return;
  await db
    .prepare(
      `INSERT INTO stats_saison (joueur_id, saison_id, gains_nets, mains, paris_joues, gains_paris) VALUES (?1, ?2, ?3, 1, 1, ?3)
       ON CONFLICT (joueur_id, saison_id) DO UPDATE SET gains_nets = gains_nets + excluded.gains_nets, mains = mains + 1,
         paris_joues = paris_joues + 1, gains_paris = gains_paris + excluded.gains_paris`,
    )
    .bind(joueurId, saison.id, rendu - mise)
    .run();
}

// ───────── Routes joueurs ─────────

export const paris = new Hono<{ Bindings: Env; Variables: { joueur: JoueurSession } }>();

// Invisible tant que l'option n'est pas activée pour ce joueur : même réponse qu'une page inexistante.
paris.use("*", async (c, next) => {
  const moi = await joueurConnecte(c as unknown as C);
  if (!moi || !(await parisVisibles(c.env.DB, moi.role))) return c.json({ erreur: "Introuvable." }, 404);
  c.set("joueur", moi);
  return next();
});

paris.get("/rencontres", async (c) => {
  const db = c.env.DB;
  const moi = c.get("joueur");
  const now = Date.now();
  const [rencontres, mesParis] = await db.batch([
    db.prepare(
      `SELECT * FROM rencontres WHERE (statut = 'ouverte' AND debut > ?1 - 6 * 3600000)
         OR (statut IN ('reglee', 'annulee') AND regle_le > ?1 - 3 * 86400000)
       ORDER BY debut LIMIT 100`,
    ).bind(now),
    db.prepare(
      "SELECT p.* FROM paris p JOIN rencontres r ON r.id = p.rencontre_id WHERE p.joueur_id = ? AND (p.statut = 'en_cours' OR p.regle_le > ?) ORDER BY p.le DESC",
    ).bind(moi.id, now - 3 * 86400000),
  ]);
  const saison = await saisonCourante(db);
  const stats = saison
    ? await db.prepare("SELECT gains_nets, mains FROM stats_saison WHERE joueur_id = ? AND saison_id = ?").bind(moi.id, saison.id).first<{ gains_nets: number; mains: number }>()
    : null;
  return c.json({
    rencontres: (rencontres.results as Record<string, unknown>[]).map(lireRencontre),
    mesParis: mesParis.results as unknown as Pari[],
    miseMax: Math.min(MISE_MAX_RENCONTRE, ligueDe(stats?.gains_nets ?? 0, stats?.mains ?? 0, null).miseMaxRoom),
    test: (await visibiliteParis(db)) === "admins",
  });
});

paris.get("/historique", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT p.*, r.equipe1, r.equipe2, r.sport, r.competition, r.debut, r.resultat FROM paris p JOIN rencontres r ON r.id = p.rencontre_id
     WHERE p.joueur_id = ? ORDER BY p.le DESC LIMIT 50`,
  )
    .bind(c.get("joueur").id)
    .all();
  return c.json({ paris: r.results });
});

paris.post("/parier", async (c) => {
  const db = c.env.DB;
  const moi = c.get("joueur");
  const b = (await c.req.json().catch(() => ({}))) as { rencontre?: number; choix?: Choix; mise?: number };
  const mise = Math.trunc(Number(b.mise));
  if (!["1", "N", "2"].includes(b.choix ?? "")) return c.json({ erreur: "Choix invalide." }, 400);
  if (!Number.isInteger(mise) || mise < PARI_MIN) return c.json({ erreur: `Mise minimum : ${PARI_MIN} jetons.` }, 400);
  const l = await db.prepare("SELECT * FROM rencontres WHERE id = ?").bind(Number(b.rencontre)).first<Record<string, unknown>>();
  if (!l) return c.json({ erreur: "Rencontre introuvable." }, 404);
  const r = lireRencontre(l);
  if (r.statut !== "ouverte") return c.json({ erreur: "Les paris ne sont pas ouverts sur cette rencontre." }, 409);
  if (Date.now() >= r.debut) return c.json({ erreur: "Le coup d'envoi est passé : les paris sont fermés." }, 409);
  const cote = coteDe(r, b.choix!);
  if (!cote) return c.json({ erreur: "Pas de match nul possible sur cette rencontre." }, 400);
  if (cote < COTE_PARIABLE_MIN) return c.json({ erreur: `Cote trop faible : on ne peut pas parier sous ${COTE_PARIABLE_MIN.toFixed(2).replace(".", ",")}.` }, 400);
  // Plafond : la mise maximum de la ligue, au total sur une même rencontre.
  const saison = await saisonCourante(db);
  const stats = saison
    ? await db.prepare("SELECT gains_nets, mains FROM stats_saison WHERE joueur_id = ? AND saison_id = ?").bind(moi.id, saison.id).first<{ gains_nets: number; mains: number }>()
    : null;
  const max = Math.min(MISE_MAX_RENCONTRE, ligueDe(stats?.gains_nets ?? 0, stats?.mains ?? 0, null).miseMaxRoom);
  const deja = await db.prepare("SELECT COALESCE(SUM(mise), 0) AS t FROM paris WHERE rencontre_id = ? AND joueur_id = ? AND statut = 'en_cours'").bind(r.id, moi.id).first<{ t: number }>();
  if ((deja?.t ?? 0) + mise > max) return c.json({ erreur: `Maximum ${formatJetons(max)} jetons par rencontre (déjà ${formatJetons(deja?.t ?? 0)}).` }, 409);
  const solde = await debiter(db, moi.id, mise, null, `pari-${r.id}`);
  if (solde === null) return c.json({ erreur: "Solde insuffisant pour ce pari." }, 409);
  await db.prepare("INSERT INTO paris (rencontre_id, joueur_id, choix, mise, cote, le) VALUES (?, ?, ?, ?, ?, ?)").bind(r.id, moi.id, b.choix, mise, cote, Date.now()).run();
  return c.json({ ok: true, solde, gainPotentiel: gainPotentiel(mise, cote) });
});

// ───────── Règlement (Admin) ─────────

/** Règle une rencontre : gagnants payés (mise × cote figée), perdants enregistrés. Une seule fois. */
export async function reglerRencontre(db: D1Database, id: number, resultat: Choix): Promise<{ gagnants: number; perdants: number; verse: number }> {
  const marque = await db
    .prepare("UPDATE rencontres SET statut = 'reglee', resultat = ?, regle_le = ? WHERE id = ? AND statut IN ('brouillon', 'ouverte')")
    .bind(resultat, Date.now(), id)
    .run();
  if (marque.meta.changes !== 1) throw new Error("Rencontre introuvable ou déjà réglée.");
  const lp = await db.prepare("SELECT * FROM paris WHERE rencontre_id = ? AND statut = 'en_cours'").bind(id).all<Pari & { joueur_id: string }>();
  let gagnants = 0;
  let perdants = 0;
  let verse = 0;
  const now = Date.now();
  for (const p of lp.results) {
    if (p.choix === resultat) {
      const gain = gainPotentiel(p.mise, p.cote);
      const ok = await db.prepare("UPDATE paris SET statut = 'gagne', gain = ?, regle_le = ? WHERE id = ? AND statut = 'en_cours'").bind(gain, now, p.id).run();
      if (ok.meta.changes !== 1) continue;
      await crediter(db, p.joueur_id, gain, "gain", null, `pari-${id}`);
      await enregistrerPari(db, p.joueur_id, p.mise, gain);
      gagnants++;
      verse += gain;
    } else {
      const ok = await db.prepare("UPDATE paris SET statut = 'perdu', regle_le = ? WHERE id = ? AND statut = 'en_cours'").bind(now, p.id).run();
      if (ok.meta.changes !== 1) continue;
      await enregistrerPari(db, p.joueur_id, p.mise, 0);
      perdants++;
    }
  }
  return { gagnants, perdants, verse };
}

/** Annule une rencontre (reportée, abandonnée…) : toutes les mises sont rendues. */
export async function annulerRencontre(db: D1Database, id: number): Promise<number> {
  const marque = await db.prepare("UPDATE rencontres SET statut = 'annulee', regle_le = ? WHERE id = ? AND statut IN ('brouillon', 'ouverte')").bind(Date.now(), id).run();
  if (marque.meta.changes !== 1) throw new Error("Rencontre introuvable ou déjà réglée.");
  const lp = await db.prepare("SELECT id, joueur_id, mise FROM paris WHERE rencontre_id = ? AND statut = 'en_cours'").bind(id).all<{ id: number; joueur_id: string; mise: number }>();
  for (const p of lp.results) {
    const ok = await db.prepare("UPDATE paris SET statut = 'rembourse', gain = mise, regle_le = ? WHERE id = ? AND statut = 'en_cours'").bind(Date.now(), p.id).run();
    if (ok.meta.changes === 1) await crediter(db, p.joueur_id, p.mise, "remboursement", null, `pari-${id}`);
  }
  return lp.results.length;
}

/** Validation commune de la saisie d'une rencontre (Admin). */
export function lireSaisieRencontre(b: Partial<Rencontre>): { erreur: string } | { valeur: Omit<Rencontre, "id" | "statut" | "resultat"> } {
  const valeur = {
    sport: b.sport ?? "",
    competition: (b.competition ?? "").trim(),
    equipe1: (b.equipe1 ?? "").trim(),
    equipe2: (b.equipe2 ?? "").trim(),
    debut: Number(b.debut),
    cote1: Number(b.cote1),
    coteN: b.coteN === null || b.coteN === undefined || (b.coteN as unknown) === "" ? null : Number(b.coteN),
    cote2: Number(b.cote2),
  };
  const erreur = validerRencontre(valeur);
  return erreur ? { erreur } : { valeur };
}
