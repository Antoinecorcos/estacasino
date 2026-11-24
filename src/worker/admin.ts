import { Hono, type Context } from "hono";
import { lireAvatar } from "../shared/avatar";
import { joueurConnecte, type JoueurSession } from "./auth";
import { chaineAleatoire, hacherMotDePasse } from "./crypto";
import { aForfait, crediter, debiter, oublierSaison, saisonCourante } from "./economie";
import { comptesLies } from "./empreintes";
import { type TypeEvenement, validerParams, type Visibilite } from "../shared/evenements";
import { cloturerClassement, lireLigne, oublierEvenements } from "./evenements";
import { distribuerRecompensesSaison, validerRecompenses } from "./saisons";
import type { Choix, Rencontre, VisibiliteParis } from "../shared/paris";
import { annulerRencontre, changerVisibiliteParis, lireSaisieRencontre, reglerRencontre, visibiliteParis } from "./paris";
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
  const detail = courante
    ? await db.prepare("SELECT recompenses FROM saisons WHERE id = ?").bind(courante.id).first<{ recompenses: string | null }>()
    : null;
  const suivante = await db.prepare("SELECT id, nom, debut, fin FROM saisons WHERE debut > ? ORDER BY debut LIMIT 1").bind(Date.now()).first();
  return c.json({
    courante,
    recompenses: detail?.recompenses ? JSON.parse(detail.recompenses) : null,
    suivante,
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
  const b = (await c.req.json().catch(() => ({}))) as { nom?: string; confirmation?: string; solde?: number | null; fin?: string | null; recompenses?: unknown };
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
  const recompenses = b.recompenses === undefined || b.recompenses === null ? null : validerRecompenses(b.recompenses);
  if (b.recompenses && !recompenses) return c.json({ erreur: "Récompenses invalides." }, 400);
  const requetes: D1PreparedStatement[] = [
    // Une saison programmée pour plus tard (pas encore commencée) est remplacée par celle-ci.
    db.prepare("DELETE FROM saisons WHERE debut > ? AND id NOT IN (SELECT DISTINCT saison_id FROM stats_saison)").bind(maintenant),
  ];
  if (courante) {
    requetes.push(
      db.prepare("UPDATE saisons SET fin = ?, recompenses = COALESCE(?, recompenses) WHERE id = ?").bind(maintenant, recompenses ? JSON.stringify(recompenses) : null, courante.id),
    );
  }
  requetes.push(db.prepare("INSERT INTO saisons (id, nom, debut, fin) VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM saisons), ?, ?, ?)").bind(nom, maintenant, fin));
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
  // Récompenses de la saison qui vient de se terminer : versées tout de suite.
  if (courante) {
    const s = await db.prepare("SELECT id, nom, recompenses FROM saisons WHERE id = ?").bind(courante.id).first<{ id: number; nom: string; recompenses: string | null }>();
    if (s?.recompenses) await distribuerRecompensesSaison(c.env, s);
  }
  await journaliser(c, "nouvelle_saison", null, { motif: `${courante ? `${courante.nom} → ` : ""}${nom}${solde !== null ? `, soldes à ${solde}` : ""}` });
  const nouvelle = await db.prepare("SELECT id FROM saisons WHERE debut = ? AND nom = ?").bind(maintenant, nom).first<{ id: number }>();
  return c.json({ ok: true, id: nouvelle?.id, nom });
});

/**
 * Programmer la fin de la saison en cours à une date donnée : la saison suivante est créée pour
 * commencer à la même minute (aucun trou), et les récompenses prévues sont versées par la tâche
 * planifiée dans le quart d'heure qui suit la fin.
 */
