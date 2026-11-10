import { Hono, type Context } from "hono";
import { AVATARS_DEPART, lireAvatar, validerAvatar } from "../shared/avatar";
import { PRODUITS, trouverProduit } from "../shared/boutique";
import { LIGUES, ligueDe, ligueSuivante } from "../shared/ligues";
import { verifierPseudo } from "../shared/pseudo";
import {
  ALPHABET_CODE,
  BLACKJACK_LIMITES_DEFAUT,
  BONUS_QUOTIDIEN,
  BONUS_SERIE_MAX,
  BONUS_SERIE_PAR_JOUR,
  CAPITAL_DEPART,
  CLASSEMENT_MIN_PARTIES,
  CODE_REGEX,
  FILET_DELAI_MS,
  FILET_MONTANT,
  FILET_SEUIL,
  type Jeu,
  PLAFOND_PACKS_JOUR,
  MDP_MIN,
  PALIERS_MISE_MAX,
  PALIERS_MISE_MIN,
  ROULETTE_LIMITES_DEFAUT,
  ENTREES_SNG,
  type EntreeSng,
  NIVEAUX_POKER,
  type NiveauPoker,
  POKER_PLACES,
} from "../shared/regles";
import { age, fermerSession, joueurConnecte, type JoueurSession, normaliserCodeSecours, nouveauCodeSecours, ouvrirSession } from "./auth";
import { chaineAleatoire, hacherMotDePasse, sha256, verifierMotDePasse } from "./crypto";
import { aForfait, crediter, crediterAchatJetons, jourParis, rechargerForfait, saisonCourante, veille } from "./economie";
import { inscriptionRefusee, noterAppareilSiNouveau, noterEmpreintes } from "./empreintes";
import type { Env } from "./env";
import { type ConfigRoom, ENTETE_CONFIG, ENTETE_IDENTITE, type Identite } from "./rooms/base";
import { themeAccessible, trouverTheme } from "../shared/themes";
import { creerSessionCheckout, type SessionCheckoutTerminee, verifierSignatureWebhook } from "./stripe";

import { admin } from "./admin";
import { lireDefis } from "./defis";

export { BlackjackRoom } from "./rooms/blackjack";
export { RouletteRoom } from "./rooms/roulette";
export { PokerRoom } from "./rooms/poker";

type C = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>().basePath("/api");

const erreur = (c: C, message: string, statut: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 400) =>
  c.json({ erreur: message }, statut);

async function exigerJoueur(c: C): Promise<JoueurSession | Response> {
  const j = await joueurConnecte(c);
  return j ?? erreur(c, "Connectez-vous pour continuer.", 401);
}

async function corps<T>(c: C): Promise<Partial<T>> {
  try {
    return (await c.req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

// ───────────── Protections ─────────────

const ip = (c: C) => c.req.header("CF-Connecting-IP") ?? "local";

// Limites de débit par adresse IP (les webhooks Stripe et les WebSockets de jeu n'y sont pas soumis).
app.use("*", async (c, next) => {
  const chemin = new URL(c.req.url).pathname;
  if (chemin === "/api/stripe/webhook" || chemin.endsWith("/ws")) return next();
  const limite = chemin.startsWith("/api/auth/") ? c.env.LIMITE_AUTH : c.env.LIMITE_API;
  if (limite && !(await limite.limit({ key: ip(c) })).success)
    return erreur(c, "Doucement ! Trop de demandes, réessayez dans une minute.", 429);
  return next();
});

/** Vérifie le jeton Cloudflare Turnstile quand la protection est configurée. */
async function humainVerifie(c: C, jeton: unknown): Promise<boolean> {
  if (!c.env.TURNSTILE_SECRET) return true;
  if (typeof jeton !== "string" || !jeton) return false;
  const f = new FormData();
  f.set("secret", c.env.TURNSTILE_SECRET);
  f.set("response", jeton);
  f.set("remoteip", ip(c));
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: f });
    return ((await r.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

app.get("/config", (c) => c.json({ turnstile: c.env.TURNSTILE_SECRET && c.env.TURNSTILE_SITE_KEY ? c.env.TURNSTILE_SITE_KEY : null }));

// ───────────── Comptes ─────────────

app.post("/auth/inscription", async (c) => {
  const b = await corps<{ pseudo: string; mdp: string; dateNaissance: string; avatar: number; cgu: boolean; turnstile: string }>(c);
  if (!(await humainVerifie(c, b.turnstile))) return erreur(c, "Vérification anti-robot échouée, réessayez.", 403);
  const pseudo = (b.pseudo ?? "").trim();
  const verdict = verifierPseudo(pseudo);
  if (!verdict.ok) return erreur(c, verdict.raison);
  if (typeof b.mdp !== "string" || b.mdp.length < MDP_MIN) return erreur(c, `Mot de passe : ${MDP_MIN} caractères minimum.`);
  const ans = age(b.dateNaissance ?? "");
  if (ans === null || ans > 120) return erreur(c, "Date de naissance invalide.");
  if (ans < 18) return erreur(c, "Estacasino est réservé aux personnes de 18 ans et plus.", 403);
  if (b.cgu !== true) return erreur(c, "Vous devez accepter les conditions d'utilisation.");
  const depart = AVATARS_DEPART[Number(b.avatar)] ?? AVATARS_DEPART[0];

  const existe = await c.env.DB.prepare("SELECT 1 FROM joueurs WHERE pseudo = ?").bind(pseudo).first();
  if (existe) return erreur(c, "Ce pseudo est déjà pris.", 409);
  const refus = await inscriptionRefusee(c);
  if (refus) return erreur(c, refus, 403);

  const id = crypto.randomUUID();
  const codeSecours = nouveauCodeSecours();
  const now = Date.now();
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO joueurs (id, pseudo, mdp_hash, secours_hash, date_naissance, solde, avatar, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(id, pseudo, await hacherMotDePasse(b.mdp), await sha256(normaliserCodeSecours(codeSecours)), b.dateNaissance, CAPITAL_DEPART, JSON.stringify(depart.config), now),
      c.env.DB.prepare("INSERT INTO transactions_jetons (joueur_id, montant, type, le) VALUES (?, ?, 'depart', ?)").bind(id, CAPITAL_DEPART, now),
    ]);
  } catch {
    return erreur(c, "Ce pseudo est déjà pris.", 409);
  }
  await noterEmpreintes(c, id, true);
  await ouvrirSession(c, id);
  return c.json({ ok: true, codeSecours });
});

/** Limite simple contre les essais de mots de passe : 10 échecs par pseudo et par quart d'heure. */
async function tropDEssais(c: C, pseudo: string): Promise<boolean> {
  const depuis = Date.now() - 15 * 60 * 1000;
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tentatives_connexion WHERE pseudo = ? AND le > ?").bind(pseudo, depuis).first<{ n: number }>();
  return (r?.n ?? 0) >= 10;
}
async function noterEchec(c: C, pseudo: string): Promise<void> {
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO tentatives_connexion (pseudo, le) VALUES (?, ?)").bind(pseudo, Date.now()),
    c.env.DB.prepare("DELETE FROM tentatives_connexion WHERE le < ?").bind(Date.now() - 24 * 60 * 60 * 1000),
  ]);
}

