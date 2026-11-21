import { Hono, type Context } from "hono";
import { lireAvatar } from "../shared/avatar";
import { joueurConnecte, type JoueurSession } from "./auth";
import { chaineAleatoire, hacherMotDePasse } from "./crypto";
import { aForfait, crediter, debiter, oublierSaison, saisonCourante } from "./economie";
import { comptesLies } from "./empreintes";
import { type TypeEvenement, validerParams, type Visibilite } from "../shared/evenements";
import { cloturerClassement, lireLigne, oublierEvenements } from "./evenements";
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

// ───────── Saisons ─────────

/** Saison en cours et ce qu'un passage à la suivante changerait. */
admin.get("/saison", async (c) => {
  const db = c.env.DB;
  const courante = await saisonCourante(db);
  const [prochain, joueurs, classes, forfaits] = await db.batch([
    db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM saisons"),
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(solde), 0) AS total FROM joueurs WHERE supprime_le IS NULL"),
    db.prepare("SELECT COUNT(*) AS n FROM stats_saison WHERE saison_id = ?").bind(courante?.id ?? 0),
    db.prepare("SELECT COUNT(*) AS n FROM forfaits_saison WHERE saison_id = ?").bind(courante?.id ?? 0),
  ]);
  const un = <T>(r: D1Result) => r.results[0] as T;
  return c.json({
    courante,
    prochainId: un<{ id: number }>(prochain).id,
    joueurs: un<{ n: number; total: number }>(joueurs),
    classes: un<{ n: number }>(classes).n,
    forfaits: un<{ n: number }>(forfaits).n,
  });
});

/**
 * Passage à une nouvelle saison : la saison en cours est clôturée (classement archivé), la nouvelle
 * commence maintenant avec un classement vide. Les soldes sont conservés, sauf si « solde » est donné
 * (remise à niveau ponctuelle). Tout se fait en une transaction. Le nom doit être retapé pour confirmer.
 */
admin.post("/saison/nouvelle", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { nom?: string; confirmation?: string; solde?: number | null; fin?: string | null };
  const nom = (b.nom ?? "").trim();
  if (!/^[\p{L}\p{N} '’-]{1,40}$/u.test(nom)) return c.json({ erreur: "Nom de saison invalide." }, 400);
  if ((b.confirmation ?? "").trim() !== nom) return c.json({ erreur: "Retapez exactement le nom de la nouvelle saison pour confirmer." }, 400);
  const solde = b.solde === null || b.solde === undefined ? null : Math.trunc(Number(b.solde));
  if (solde !== null && !(Number.isInteger(solde) && solde >= 0 && solde <= 10_000_000)) return c.json({ erreur: "Solde invalide." }, 400);
  const maintenant = Date.now();
  const fin = b.fin ? Date.parse(`${b.fin}T23:00:00Z`) : Date.UTC(2027, 11, 31, 23, 0, 0);
  if (!Number.isFinite(fin) || fin <= maintenant + 24 * 3600 * 1000) return c.json({ erreur: "La date de fin doit être dans le futur." }, 400);
  const db = c.env.DB;
  const courante = await saisonCourante(db);
  const prochain = await db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS id FROM saisons").first<{ id: number }>();
  const id = prochain?.id ?? 1;
  const requetes: D1PreparedStatement[] = [];
  if (courante) requetes.push(db.prepare("UPDATE saisons SET fin = ? WHERE id = ?").bind(maintenant, courante.id));
  requetes.push(db.prepare("INSERT INTO saisons (id, nom, debut, fin) VALUES (?, ?, ?, ?)").bind(id, nom, maintenant, fin));
  if (solde !== null) {
    // L'écart est inscrit en ajustement juste avant le début de la saison : historique juste, courbe propre.
    requetes.push(
      db.prepare(
        "INSERT INTO transactions_jetons (joueur_id, montant, type, le) SELECT id, ?1 - solde, 'ajustement', ?2 FROM joueurs WHERE supprime_le IS NULL AND solde <> ?1",
      ).bind(solde, maintenant - 1),
      db.prepare("UPDATE joueurs SET solde = ? WHERE supprime_le IS NULL").bind(solde),
    );
  }
  await db.batch(requetes);
  oublierSaison();
  await journaliser(c, "nouvelle_saison", null, { motif: `${courante ? `${courante.nom} → ` : ""}${nom}${solde !== null ? `, soldes à ${solde}` : ""}` });
  return c.json({ ok: true, id, nom });
});

// ───────── Événements ─────────

admin.get("/evenements", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT e.*, (SELECT COUNT(*) FROM evenements_joueurs ej WHERE ej.evenement_id = e.id) AS participants,
       (SELECT COUNT(*) FROM evenements_cadeaux ec WHERE ec.evenement_id = e.id) AS cadeaux
     FROM evenements e ORDER BY e.debut DESC LIMIT 100`,
  ).all<Parameters<typeof lireLigne>[0] & { participants: number; cadeaux: number }>();
  return c.json({ evenements: r.results.map((l) => ({ ...lireLigne(l), participants: l.participants, cadeaux: l.cadeaux })) });
});

interface CorpsEvenement {
  type?: TypeEvenement;
  titre?: string;
  description?: string;
  debut?: number;
  fin?: number;
  visibilite?: Visibilite;
  notifier?: boolean;
  params?: unknown;
}

function validerEvenement(b: CorpsEvenement): string | null {
  if (!b.type || !["boost", "objectif", "classement", "calendrier"].includes(b.type)) return "Type d'événement invalide.";
  if (!b.titre?.trim() || b.titre.trim().length > 60) return "Titre requis (60 caractères au plus).";
  if ((b.description ?? "").length > 300) return "Description : 300 caractères au plus.";
  if (!Number.isFinite(b.debut) || !Number.isFinite(b.fin) || (b.fin as number) <= (b.debut as number)) return "La fin doit être après le début.";
  if ((b.fin as number) - (b.debut as number) > 90 * 24 * 3600 * 1000) return "Un événement dure 90 jours au plus.";
  if (b.visibilite && !["brouillon", "admins", "tous"].includes(b.visibilite)) return "Visibilité invalide.";
  return validerParams(b.type, b.params);
}

admin.post("/evenements", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as CorpsEvenement;
  const err = validerEvenement(b);
  if (err) return c.json({ erreur: err }, 400);
  const r = await c.env.DB.prepare(
    `INSERT INTO evenements (type, titre, description, debut, fin, visibilite, notifier, params, cree_le)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(b.type, b.titre!.trim(), (b.description ?? "").trim(), b.debut, b.fin, b.visibilite ?? "brouillon", b.notifier ? 1 : 0, JSON.stringify(b.params), Date.now())
    .first<{ id: number }>();
  oublierEvenements();
  await journaliser(c, "evenement_cree", null, { motif: `${b.titre!.trim()} (${b.visibilite ?? "brouillon"})` });
  return c.json({ ok: true, id: r?.id });
});

