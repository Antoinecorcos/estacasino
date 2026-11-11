import { Hono, type Context } from "hono";
import { FILET_DELAI_MS, FILET_MONTANT, FILET_SEUIL, formatJetons, montantBonus } from "../shared/regles";
import { joueurConnecte } from "./auth";
import { jourParis, veille } from "./economie";
import type { Env } from "./env";
import { type Abonnement, clesVapid, envoyer, type Notification } from "./push";

// Rappels envoyés sur le téléphone (application installée) :
//  - le bonus du jour, à 10 h (heure de Paris), à ceux qui ne l'ont pas encore récupéré ;
//  - le filet de sécurité, quand il redevient disponible (entre 9 h et 22 h, et pas en pleine partie).
// Une tâche planifiée Cloudflare passe toutes les 15 minutes (voir « triggers » dans wrangler.jsonc).

const HEURE_BONUS = 10;
/** Au plus 45 envois par passage : sous la limite de requêtes sortantes d'un Worker gratuit. */
const ENVOIS_PAR_PASSAGE = 45;
/** Services de notifications acceptés (on ne poste jamais vers une adresse quelconque). */
const SERVICES = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

const sujet = (env: Env) => env.APP_URL || "https://estacasino.com";

/** Heure à Paris (0 à 23). On lit la partie « hour » : le format français écrit « 19 h », pas « 19 ». */
export function heureParis(ms = Date.now()): number {
  const parties = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  return Number(parties.find((p) => p.type === "hour")?.value ?? 0);
}

/** Envoie à tous les appareils d'un joueur ; supprime les abonnements expirés. Retourne le nombre d'envois. */
export async function notifierJoueur(env: Env, joueurId: string, n: Notification): Promise<number> {
  const db = env.DB;
  const abos = await db.prepare("SELECT endpoint, p256dh, auth FROM abonnements_push WHERE joueur_id = ?").bind(joueurId).all<Abonnement>();
  if (!abos.results.length) return 0;
  const cles = await clesVapid(db);
  let ok = 0;
  for (const a of abos.results) {
    const r = await envoyer(cles, sujet(env), a, n);
    if (r === "ok") {
      ok++;
      await db.prepare("UPDATE abonnements_push SET echecs = 0 WHERE endpoint = ?").bind(a.endpoint).run();
    } else if (r === "expire") {
      await db.prepare("DELETE FROM abonnements_push WHERE endpoint = ?").bind(a.endpoint).run();
    } else {
      // Après 5 échecs de suite, l'abonnement est abandonné.
      await db.batch([
        db.prepare("UPDATE abonnements_push SET echecs = echecs + 1 WHERE endpoint = ?").bind(a.endpoint),
        db.prepare("DELETE FROM abonnements_push WHERE endpoint = ? AND echecs >= 5").bind(a.endpoint),
      ]);
    }
  }
  return ok;
}

/** Passage de la tâche planifiée. */
export async function tacheNotifications(env: Env, maintenant = Date.now()): Promise<{ bonus: number; filet: number }> {
  const db = env.DB;
  const heure = heureParis(maintenant);
  let budget = ENVOIS_PAR_PASSAGE;
  let bonus = 0;
  let filet = 0;
  const actifs = `j.suspendu = 0 AND j.supprime_le IS NULL AND EXISTS (SELECT 1 FROM abonnements_push a WHERE a.joueur_id = j.id)`;

  // Bonus du jour, à partir de 10 h. Les passages suivants rattrapent ceux qui n'ont pas pu être servis.
  if (heure >= HEURE_BONUS && heure < 22) {
    const jour = jourParis(maintenant);
    const r = await db
      .prepare(
        `SELECT j.id, j.bonus_dernier, j.bonus_serie FROM joueurs j
         WHERE ${actifs} AND j.notif_bonus = 1
           AND (j.bonus_dernier IS NULL OR j.bonus_dernier <> ?1) AND (j.bonus_notifie IS NULL OR j.bonus_notifie <> ?1)
         LIMIT ?2`,
      )
      .bind(jour, budget)
      .all<{ id: string; bonus_dernier: string | null; bonus_serie: number }>();
    for (const j of r.results) {
      if (budget <= 0) break;
      // Noté avant l'envoi : jamais deux rappels le même jour, même si un passage plante en route.
      await db.prepare("UPDATE joueurs SET bonus_notifie = ? WHERE id = ?").bind(jour, j.id).run();
      const serie = j.bonus_dernier === veille(jour) ? j.bonus_serie + 1 : 1;
      const envoyes = await notifierJoueur(env, j.id, {
        titre: "Votre bonus du jour vous attend",
        texte: serie > 1 ? `${formatJetons(montantBonus(serie))} jetons · série de ${serie} jours, ne la cassez pas !` : `${formatJetons(montantBonus(serie))} jetons offerts. Le croupier a déjà mélangé.`,
        url: "/",
        tag: "bonus",
      });
      budget -= Math.max(1, envoyes);
      bonus += envoyes;
    }
  }

  // Filet de sécurité redevenu disponible : en journée, et seulement si le joueur n'est pas en train de jouer.
  if (budget > 0 && heure >= 9 && heure < 22) {
    const r = await db
      .prepare(
        `SELECT j.id FROM joueurs j
         WHERE ${actifs} AND j.notif_filet = 1 AND j.solde < ?1
           AND (j.filet_dernier IS NULL OR j.filet_dernier <= ?2)
           AND (j.filet_notifie IS NULL OR j.filet_notifie < COALESCE(j.filet_dernier, 0))
           AND NOT EXISTS (SELECT 1 FROM transactions_jetons t WHERE t.joueur_id = j.id AND t.le > ?3)
         LIMIT ?4`,
      )
      .bind(FILET_SEUIL, maintenant - FILET_DELAI_MS, maintenant - 30 * 60 * 1000, budget)
      .all<{ id: string }>();
    for (const j of r.results) {
      if (budget <= 0) break;
      await db.prepare("UPDATE joueurs SET filet_notifie = ? WHERE id = ?").bind(maintenant, j.id).run();
      const envoyes = await notifierJoueur(env, j.id, {
        titre: "Votre filet de sécurité est prêt",
        texte: `${formatJetons(FILET_MONTANT)} jetons pour repartir. La table vous attend.`,
        url: "/",
        tag: "filet",
      });
      budget -= Math.max(1, envoyes);
      filet += envoyes;
    }
  }
  return { bonus, filet };
}