app.post("/auth/connexion", async (c) => {
  const b = await corps<{ pseudo: string; mdp: string }>(c);
  const pseudo = (b.pseudo ?? "").trim();
  if (!pseudo || !b.mdp) return erreur(c, "Pseudo et mot de passe requis.");
  if (await tropDEssais(c, pseudo)) return erreur(c, "Trop d'essais. Réessayez dans quelques minutes.", 429);
  const j = await c.env.DB.prepare("SELECT id, mdp_hash, suspendu, suspendu_motif FROM joueurs WHERE pseudo = ? AND supprime_le IS NULL")
    .bind(pseudo)
    .first<{ id: string; mdp_hash: string; suspendu: number; suspendu_motif: string | null }>();
  if (!j || !(await verifierMotDePasse(b.mdp, j.mdp_hash))) {
    await noterEchec(c, pseudo);
    return erreur(c, "Pseudo ou mot de passe incorrect.", 401);
  }
  if (j.suspendu) return erreur(c, `Ce compte est suspendu${j.suspendu_motif ? ` : ${j.suspendu_motif.replace(/[.\s]+$/, "")}.` : "."} Contactez l'équipe Estacasino.`, 403);
  await noterEmpreintes(c, j.id);
  await ouvrirSession(c, j.id);
  return c.json({ ok: true });
});

app.post("/auth/deconnexion", async (c) => {
  await fermerSession(c);
  return c.json({ ok: true });
});

/** Mot de passe oublié : pseudo + code de secours → nouveau mot de passe et nouveau code de secours. */
app.post("/auth/reinitialiser", async (c) => {
  const b = await corps<{ pseudo: string; codeSecours: string; mdp: string; turnstile: string }>(c);
  if (!(await humainVerifie(c, b.turnstile))) return erreur(c, "Vérification anti-robot échouée, réessayez.", 403);
  const pseudo = (b.pseudo ?? "").trim();
  if (!pseudo || !b.codeSecours) return erreur(c, "Pseudo et code de secours requis.");
  if (typeof b.mdp !== "string" || b.mdp.length < MDP_MIN) return erreur(c, `Mot de passe : ${MDP_MIN} caractères minimum.`);
  if (await tropDEssais(c, pseudo)) return erreur(c, "Trop d'essais. Réessayez dans quelques minutes.", 429);
  const j = await c.env.DB.prepare("SELECT id, secours_hash FROM joueurs WHERE pseudo = ? AND suspendu = 0 AND supprime_le IS NULL").bind(pseudo).first<{ id: string; secours_hash: string }>();
  if (!j || j.secours_hash !== (await sha256(normaliserCodeSecours(b.codeSecours)))) {
    await noterEchec(c, pseudo);
    return erreur(c, "Pseudo ou code de secours incorrect.", 401);
  }
  const codeSecours = nouveauCodeSecours();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE joueurs SET mdp_hash = ?, secours_hash = ? WHERE id = ?").bind(await hacherMotDePasse(b.mdp), await sha256(normaliserCodeSecours(codeSecours)), j.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE joueur_id = ?").bind(j.id),
  ]);
  await ouvrirSession(c, j.id);
  return c.json({ ok: true, codeSecours });
});

