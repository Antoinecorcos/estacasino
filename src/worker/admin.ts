import { Hono, type Context } from "hono";
import { lireAvatar } from "../shared/avatar";
import { joueurConnecte, type JoueurSession } from "./auth";
import { chaineAleatoire, hacherMotDePasse } from "./crypto";
import { aForfait, crediter, debiter, saisonCourante } from "./economie";
import { comptesLies } from "./empreintes";
import type { Env } from "./env";

// Espace d'administration : réservé aux comptes dont le rôle est « admin ».
// Chaque action qui modifie un compte est inscrite dans `journal_admin`.

type Vars = { admin: JoueurSession };
type C = Context<{ Bindings: Env; Variables: Vars }>;

export const admin = new Hono<{ Bindings: Env; Variables: Vars }>();

admin.use("*", async (c, next) => {
  const moi = await joueurConnecte(c as unknown as Context<{ Bindings: Env }>);
  if (!moi || moi.role !== "admin") return c.json({ erreur: "Accès réservé à l'équipe." }, 403);
  c.set("admin", moi);
  return next();
});

async function journaliser(c: C, action: string, joueurId: string | null, details?: unknown): Promise<void> {
  await c.env.DB.prepare("INSERT INTO journal_admin (admin_id, action, joueur_id, details, le) VALUES (?, ?, ?, ?, ?)")
    .bind(c.get("admin").id, action, joueurId, details === undefined ? null : JSON.stringify(details), Date.now())
    .run();
}

admin.get("/resume", async (c) => {
  const db = c.env.DB;
  const semaine = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [joueurs, inscrits, actifs, achats, jetons] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM joueurs WHERE supprime_le IS NULL"),
    db.prepare("SELECT COUNT(*) AS n FROM joueurs WHERE cree_le > ? AND supprime_le IS NULL").bind(semaine),
    db.prepare("SELECT COUNT(DISTINCT joueur_id) AS n FROM transactions_jetons WHERE le > ? AND type IN ('mise', 'gain')").bind(semaine),
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(montant_centimes), 0) AS total FROM achats"),
    db.prepare("SELECT COALESCE(SUM(solde), 0) AS total FROM joueurs WHERE supprime_le IS NULL"),
  ]);
  const un = <T>(r: D1Result) => r.results[0] as T;
  return c.json({
    joueurs: un<{ n: number }>(joueurs).n,
    inscritsSemaine: un<{ n: number }>(inscrits).n,
    actifsSemaine: un<{ n: number }>(actifs).n,
    achats: un<{ n: number; total: number }>(achats),
    jetonsEnCirculation: un<{ total: number }>(jetons).total,
  });
});

admin.get("/joueurs", async (c) => {
  const q = (c.req.query("q") ?? "").trim().replace(/[%_\\]/g, (x) => `\\${x}`);
  const r = await c.env.DB.prepare(
    `SELECT id, pseudo, solde, role, suspendu, cree_le, supprime_le FROM joueurs
     WHERE pseudo LIKE ? ESCAPE '\\' ORDER BY cree_le DESC LIMIT 50`,
  )
    .bind(`%${q}%`)
    .all();
  return c.json({ joueurs: r.results });
});

admin.get("/joueurs/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const j = await db
    .prepare("SELECT id, pseudo, solde, avatar, theme, role, suspendu, suspendu_motif, date_naissance, cree_le, supprime_le, bonus_serie FROM joueurs WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown> & { avatar: string }>();
  if (!j) return c.json({ erreur: "Joueur introuvable." }, 404);
  const saison = await saisonCourante(db);
  const [stats, transactions, achats, inventaire, sessions] = await db.batch([
    db.prepare("SELECT * FROM stats_saison WHERE joueur_id = ? AND saison_id = ?").bind(id, saison?.id ?? 0),
    db.prepare("SELECT montant, type, jeu, room, le FROM transactions_jetons WHERE joueur_id = ? ORDER BY le DESC LIMIT 100").bind(id),
    db.prepare("SELECT produit, montant_centimes, stripe_session, le FROM achats WHERE joueur_id = ? ORDER BY le DESC").bind(id),
    db.prepare("SELECT piece, origine, le FROM inventaire WHERE joueur_id = ? ORDER BY le DESC").bind(id),
    db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE joueur_id = ? AND expire_le > ?").bind(id, Date.now()),
  ]);
  return c.json({
    joueur: { ...j, avatar: lireAvatar(j.avatar) },
    saison: saison ? { nom: saison.nom, stats: stats.results[0] ?? null } : null,
    transactions: transactions.results,
    achats: achats.results,
    inventaire: inventaire.results,
    sessionsActives: (sessions.results[0] as { n: number }).n,
    forfait: await aForfait(db, id),
    comptesLies: await comptesLies(db, id),
  });
});

