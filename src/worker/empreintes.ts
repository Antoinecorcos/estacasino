import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { COMPTES_PAR_APPAREIL, INSCRIPTIONS_PAR_IP_JOUR } from "../shared/regles";
import { hex, octetsAleatoires, sha256 } from "./crypto";
import type { Env } from "./env";

// Comptes multiples : on repère l'appareil (un identifiant aléatoire dans un cookie de longue durée)
// et l'adresse IP. Les deux sont stockés hachés, jamais en clair. Ils servent à limiter les
// inscriptions en série (un joueur à zéro qui recrée un compte pour repartir avec 10 000 jetons)
// et à montrer à l'équipe les comptes liés entre eux.

type C = Context<{ Bindings: Env }>;

const COOKIE_APPAREIL = "esta_appareil";
const DUREE_APPAREIL_S = 400 * 24 * 60 * 60; // maximum accepté par les navigateurs
const JOUR_MS = 24 * 60 * 60 * 1000;
/** Les adresses IP ne sont gardées que 90 jours. */
const CONSERVATION_IP_MS = 90 * JOUR_MS;
const CONSERVATION_SUPPRIMES_MS = 365 * JOUR_MS;

const adresseIp = (c: C) => c.req.header("CF-Connecting-IP") ?? "local";

/** Identifiant de l'appareil (créé et posé en cookie s'il n'existe pas encore). */
export function appareil(c: C): { valeur: string; nouveau: boolean } {
  const existant = getCookie(c, COOKIE_APPAREIL);
  if (existant && /^[0-9a-f]{32}$/.test(existant)) return { valeur: existant, nouveau: false };
  const valeur = hex(octetsAleatoires(16));
  setCookie(c, COOKIE_APPAREIL, valeur, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: DUREE_APPAREIL_S,
  });
  return { valeur, nouveau: true };
}

async function empreintesRequete(c: C): Promise<{ appareil: string; ip: string; appareilNouveau: boolean }> {
  const a = appareil(c);
  return {
    appareil: await sha256(`appareil:${a.valeur}`),
    ip: await sha256(`ip:${adresseIp(c)}:estacasino`),
    appareilNouveau: a.nouveau,
  };
}

/**
 * Avant une inscription : refuse si cet appareil a déjà un compte (même supprimé),
 * ou si trop de comptes ont été créés depuis cette adresse IP dans les dernières 24 heures.
 * Un appareil déjà utilisé par un administrateur n'est pas limité (comptes de test).
 */
export async function inscriptionRefusee(c: C): Promise<string | null> {
  const db = c.env.DB;
  const e = await empreintesRequete(c);
  const [parAppareil, parIp] = await db.batch([
    db.prepare(
      `SELECT COUNT(DISTINCT e.joueur_id) AS n, MAX(j.role = 'admin') AS admin FROM empreintes e JOIN joueurs j ON j.id = e.joueur_id
       WHERE e.type = 'appareil' AND e.valeur = ?`,
    ).bind(e.appareil),
    db.prepare("SELECT COUNT(*) AS n FROM empreintes WHERE type = 'ip' AND valeur = ? AND inscription = 1 AND premier_le > ?").bind(e.ip, Date.now() - JOUR_MS),
  ]);
  const a = parAppareil.results[0] as { n: number; admin: number | null };
  if (!a.admin && a.n >= COMPTES_PAR_APPAREIL)
    return "Un compte a déjà été créé sur cet appareil. Connectez-vous avec celui-ci (mot de passe oublié : utilisez votre code de secours).";
  if (!a.admin && (parIp.results[0] as { n: number }).n >= INSCRIPTIONS_PAR_IP_JOUR)
    return "Trop de comptes ont été créés depuis cette connexion aujourd'hui. Réessayez demain.";
  return null;
}

/** Note l'appareil et l'adresse IP d'un joueur (à l'inscription, à la connexion, et au premier passage sans cookie). */
export async function noterEmpreintes(c: C, joueurId: string, inscription = false): Promise<void> {
  const db = c.env.DB;
  const e = await empreintesRequete(c);
  const now = Date.now();
  const upsert = (type: "appareil" | "ip", valeur: string) =>
    db.prepare(
      `INSERT INTO empreintes (joueur_id, type, valeur, premier_le, dernier_le, inscription) VALUES (?1, ?2, ?3, ?4, ?4, ?5)
       ON CONFLICT (joueur_id, type, valeur) DO UPDATE SET dernier_le = excluded.dernier_le`,
    ).bind(joueurId, type, valeur, now, inscription ? 1 : 0);
  await db.batch([
    upsert("appareil", e.appareil),
    upsert("ip", e.ip),
    db.prepare("DELETE FROM empreintes WHERE type = 'ip' AND dernier_le < ?").bind(now - CONSERVATION_IP_MS),
    // Comptes supprimés : l'empreinte d'appareil est gardée un an (contre les suppressions-recréations), puis effacée.
    db.prepare("DELETE FROM empreintes WHERE joueur_id IN (SELECT id FROM joueurs WHERE supprime_le IS NOT NULL AND supprime_le < ?)").bind(now - CONSERVATION_SUPPRIMES_MS),
  ]);
}

/** Pour un joueur déjà connecté : pose le cookie d'appareil s'il manque, et le note. */
export async function noterAppareilSiNouveau(c: C, joueurId: string): Promise<void> {
  if (getCookie(c, COOKIE_APPAREIL)) return;
  await noterEmpreintes(c, joueurId);
}

export interface CompteLie {
  id: string;
  pseudo: string;
  solde: number;
  cree_le: number;
  supprime_le: number | null;
  suspendu: number;
  via: string; // « appareil », « ip » ou « appareil,ip »
}

/** Comptes qui partagent un appareil ou une adresse IP avec ce joueur. */
export async function comptesLies(db: D1Database, joueurId: string): Promise<CompteLie[]> {
  const r = await db
    .prepare(
      `SELECT j.id, j.pseudo, j.solde, j.cree_le, j.supprime_le, j.suspendu, GROUP_CONCAT(DISTINCT autre.type) AS via
       FROM empreintes moi
       JOIN empreintes autre ON autre.type = moi.type AND autre.valeur = moi.valeur AND autre.joueur_id <> moi.joueur_id
       JOIN joueurs j ON j.id = autre.joueur_id
       WHERE moi.joueur_id = ?
       GROUP BY j.id ORDER BY j.cree_le DESC LIMIT 50`,
    )
    .bind(joueurId)
    .all<CompteLie>();
  return r.results;
}