// ───────── Routes : abonnement depuis le téléphone ─────────

type C = Context<{ Bindings: Env }>;
export const notifications = new Hono<{ Bindings: Env }>();

async function joueur(c: C) {
  return joueurConnecte(c);
}

notifications.get("/", async (c) => {
  const moi = await joueur(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const [cles, prefs] = await Promise.all([
    clesVapid(c.env.DB),
    c.env.DB.prepare("SELECT notif_bonus, notif_filet FROM joueurs WHERE id = ?").bind(moi.id).first<{ notif_bonus: number; notif_filet: number }>(),
  ]);
  return c.json({ cle: cles.publique, bonus: prefs?.notif_bonus === 1, filet: prefs?.notif_filet === 1 });
});

notifications.post("/abonnement", async (c) => {
  const moi = await joueur(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const b = (await c.req.json().catch(() => ({}))) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  let url: URL;
  try {
    url = new URL(b.endpoint ?? "");
  } catch {
    return c.json({ erreur: "Abonnement invalide." }, 400);
  }
  const p256dh = b.keys?.p256dh ?? "";
  const auth = b.keys?.auth ?? "";
  const valide = url.protocol === "https:" && SERVICES.some((s) => url.hostname === s || url.hostname.endsWith(`.${s}`));
  if (!valide || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth) || url.href.length > 1000)
    return c.json({ erreur: "Abonnement invalide." }, 400);
  await c.env.DB.prepare(
    `INSERT INTO abonnements_push (endpoint, joueur_id, p256dh, auth, cree_le) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET joueur_id = excluded.joueur_id, p256dh = excluded.p256dh, auth = excluded.auth, echecs = 0`,
  )
    .bind(url.href, moi.id, p256dh, auth, Date.now())
    .run();
  return c.json({ ok: true });
});

notifications.post("/desabonnement", async (c) => {
  const moi = await joueur(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const b = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
  await c.env.DB.prepare("DELETE FROM abonnements_push WHERE endpoint = ? AND joueur_id = ?").bind(b.endpoint ?? "", moi.id).run();
  return c.json({ ok: true });
});

notifications.put("/preferences", async (c) => {
  const moi = await joueur(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const b = (await c.req.json().catch(() => ({}))) as { bonus?: boolean; filet?: boolean };
  await c.env.DB.prepare("UPDATE joueurs SET notif_bonus = COALESCE(?, notif_bonus), notif_filet = COALESCE(?, notif_filet) WHERE id = ?")
    .bind(b.bonus === undefined ? null : b.bonus ? 1 : 0, b.filet === undefined ? null : b.filet ? 1 : 0, moi.id)
    .run();
  return c.json({ ok: true });
});

notifications.post("/test", async (c) => {
  const moi = await joueur(c);
  if (!moi) return c.json({ erreur: "Connectez-vous pour continuer." }, 401);
  const n = await notifierJoueur(c.env, moi.id, {
    titre: "Les notifications fonctionnent",
    texte: "Rendez-vous demain à 10 h pour votre bonus du jour.",
    url: "/profil",
    tag: "test",
  });
  if (!n) return c.json({ erreur: "Aucun appareil n'a pu être joint. Désactivez puis réactivez les notifications." }, 409);
  return c.json({ ok: true, appareils: n });
});