/** Mot de passe provisoire : affiché une seule fois à l'administrateur, le joueur est déconnecté partout. */
admin.post("/joueurs/:id/mdp", async (c) => {
  const id = c.req.param("id");
  const provisoire = chaineAleatoire("abcdefghjkmnpqrstuvwxyz23456789", 12);
  const r = await c.env.DB.prepare("UPDATE joueurs SET mdp_hash = ? WHERE id = ? AND supprime_le IS NULL").bind(await hacherMotDePasse(provisoire), id).run();
  if (r.meta.changes !== 1) return c.json({ erreur: "Joueur introuvable." }, 404);
  await c.env.DB.prepare("DELETE FROM sessions WHERE joueur_id = ?").bind(id).run();
  await journaliser(c, "mot_de_passe_provisoire", id);
  return c.json({ ok: true, mdp: provisoire });
});

/**
 * Ajustement de jetons par l'équipe (cadeau, geste commercial, correction). Montant positif = crédit,
 * négatif = retrait. Les jetons restent fictifs et gratuits : aucun lien avec un paiement.
 * Ils ne comptent pas dans les gains de saison (le classement reste juste).
 */
admin.post("/joueurs/:id/jetons", async (c) => {
  const id = c.req.param("id");
  const b = (await c.req.json().catch(() => ({}))) as { montant?: number; motif?: string };
  const montant = Math.trunc(Number(b.montant));
  const motif = (b.motif ?? "").trim().slice(0, 200);
  if (!Number.isFinite(montant) || montant === 0 || Math.abs(montant) > 1_000_000) return c.json({ erreur: "Montant invalide (entre -1 000 000 et 1 000 000, hors 0)." }, 400);
  if (!motif) return c.json({ erreur: "Indiquez un motif : il est gardé dans le journal." }, 400);
  const j = await c.env.DB.prepare("SELECT id FROM joueurs WHERE id = ? AND supprime_le IS NULL").bind(id).first();
  if (!j) return c.json({ erreur: "Joueur introuvable." }, 404);
  const solde =
    montant > 0
      ? await crediter(c.env.DB, id, montant, "ajustement", null, null)
      : await debiter(c.env.DB, id, -montant, null, null, "ajustement");
  if (solde === null) return c.json({ erreur: "Solde insuffisant pour ce retrait." }, 409);
  await journaliser(c, montant > 0 ? "credit_jetons" : "retrait_jetons", id, { montant, motif });
  return c.json({ ok: true, solde });
});

admin.post("/joueurs/:id/suspendre", async (c) => {
  const id = c.req.param("id");
  const b = (await c.req.json().catch(() => ({}))) as { suspendu?: boolean; motif?: string };
  if (id === c.get("admin").id) return c.json({ erreur: "Vous ne pouvez pas vous suspendre vous-même." }, 400);
  const motif = (b.motif ?? "").trim().slice(0, 200) || null;
  const r = await c.env.DB.prepare("UPDATE joueurs SET suspendu = ?, suspendu_motif = ? WHERE id = ? AND role <> 'admin'")
    .bind(b.suspendu ? 1 : 0, b.suspendu ? motif : null, id)
    .run();
  if (r.meta.changes !== 1) return c.json({ erreur: "Joueur introuvable, ou administrateur (non suspendable ici)." }, 404);
  if (b.suspendu) await c.env.DB.prepare("DELETE FROM sessions WHERE joueur_id = ?").bind(id).run();
  await journaliser(c, b.suspendu ? "suspension" : "reactivation", id, motif ? { motif } : undefined);
  return c.json({ ok: true });
});

admin.get("/journal", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT a.action, a.details, a.le, ad.pseudo AS admin, j.pseudo AS joueur, a.joueur_id
     FROM journal_admin a JOIN joueurs ad ON ad.id = a.admin_id LEFT JOIN joueurs j ON j.id = a.joueur_id
     ORDER BY a.le DESC LIMIT 100`,
  ).all();
  return c.json({ journal: r.results });
});