app.post("/moi/mdp", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const b = await corps<{ ancien: string; mdp: string }>(c);
  if (typeof b.mdp !== "string" || b.mdp.length < MDP_MIN) return erreur(c, `Mot de passe : ${MDP_MIN} caractères minimum.`);
  const j = await c.env.DB.prepare("SELECT mdp_hash FROM joueurs WHERE id = ?").bind(moi.id).first<{ mdp_hash: string }>();
  if (!j || !(await verifierMotDePasse(b.ancien ?? "", j.mdp_hash))) return erreur(c, "Mot de passe actuel incorrect.", 401);
  await c.env.DB.prepare("UPDATE joueurs SET mdp_hash = ? WHERE id = ?").bind(await hacherMotDePasse(b.mdp), moi.id).run();
  return c.json({ ok: true });
});

/**
 * Suppression de compte (RGPD) : pseudo, date de naissance, mot de passe, avatar, statistiques et historique
 * de jeu sont effacés. Les achats sont conservés, rattachés à un compte anonyme (obligation comptable).
 */
app.post("/moi/supprimer", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const b = await corps<{ mdp: string }>(c);
  const j = await c.env.DB.prepare("SELECT mdp_hash FROM joueurs WHERE id = ?").bind(moi.id).first<{ mdp_hash: string }>();
  if (!j || !(await verifierMotDePasse(b.mdp ?? "", j.mdp_hash))) return erreur(c, "Mot de passe incorrect.", 401);
  const db = c.env.DB;
  await db.batch([
    db.prepare(
      `UPDATE joueurs SET pseudo = ?, mdp_hash = '-', secours_hash = '-', date_naissance = '1900-01-01', solde = 0,
       avatar = ?, theme = 'club', supprime_le = ? WHERE id = ?`,
    ).bind(`supprime-${moi.id.slice(0, 8)}`, JSON.stringify(AVATARS_DEPART[0].config), Date.now(), moi.id),
    db.prepare("DELETE FROM sessions WHERE joueur_id = ?").bind(moi.id),
    db.prepare("DELETE FROM stats_saison WHERE joueur_id = ?").bind(moi.id),
    db.prepare("DELETE FROM transactions_jetons WHERE joueur_id = ?").bind(moi.id),
    db.prepare("DELETE FROM inventaire WHERE joueur_id = ?").bind(moi.id),
    db.prepare("DELETE FROM defis_jour WHERE joueur_id = ?").bind(moi.id),
    db.prepare("UPDATE rooms SET ouverte = 0 WHERE hote_id = ?").bind(moi.id),
  ]);
  await fermerSession(c);
  return c.json({ ok: true });
});

app.post("/moi/code-secours", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const codeSecours = nouveauCodeSecours();
  await c.env.DB.prepare("UPDATE joueurs SET secours_hash = ? WHERE id = ?").bind(await sha256(normaliserCodeSecours(codeSecours)), moi.id).run();
  return c.json({ ok: true, codeSecours });
});

// ───────────── Profil, soldes et bonus ─────────────

function montantBonus(serie: number): number {
  return BONUS_QUOTIDIEN + Math.min(BONUS_SERIE_PAR_JOUR * (serie - 1), BONUS_SERIE_MAX);
}

/** Gains, parties, rang et ligue du joueur pour la saison en cours. */
async function situationSaison(db: D1Database, joueurId: string) {
  const saison = await saisonCourante(db);
  const stats = saison
    ? await db.prepare("SELECT gains_nets, mains FROM stats_saison WHERE joueur_id = ? AND saison_id = ?").bind(joueurId, saison.id).first<{ gains_nets: number; mains: number }>()
    : null;
  let rang: number | null = null;
  if (saison && stats && stats.mains >= CLASSEMENT_MIN_PARTIES) {
    const r = await db
      .prepare(
        `SELECT COUNT(*) + 1 AS rang FROM stats_saison s JOIN joueurs j ON j.id = s.joueur_id
         WHERE s.saison_id = ? AND s.mains >= ? AND s.gains_nets > ? AND j.suspendu = 0 AND j.supprime_le IS NULL`,
      )
      .bind(saison.id, CLASSEMENT_MIN_PARTIES, stats.gains_nets)
      .first<{ rang: number }>();
    rang = r?.rang ?? null;
  }
  const gains = stats?.gains_nets ?? 0;
  const parties = stats?.mains ?? 0;
  return { saison, gains, parties, rang, ligue: ligueDe(gains, parties, rang) };
}

app.get("/moi", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  await noterAppareilSiNouveau(c, moi.id);
  // Forfait saison : un joueur resté à zéro hors des tables est rechargé à son retour.
  const recharge = await rechargerForfait(c.env.DB, moi.id);
  if (recharge !== null) moi.solde = recharge;
  const forfait = await aForfait(c.env.DB, moi.id);
  const j = await c.env.DB.prepare("SELECT bonus_dernier, bonus_serie, filet_dernier, theme FROM joueurs WHERE id = ?")
    .bind(moi.id)
    .first<{ bonus_dernier: string | null; bonus_serie: number; filet_dernier: number | null; theme: string }>();
  const { saison, gains, parties, rang, ligue } = await situationSaison(c.env.DB, moi.id);
  const suivante = ligueSuivante(ligue);
  const inventaire = await c.env.DB.prepare("SELECT piece FROM inventaire WHERE joueur_id = ?").bind(moi.id).all<{ piece: string }>();

  const aujourdHui = jourParis();
  const bonusDispo = j?.bonus_dernier !== aujourdHui;
  const serieSuivante = j?.bonus_dernier === veille(aujourdHui) ? (j?.bonus_serie ?? 0) + 1 : 1;
  const filetProchain = (j?.filet_dernier ?? 0) + FILET_DELAI_MS;
  return c.json({
    id: moi.id,
    pseudo: moi.pseudo,
    solde: moi.solde,
    avatar: lireAvatar(moi.avatar),
    role: moi.role,
    theme: trouverTheme(moi.theme).id,
    inventaire: inventaire.results.map((x) => x.piece),
    saison: saison ? { nom: saison.nom, fin: saison.fin, gains, parties, rang, minParties: CLASSEMENT_MIN_PARTIES } : null,
    ligue: { id: ligue.id, nom: ligue.nom, suivante: suivante ? { id: suivante.id, nom: suivante.nom, seuil: suivante.seuil } : null },
    bonus: { disponible: bonusDispo, montant: montantBonus(serieSuivante), serie: bonusDispo ? serieSuivante : (j?.bonus_serie ?? 1) },
    filet: { seuil: FILET_SEUIL, montant: FILET_MONTANT, disponible: moi.solde < FILET_SEUIL && Date.now() >= filetProchain, prochain: filetProchain },
    forfait,
  });
});