admin.put("/evenements/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = (await c.req.json().catch(() => ({}))) as CorpsEvenement;
  const err = validerEvenement(b);
  if (err) return c.json({ erreur: err }, 400);
  const r = await c.env.DB.prepare(
    "UPDATE evenements SET type = ?, titre = ?, description = ?, debut = ?, fin = ?, visibilite = ?, notifier = ?, params = ? WHERE id = ? AND cloture = 0",
  )
    .bind(b.type, b.titre!.trim(), (b.description ?? "").trim(), b.debut, b.fin, b.visibilite ?? "brouillon", b.notifier ? 1 : 0, JSON.stringify(b.params), id)
    .run();
  if (r.meta.changes !== 1) return c.json({ erreur: "Événement introuvable, ou déjà clôturé." }, 404);
  oublierEvenements();
  await journaliser(c, "evenement_modifie", null, { motif: `${b.titre!.trim()} (${b.visibilite ?? "brouillon"})` });
  return c.json({ ok: true });
});

/** Changer seulement la visibilité (brouillon → test admins → en ligne). */
admin.post("/evenements/:id/visibilite", async (c) => {
  const id = Number(c.req.param("id"));
  const { visibilite } = (await c.req.json().catch(() => ({}))) as { visibilite?: Visibilite };
  if (!visibilite || !["brouillon", "admins", "tous"].includes(visibilite)) return c.json({ erreur: "Visibilité invalide." }, 400);
  const e = await c.env.DB.prepare("UPDATE evenements SET visibilite = ? WHERE id = ? RETURNING titre").bind(visibilite, id).first<{ titre: string }>();
  if (!e) return c.json({ erreur: "Événement introuvable." }, 404);
  oublierEvenements();
  await journaliser(c, "evenement_visibilite", null, { motif: `${e.titre} → ${visibilite}` });
  return c.json({ ok: true });
});

/** Supprimer : seulement si personne n'y a encore participé (sinon, le repasser en brouillon). */
admin.delete("/evenements/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const db = c.env.DB;
  const usage = await db
    .prepare("SELECT (SELECT COUNT(*) FROM evenements_joueurs WHERE evenement_id = ?1) + (SELECT COUNT(*) FROM evenements_cadeaux WHERE evenement_id = ?1) AS n")
    .bind(id)
    .first<{ n: number }>();
  if ((usage?.n ?? 0) > 0) return c.json({ erreur: "Des joueurs ont déjà participé : repassez-le en brouillon plutôt que de le supprimer." }, 409);
  const e = await db.prepare("DELETE FROM evenements WHERE id = ? RETURNING titre").bind(id).first<{ titre: string }>();
  if (!e) return c.json({ erreur: "Événement introuvable." }, 404);
  await db.prepare("DELETE FROM evenements_notifs WHERE evenement_id = ?").bind(id).run();
  oublierEvenements();
  await journaliser(c, "evenement_supprime", null, { motif: e.titre });
  return c.json({ ok: true });
});

/** Classement : distribuer les récompenses tout de suite (sinon, fait automatiquement à la fin). */
admin.post("/evenements/:id/cloturer", async (c) => {
  const id = Number(c.req.param("id"));
  const l = await c.env.DB.prepare("SELECT * FROM evenements WHERE id = ? AND type = 'classement'").bind(id).first<Parameters<typeof lireLigne>[0]>();
  if (!l) return c.json({ erreur: "Classement introuvable." }, 404);
  if (l.fin > Date.now()) await c.env.DB.prepare("UPDATE evenements SET fin = ? WHERE id = ?").bind(Date.now(), id).run();
  const gagnants = await cloturerClassement(c.env.DB, lireLigne(l));
  await journaliser(c, "evenement_cloture", null, { motif: `${l.titre} : ${gagnants} récompense(s)` });
  return c.json({ ok: true, gagnants });
});

admin.get("/journal", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT a.action, a.details, a.le, ad.pseudo AS admin, j.pseudo AS joueur, a.joueur_id
     FROM journal_admin a JOIN joueurs ad ON ad.id = a.admin_id LEFT JOIN joueurs j ON j.id = a.joueur_id
     ORDER BY a.le DESC LIMIT 100`,
  ).all();
  return c.json({ journal: r.results });
});