admin.post("/saison/programmer", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { fin?: number; nom?: string; finSuivante?: string | null; recompenses?: unknown };
  const db = c.env.DB;
  const courante = await saisonCourante(db);
  if (!courante) return c.json({ erreur: "Aucune saison en cours." }, 409);
  const nom = (b.nom ?? "").trim();
  if (!/^[\p{L}\p{N} '’-]{1,40}$/u.test(nom)) return c.json({ erreur: "Nom de la saison suivante invalide." }, 400);
  const fin = Number(b.fin);
  if (!Number.isFinite(fin) || fin <= Date.now() + 60_000) return c.json({ erreur: "La fin doit être dans le futur (ou utilisez le passage immédiat)." }, 400);
  const finSuivante = b.finSuivante ? Date.parse(`${b.finSuivante}T23:00:00Z`) : Date.UTC(2027, 11, 31, 23, 0, 0);
  if (!Number.isFinite(finSuivante) || finSuivante <= fin + 24 * 3600 * 1000) return c.json({ erreur: "La fin de la saison suivante doit être après son début." }, 400);
  const recompenses = validerRecompenses(b.recompenses);
  if (!recompenses) return c.json({ erreur: "Récompenses invalides." }, 400);
  const maintenant = Date.now();
  await db.batch([
    db.prepare("DELETE FROM saisons WHERE debut > ? AND id NOT IN (SELECT DISTINCT saison_id FROM stats_saison)").bind(maintenant),
    db.prepare("UPDATE saisons SET fin = ?, recompenses = ? WHERE id = ?").bind(fin, JSON.stringify(recompenses), courante.id),
    db.prepare("INSERT INTO saisons (id, nom, debut, fin) VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM saisons), ?, ?, ?)").bind(nom, fin, finSuivante),
  ]);
  oublierSaison();
  await journaliser(c, "fin_saison_programmee", null, {
    motif: `${courante.nom} → ${nom} le ${new Date(fin).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} ; ${recompenses.general} au général, ${recompenses.parJeu} par jeu`,
  });
  return c.json({ ok: true });
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

// ───────── Paris sportifs (option fantôme) ─────────

admin.get("/paris", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT r.*,
       (SELECT COUNT(*) FROM paris p WHERE p.rencontre_id = r.id) AS nb_paris,
       (SELECT COALESCE(SUM(mise), 0) FROM paris p WHERE p.rencontre_id = r.id) AS total_mises,
       (SELECT COALESCE(SUM(mise), 0) FROM paris p WHERE p.rencontre_id = r.id AND choix = '1') AS mises1,
       (SELECT COALESCE(SUM(mise), 0) FROM paris p WHERE p.rencontre_id = r.id AND choix = 'N') AS misesN,
       (SELECT COALESCE(SUM(mise), 0) FROM paris p WHERE p.rencontre_id = r.id AND choix = '2') AS mises2,
       (SELECT COALESCE(SUM(gain), 0) FROM paris p WHERE p.rencontre_id = r.id AND statut = 'gagne') AS verse
     FROM rencontres r WHERE r.debut > ? OR r.statut IN ('brouillon', 'ouverte') ORDER BY r.debut DESC LIMIT 100`,
  )
    .bind(Date.now() - 30 * 86400000)
    .all();
  return c.json({ visibilite: await visibiliteParis(c.env.DB), rencontres: r.results });
});

admin.post("/paris/visibilite", async (c) => {
  const { visibilite } = (await c.req.json().catch(() => ({}))) as { visibilite?: VisibiliteParis };
  if (!visibilite || !["off", "admins", "tous"].includes(visibilite)) return c.json({ erreur: "Valeur invalide." }, 400);
  await changerVisibiliteParis(c.env.DB, visibilite);
  await journaliser(c, "paris_visibilite", null, { motif: visibilite });
  return c.json({ ok: true });
});

admin.post("/paris/rencontres", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown> & { ouverte?: boolean };
  const s = lireSaisieRencontre(b as Partial<Rencontre>);
  if ("erreur" in s) return c.json({ erreur: s.erreur }, 400);
  const v = s.valeur;
  await c.env.DB.prepare(
    "INSERT INTO rencontres (sport, competition, equipe1, equipe2, debut, cote1, coteN, cote2, statut, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(v.sport, v.competition, v.equipe1, v.equipe2, v.debut, v.cote1, v.coteN, v.cote2, b.ouverte ? "ouverte" : "brouillon", Date.now())
    .run();
  await journaliser(c, "rencontre_creee", null, { motif: `${v.equipe1} – ${v.equipe2}` });
  return c.json({ ok: true });
});

/** Modifier une rencontre. Les paris déjà pris gardent leur cote. */
admin.put("/paris/rencontres/:id", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = lireSaisieRencontre(b as Partial<Rencontre>);
  if ("erreur" in s) return c.json({ erreur: s.erreur }, 400);
  const v = s.valeur;
  const r = await c.env.DB.prepare(
    "UPDATE rencontres SET sport = ?, competition = ?, equipe1 = ?, equipe2 = ?, debut = ?, cote1 = ?, coteN = ?, cote2 = ? WHERE id = ? AND statut IN ('brouillon', 'ouverte')",
  )
    .bind(v.sport, v.competition, v.equipe1, v.equipe2, v.debut, v.cote1, v.coteN, v.cote2, Number(c.req.param("id")))
    .run();
  if (r.meta.changes !== 1) return c.json({ erreur: "Rencontre introuvable ou déjà réglée." }, 404);
  return c.json({ ok: true });
});

admin.post("/paris/rencontres/:id/statut", async (c) => {
  const { statut } = (await c.req.json().catch(() => ({}))) as { statut?: string };
  if (statut !== "ouverte" && statut !== "brouillon") return c.json({ erreur: "Statut invalide." }, 400);
  const r = await c.env.DB.prepare("UPDATE rencontres SET statut = ? WHERE id = ? AND statut IN ('brouillon', 'ouverte')").bind(statut, Number(c.req.param("id"))).run();
  if (r.meta.changes !== 1) return c.json({ erreur: "Rencontre introuvable ou déjà réglée." }, 404);
  return c.json({ ok: true });
});

admin.post("/paris/rencontres/:id/regler", async (c) => {
  const { resultat } = (await c.req.json().catch(() => ({}))) as { resultat?: Choix };
  if (!resultat || !["1", "N", "2"].includes(resultat)) return c.json({ erreur: "Résultat invalide." }, 400);
  const id = Number(c.req.param("id"));
  const rencontre = await c.env.DB.prepare("SELECT equipe1, equipe2, debut, coteN FROM rencontres WHERE id = ?").bind(id).first<{ equipe1: string; equipe2: string; debut: number; coteN: number | null }>();
  if (!rencontre) return c.json({ erreur: "Rencontre introuvable." }, 404);
  if (rencontre.debut > Date.now()) return c.json({ erreur: "La rencontre n'a pas encore commencé." }, 409);
  if (resultat === "N" && rencontre.coteN === null) return c.json({ erreur: "Pas de match nul possible sur cette rencontre." }, 400);
  try {
    const bilan = await reglerRencontre(c.env.DB, id, resultat);
    await journaliser(c, "rencontre_reglee", null, { motif: `${rencontre.equipe1} – ${rencontre.equipe2} : ${resultat} · ${bilan.gagnants} gagnant(s), ${bilan.verse} versés` });
    return c.json({ ok: true, ...bilan });
  } catch (e) {
    return c.json({ erreur: (e as Error).message }, 409);
  }
});

admin.post("/paris/rencontres/:id/annuler", async (c) => {
  const id = Number(c.req.param("id"));
  try {
    const rembourses = await annulerRencontre(c.env.DB, id);
    await journaliser(c, "rencontre_annulee", null, { motif: `rencontre ${id} · ${rembourses} pari(s) remboursé(s)` });
    return c.json({ ok: true, rembourses });
  } catch (e) {
    return c.json({ erreur: (e as Error).message }, 409);
  }
});

admin.delete("/paris/rencontres/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM paris WHERE rencontre_id = ?").bind(id).first<{ n: number }>();
  if ((n?.n ?? 0) > 0) return c.json({ erreur: "Des paris ont été pris : annulez la rencontre pour les rembourser." }, 409);
  await c.env.DB.prepare("DELETE FROM rencontres WHERE id = ?").bind(id).run();
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