app.post("/bonus/quotidien", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const aujourdHui = jourParis();
  const j = await c.env.DB.prepare("SELECT bonus_dernier, bonus_serie FROM joueurs WHERE id = ?").bind(moi.id).first<{ bonus_dernier: string | null; bonus_serie: number }>();
  const serie = j?.bonus_dernier === veille(aujourdHui) ? (j?.bonus_serie ?? 0) + 1 : 1;
  // Mise à jour conditionnelle : un seul bonus par jour, même en cas de double clic.
  const maj = await c.env.DB.prepare("UPDATE joueurs SET bonus_dernier = ?, bonus_serie = ? WHERE id = ? AND (bonus_dernier IS NULL OR bonus_dernier <> ?)")
    .bind(aujourdHui, serie, moi.id, aujourdHui)
    .run();
  if (maj.meta.changes !== 1) return erreur(c, "Bonus déjà récupéré aujourd'hui. Revenez demain !", 409);
  const montant = montantBonus(serie);
  const solde = await crediter(c.env.DB, moi.id, montant, "bonus", null, null);
  return c.json({ ok: true, montant, serie, solde });
});

app.post("/bonus/filet", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const now = Date.now();
  const maj = await c.env.DB.prepare("UPDATE joueurs SET filet_dernier = ? WHERE id = ? AND solde < ? AND (filet_dernier IS NULL OR filet_dernier <= ?)")
    .bind(now, moi.id, FILET_SEUIL, now - FILET_DELAI_MS)
    .run();
  if (maj.meta.changes !== 1) return erreur(c, "Le filet de sécurité n'est pas disponible pour le moment.", 409);
  const solde = await crediter(c.env.DB, moi.id, FILET_MONTANT, "filet", null, null);
  return c.json({ ok: true, montant: FILET_MONTANT, solde });
});

app.put("/moi/avatar", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const b = await corps<{ avatar: unknown }>(c);
  const inv = await c.env.DB.prepare("SELECT piece FROM inventaire WHERE joueur_id = ?").bind(moi.id).all<{ piece: string }>();
  const possede = new Set(inv.results.map((x) => x.piece));
  const avatar = validerAvatar(b.avatar, (cle) => possede.has(cle));
  if (!avatar) return erreur(c, "Cet avatar contient une pièce que vous ne possédez pas.");
  await c.env.DB.prepare("UPDATE joueurs SET avatar = ? WHERE id = ?").bind(JSON.stringify(avatar), moi.id).run();
  return c.json({ ok: true, avatar });
});

app.put("/moi/theme", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const b = await corps<{ theme: string }>(c);
  const inv = await c.env.DB.prepare("SELECT piece FROM inventaire WHERE joueur_id = ?").bind(moi.id).all<{ piece: string }>();
  const possede = new Set(inv.results.map((x) => x.piece));
  if (!themeAccessible(b.theme ?? "", (cle) => possede.has(cle))) return erreur(c, "Ce thème ne fait pas partie de votre collection.");
  await c.env.DB.prepare("UPDATE joueurs SET theme = ? WHERE id = ?").bind(b.theme, moi.id).run();
  return c.json({ ok: true, theme: b.theme });
});

/**
 * Historique de la saison : solde et gains nets après chaque mouvement de jetons,
 * réduit à 240 points au plus (le dernier point de chaque tranche est gardé).
 */
app.get("/moi/historique", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const saison = await saisonCourante(c.env.DB);
  if (!saison) return c.json({ saison: null, points: [] });
  const r = await c.env.DB.prepare("SELECT montant, type, le FROM transactions_jetons WHERE joueur_id = ? AND le >= ? ORDER BY le, id")
    .bind(moi.id, saison.debut)
    .all<{ montant: number; type: string; le: number }>();
  // Le capital de départ n'est pas un mouvement de jeu : la courbe commence juste après.
  const tx = r.results[0]?.type === "depart" ? r.results.slice(1) : r.results;
  let solde = moi.solde - tx.reduce((a, t) => a + t.montant, 0);
  let gains = 0;
  const debut = Math.max(saison.debut, (tx[0]?.le ?? Date.now()) - 1);
  const points = [{ t: debut, solde, gains }];
  for (const t of tx) {
    solde += t.montant;
    if (t.type === "mise" || t.type === "gain" || t.type === "remboursement") gains += t.montant;
    points.push({ t: t.le, solde, gains });
  }
  const MAX = 240;
  const reduits = points.length <= MAX ? points : points.filter((_, i) => i === 0 || i === points.length - 1 || Math.floor((i * MAX) / points.length) !== Math.floor(((i + 1) * MAX) / points.length));
  return c.json({ saison: { nom: saison.nom, debut: saison.debut }, points: reduits });
});

// ───────────── Défis quotidiens ─────────────

app.get("/defis", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  return c.json({ defis: await lireDefis(c.env.DB, moi.id) });
});

app.post("/defis/:defi/recuperer", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const r = await c.env.DB.prepare(
    `UPDATE defis_jour SET reclame = 1 WHERE joueur_id = ? AND jour = ? AND defi = ? AND reclame = 0 AND progression >= objectif
     RETURNING recompense`,
  )
    .bind(moi.id, jourParis(), c.req.param("defi"))
    .first<{ recompense: number }>();
  if (!r) return erreur(c, "Ce défi n'est pas encore réussi, ou déjà récupéré.", 409);
  const solde = await crediter(c.env.DB, moi.id, r.recompense, "defi", null, null);
  return c.json({ ok: true, recompense: r.recompense, solde });
});

// ───────────── Classement ─────────────

app.get("/classement", async (c) => {
  const saison = await saisonCourante(c.env.DB);
  if (!saison) return c.json({ saison: null, lignes: [] });
  const jeu = c.req.query("jeu");
  const [colGains, colParties] =
    jeu === "blackjack" ? ["gains_bj", "mains_bj"] : jeu === "roulette" ? ["gains_roulette", "tours_roulette"] : jeu === "poker" ? ["gains_poker", "mains_poker"] : ["gains_nets", "mains"];
  const lignes = await c.env.DB.prepare(
    `SELECT j.pseudo, j.avatar, s.${colGains} AS gains, s.${colParties} AS parties
     FROM stats_saison s JOIN joueurs j ON j.id = s.joueur_id
     WHERE s.saison_id = ? AND s.${colParties} >= ? AND j.suspendu = 0 AND j.supprime_le IS NULL
     ORDER BY gains DESC, parties ASC LIMIT 100`,
  )
    .bind(saison.id, CLASSEMENT_MIN_PARTIES)
    .all<{ pseudo: string; avatar: string; gains: number; parties: number }>();
  return c.json({
    saison: { nom: saison.nom, debut: saison.debut, fin: saison.fin },
    minParties: CLASSEMENT_MIN_PARTIES,
    lignes: lignes.results.map((l, i) => ({
      rang: i + 1,
      pseudo: l.pseudo,
      avatar: lireAvatar(l.avatar),
      gains: l.gains,
      parties: l.parties,
      // La ligue se calcule sur le classement général (gains nets de la saison).
      ligue: jeu === "blackjack" || jeu === "roulette" || jeu === "poker" ? null : ligueDe(l.gains, l.parties, i + 1).id,
    })),
  });
});

// ───────────── Rooms et temps réel ─────────────

app.post("/rooms", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const b = await corps<{ jeu: Jeu; min: number; max: number; variante: "cash" | "sng"; niveau: string }>(c);
  if (b.jeu === "poker") return creerRoomPoker(c, moi, b.variante ?? "cash", b.niveau ?? "");
  if (b.jeu !== "blackjack" && b.jeu !== "roulette") return erreur(c, "Jeu inconnu.");
  const defaut = b.jeu === "blackjack" ? BLACKJACK_LIMITES_DEFAUT : ROULETTE_LIMITES_DEFAUT;
  const min = Number(b.min ?? defaut.min);
  const max = Number(b.max ?? defaut.max);
  if (!(PALIERS_MISE_MIN as readonly number[]).includes(min) || !(PALIERS_MISE_MAX as readonly number[]).includes(max) || min > max)
    return erreur(c, "Limites de mise invalides.");
  const { ligue } = await situationSaison(c.env.DB, moi.id);
  if (max > ligue.miseMaxRoom) {
    const requise = LIGUES.find((l) => l.miseMaxRoom >= max);
    return erreur(c, `Une mise maximum de ${max.toLocaleString("fr-FR")} jetons se débloque en ligue ${requise?.nom ?? "supérieure"}.`, 403);
  }
  for (let essai = 0; essai < 8; essai++) {
    const code = chaineAleatoire(ALPHABET_CODE, 5);
    const r = await c.env.DB.prepare(
      `INSERT INTO rooms (code, jeu, hote_id, mise_min, mise_max, ouverte, cree_le, theme) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?8)
       ON CONFLICT (code) DO UPDATE SET jeu = ?2, hote_id = ?3, mise_min = ?4, mise_max = ?5, ouverte = 1, cree_le = ?6, theme = ?8
       WHERE rooms.ouverte = 0 AND rooms.cree_le < ?7`,
    )
      .bind(code, b.jeu, moi.id, min, max, Date.now(), Date.now() - 24 * 60 * 60 * 1000, trouverTheme(moi.theme).id)
      .run();
    if (r.meta.changes === 1) return c.json({ code, jeu: b.jeu });
  }
  return erreur(c, "Impossible de créer la room, réessayez.", 503);
});

async function lireRoom(c: C, code: string) {
  return c.env.DB.prepare(
    "SELECT r.code, r.jeu, r.mise_min, r.mise_max, r.ouverte, r.hote_id, r.theme, r.variante, r.niveau, j.pseudo AS hote FROM rooms r JOIN joueurs j ON j.id = r.hote_id WHERE r.code = ?",
  )
    .bind(code)
    .first<{ code: string; jeu: Jeu; mise_min: number; mise_max: number; ouverte: number; hote_id: string; theme: string; variante: string | null; niveau: string | null; hote: string }>();
}

// ───────────── Poker ─────────────

const RANG_LIGUE = (id: string) => LIGUES.findIndex((l) => l.id === id);

/** Vérifie que la ligue du joueur ouvre ce niveau de poker ; retourne un message d'erreur sinon. */
async function niveauPokerAccessible(db: D1Database, joueurId: string, mode: "cash" | "sng", niveau: string): Promise<string | null> {
  const def = mode === "cash" ? NIVEAUX_POKER.find((n) => n.id === niveau) : ENTREES_SNG.find((n) => n.id === niveau);
  if (!def) return "Niveau de table inconnu.";
  const { ligue } = await situationSaison(db, joueurId);
  if (RANG_LIGUE(ligue.id) < RANG_LIGUE(def.ligue)) return `Cette table se débloque en ligue ${LIGUES[RANG_LIGUE(def.ligue)].nom}.`;
  return null;
}

async function creerRoomPoker(c: C, moi: JoueurSession, variante: "cash" | "sng", niveau: string): Promise<Response> {
  if (variante !== "cash" && variante !== "sng") return erreur(c, "Variante inconnue.");
  const refus = await niveauPokerAccessible(c.env.DB, moi.id, variante, niveau);
  if (refus) return erreur(c, refus, 403);
  for (let essai = 0; essai < 8; essai++) {
    const code = chaineAleatoire(ALPHABET_CODE, 5);
    const r = await c.env.DB.prepare(
      `INSERT INTO rooms (code, jeu, hote_id, mise_min, mise_max, ouverte, cree_le, theme, variante, niveau) VALUES (?1, 'poker', ?2, 0, 0, 1, ?3, ?5, ?6, ?7)
       ON CONFLICT (code) DO UPDATE SET jeu = 'poker', hote_id = ?2, ouverte = 1, cree_le = ?3, theme = ?5, variante = ?6, niveau = ?7
       WHERE rooms.ouverte = 0 AND rooms.cree_le < ?4`,
    )
      .bind(code, moi.id, Date.now(), Date.now() - 24 * 60 * 60 * 1000, trouverTheme(moi.theme).id, variante, niveau)
      .run();
    if (r.meta.changes === 1) return c.json({ code, jeu: "poker" });
  }
  return erreur(c, "Impossible de créer la room, réessayez.", 503);
}

/** Tables publiques : occupation par niveau, pour le lobby du poker. */
app.get("/poker/tables", async (c) => {
  const r = await c.env.DB.prepare(
    "SELECT mode, niveau, SUM(joueurs) AS joueurs, COUNT(*) AS tables FROM poker_tables WHERE maj > ? AND statut IN ('ouverte', 'inscription', 'en_cours') GROUP BY mode, niveau",
  )
    .bind(Date.now() - 6 * 60 * 60 * 1000)
    .all<{ mode: string; niveau: string; joueurs: number; tables: number }>();
  return c.json({ occupation: r.results });
});

/** Trouve une table publique avec une place libre (ou en ouvre une), et renvoie son nom. */
app.post("/poker/rejoindre", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  const b = await corps<{ mode: "cash" | "sng"; niveau: string }>(c);
  if (b.mode !== "cash" && b.mode !== "sng") return erreur(c, "Mode inconnu.");
  const refus = await niveauPokerAccessible(c.env.DB, moi.id, b.mode, b.niveau ?? "");
  if (refus) return erreur(c, refus, 403);
  const statut = b.mode === "cash" ? "ouverte" : "inscription";
  const libre = await c.env.DB.prepare(
    "SELECT nom FROM poker_tables WHERE mode = ? AND niveau = ? AND statut = ? AND joueurs < ? ORDER BY joueurs DESC, maj DESC LIMIT 1",
  )
    .bind(b.mode, b.niveau, statut, POKER_PLACES)
    .first<{ nom: string }>();
  if (libre) return c.json({ nom: libre.nom });
  const nom = `${b.mode}-${b.niveau}-${chaineAleatoire("abcdefghjkmnpqrstuvwxyz23456789", 6)}`;
  await c.env.DB.prepare("INSERT INTO poker_tables (nom, mode, niveau, joueurs, statut, maj) VALUES (?, ?, ?, 0, ?, ?)").bind(nom, b.mode, b.niveau, statut, Date.now()).run();
  return c.json({ nom });
});

app.get("/poker/table/:nom/ws", async (c) => {
  const t = await c.env.DB.prepare("SELECT nom, mode, niveau FROM poker_tables WHERE nom = ?").bind(c.req.param("nom")).first<{ nom: string; mode: "cash" | "sng"; niveau: string }>();
  if (!t) return erreur(c, "Table introuvable.", 404);
  const def = t.mode === "cash" ? NIVEAUX_POKER.find((n) => n.id === t.niveau) : ENTREES_SNG.find((n) => n.id === t.niveau);
  const nom = t.mode === "cash" ? `Table publique · ${(def as NiveauPoker).petite} / ${(def as NiveauPoker).grosse}` : `Sit & Go public · entrée ${(def as EntreeSng).entree}`;
  return versRoom(c, c.env.ROOMS_POKER, `publique:${t.nom}`, {
    code: null, solo: false, hoteId: null, nom, theme: null, min: 0, max: 0, poker: { mode: t.mode, niveau: t.niveau, publique: t.nom },
  });
});

app.get("/poker/table/:nom", async (c) => {
  const t = await c.env.DB.prepare("SELECT nom, mode, niveau, statut FROM poker_tables WHERE nom = ?").bind(c.req.param("nom")).first();
  return t ? c.json(t) : erreur(c, "Table introuvable.", 404);
});

app.get("/rooms/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();
  if (!CODE_REGEX.test(code)) return erreur(c, "Code invalide : 5 lettres.", 404);
  const r = await lireRoom(c, code);
  if (!r || !r.ouverte) return erreur(c, "Aucune room ouverte avec ce code.", 404);
  return c.json({ code: r.code, jeu: r.jeu, min: r.mise_min, max: r.mise_max, hote: r.hote, theme: trouverTheme(r.theme).id, variante: r.variante, niveau: r.niveau });
});

/** Relaie une connexion WebSocket vers le Durable Object de la room, avec l'identité vérifiée du joueur. */
async function versRoom(c: C, ns: DurableObjectNamespace, nom: string, config: ConfigRoom): Promise<Response> {
  if (c.req.header("Upgrade") !== "websocket") return erreur(c, "WebSocket attendu.", 400);
  const moi = await joueurConnecte(c);
  if (!moi) return erreur(c, "Connectez-vous pour jouer.", 401);
  const ident: Identite = { id: moi.id, pseudo: moi.pseudo, avatar: lireAvatar(moi.avatar), solde: moi.solde };
  const headers = new Headers(c.req.raw.headers);
  headers.set(ENTETE_IDENTITE, encodeURIComponent(JSON.stringify(ident)));
  headers.set(ENTETE_CONFIG, encodeURIComponent(JSON.stringify(config)));
  const stub = ns.get(ns.idFromName(nom));
  return stub.fetch(new Request(c.req.url, { headers }));
}

app.get("/jeu/blackjack/solo/ws", async (c) => {
  const moi = await joueurConnecte(c);
  if (!moi) return erreur(c, "Connectez-vous pour jouer.", 401);
  return versRoom(c, c.env.ROOMS_BLACKJACK, `solo:${moi.id}`, {
    code: null, solo: true, hoteId: moi.id, nom: "Table privée", theme: null, ...BLACKJACK_LIMITES_DEFAUT,
  });
});

app.get("/jeu/roulette/solo/ws", async (c) => {
  const moi = await joueurConnecte(c);
  if (!moi) return erreur(c, "Connectez-vous pour jouer.", 401);
  return versRoom(c, c.env.ROOMS_ROULETTE, `solo:${moi.id}`, {
    code: null, solo: true, hoteId: moi.id, nom: "Roulette · table privée", theme: null, ...ROULETTE_LIMITES_DEFAUT,
  });
});

app.get("/jeu/roulette/grande-roue/ws", (c) =>
  versRoom(c, c.env.ROOMS_ROULETTE, "grande-roue", { code: null, solo: false, hoteId: null, nom: "La Grande Roue", theme: null, ...ROULETTE_LIMITES_DEFAUT }),
);

app.get("/rooms/:code/ws", async (c) => {
  const code = c.req.param("code").toUpperCase();
  const r = CODE_REGEX.test(code) ? await lireRoom(c, code) : null;
  if (!r || !r.ouverte) return erreur(c, "Aucune room ouverte avec ce code.", 404);
  if (r.jeu === "poker") {
    const mode = r.variante === "sng" ? "sng" : "cash";
    return versRoom(c, c.env.ROOMS_POKER, `room:${code}:${r.hote_id}`, {
      code, solo: false, hoteId: r.hote_id, nom: `Room ${code}`, theme: trouverTheme(r.theme).id, min: 0, max: 0, poker: { mode, niveau: r.niveau ?? "", publique: null },
    });
  }
  const ns = r.jeu === "blackjack" ? c.env.ROOMS_BLACKJACK : c.env.ROOMS_ROULETTE;
  return versRoom(c, ns, `room:${code}:${r.hote_id}`, {
    code, solo: false, hoteId: r.hote_id, nom: `Room ${code}`, theme: trouverTheme(r.theme).id, min: r.mise_min, max: r.mise_max,
  });
});

// ───────────── Boutique (cosmétiques uniquement) ─────────────

app.get("/boutique", async (c) => {
  const moi = await joueurConnecte(c);
  const possede = moi
    ? new Set((await c.env.DB.prepare("SELECT piece FROM inventaire WHERE joueur_id = ?").bind(moi.id).all<{ piece: string }>()).results.map((x) => x.piece))
    : new Set<string>();
  const forfait = moi ? await aForfait(c.env.DB, moi.id) : false;
  const saison = await saisonCourante(c.env.DB);
  return c.json({
    paiementActif: Boolean(c.env.STRIPE_SECRET_KEY),
    saison: saison ? { nom: saison.nom } : null,
    produits: PRODUITS.map((p) => ({
      ...p,
      possede: p.type === "forfait" ? forfait : p.type === "jetons" ? false : p.pieces.every((x) => possede.has(x)),
    })),
  });
});

app.post("/boutique/checkout", async (c) => {
  const moi = await exigerJoueur(c);
  if (moi instanceof Response) return moi;
  if (!c.env.STRIPE_SECRET_KEY) return erreur(c, "La boutique n'est pas encore ouverte.", 503);
  const b = await corps<{ produit: string; renonciation: boolean }>(c);
  const produit = trouverProduit(b.produit ?? "");
  if (!produit) return erreur(c, "Produit inconnu.", 404);
  if (b.renonciation !== true) return erreur(c, "Veuillez confirmer la livraison immédiate du contenu numérique.");
  let saisonId: number | null = null;
  if (produit.type === "forfait") {
    const saison = await saisonCourante(c.env.DB);
    if (!saison) return erreur(c, "Aucune saison n'est en cours.", 409);
    if (await aForfait(c.env.DB, moi.id)) return erreur(c, "Vous avez déjà le forfait pour cette saison.", 409);
    saisonId = saison.id;
  } else if (produit.type === "jetons") {
    const r = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM achats WHERE joueur_id = ? AND le > ? AND produit IN (${PRODUITS.filter((p) => p.type === "jetons").map(() => "?").join(",")})`,
    )
      .bind(moi.id, Date.now() - 24 * 60 * 60 * 1000, ...PRODUITS.filter((p) => p.type === "jetons").map((p) => p.id))
      .first<{ n: number }>();
    if ((r?.n ?? 0) >= PLAFOND_PACKS_JOUR) return erreur(c, `Limite atteinte : ${PLAFOND_PACKS_JOUR} packs de jetons par 24 heures. Faites une pause, la table vous attendra.`, 429);
  } else {
    const possede = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM inventaire WHERE joueur_id = ? AND piece IN (${produit.pieces.map(() => "?").join(",")})`)
      .bind(moi.id, ...produit.pieces)
      .first<{ n: number }>();
    if ((possede?.n ?? 0) === produit.pieces.length) return erreur(c, "Vous possédez déjà ce produit.", 409);
  }
  try {
    const session = await creerSessionCheckout(c.env.STRIPE_SECRET_KEY, produit, moi, c.env.APP_URL, saisonId);
    return c.json({ url: session.url });
  } catch (e) {
    console.error("stripe", e);
    return erreur(c, "Le paiement est momentanément indisponible.", 503);
  }
});

app.post("/stripe/webhook", async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) return erreur(c, "Webhook non configuré.", 503);
  const brut = await c.req.text();
  if (!(await verifierSignatureWebhook(brut, c.req.header("Stripe-Signature") ?? null, c.env.STRIPE_WEBHOOK_SECRET)))
    return erreur(c, "Signature invalide.", 400);
  const evt = JSON.parse(brut) as { type: string; data: { object: SessionCheckoutTerminee } };
  if (evt.type !== "checkout.session.completed" && evt.type !== "checkout.session.async_payment_succeeded") return c.json({ recu: true });
  const s = evt.data.object;
  if (s.payment_status !== "paid") return c.json({ recu: true });
  const joueurId = s.metadata?.joueur_id;
  const produit = trouverProduit(s.metadata?.produit ?? "");
  if (!joueurId || !produit) return c.json({ recu: true });
  const now = Date.now();
  const centimes = s.amount_total ?? produit.prixCentimes;
  if (produit.type === "jetons") {
    await crediterAchatJetons(c.env.DB, { joueurId, produit: produit.id, jetons: produit.jetons ?? 0, centimes, session: s.id });
    return c.json({ recu: true });
  }
  if (produit.type === "forfait") {
    // Le forfait vaut pour la saison en cours au moment du paiement (notée dans la session Stripe).
    const saisonId = Number(s.metadata?.saison_id) || (await saisonCourante(c.env.DB))?.id;
    if (!saisonId) return c.json({ recu: true });
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT OR IGNORE INTO achats (joueur_id, produit, montant_centimes, stripe_session, le) VALUES (?, ?, ?, ?, ?)").bind(joueurId, produit.id, centimes, s.id, now),
      c.env.DB.prepare("INSERT OR IGNORE INTO forfaits_saison (joueur_id, saison_id, stripe_session, le) VALUES (?, ?, ?, ?)").bind(joueurId, saisonId, s.id, now),
    ]);
    await rechargerForfait(c.env.DB, joueurId); // déjà à zéro au moment de l'achat : recharge immédiate
    return c.json({ recu: true });
  }
  // Cosmétiques. Idempotent : la session Stripe est unique dans `achats`, et les pièces déjà possédées sont ignorées.
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO achats (joueur_id, produit, montant_centimes, stripe_session, le) VALUES (?, ?, ?, ?, ?)").bind(
      joueurId, produit.id, centimes, s.id, now,
    ),
    ...produit.pieces.map((piece) =>
      c.env.DB.prepare("INSERT OR IGNORE INTO inventaire (joueur_id, piece, origine, le) VALUES (?, ?, 'achat', ?)").bind(joueurId, piece, now),
    ),
  ]);
  return c.json({ recu: true });
});

app.route("/admin", admin);

app.notFound((c) => erreur(c, "Introuvable.", 404));
app.onError((e, c) => {
  console.error(e);
  return erreur(c, "Erreur interne.", 500);
});

export default app;
