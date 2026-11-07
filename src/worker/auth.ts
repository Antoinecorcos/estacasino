import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { chaineAleatoire, hex, octetsAleatoires, sha256 } from "./crypto";
import type { Env } from "./env";

// Sessions : un jeton aléatoire dans un cookie HttpOnly ; seule son empreinte SHA-256 est stockée en base.

export const COOKIE = "esta_session";
const DUREE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export interface JoueurSession {
  id: string;
  pseudo: string;
  solde: number;
  avatar: string;
  theme: string;
}

export async function ouvrirSession(c: Context<{ Bindings: Env }>, joueurId: string): Promise<void> {
  const jeton = hex(octetsAleatoires(32));
  const expire = Date.now() + DUREE_SESSION_MS;
  await c.env.DB.prepare("INSERT INTO sessions (token_hash, joueur_id, expire_le) VALUES (?, ?, ?)")
    .bind(await sha256(jeton), joueurId, expire)
    .run();
  setCookie(c, COOKIE, jeton, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: DUREE_SESSION_MS / 1000,
  });
}

export async function fermerSession(c: Context<{ Bindings: Env }>): Promise<void> {
  const jeton = getCookie(c, COOKIE);
  if (jeton) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(jeton)).run();
  deleteCookie(c, COOKIE, { path: "/" });
}

export async function joueurConnecte(c: Context<{ Bindings: Env }>): Promise<JoueurSession | null> {
  const jeton = getCookie(c, COOKIE);
  if (!jeton || jeton.length !== 64) return null;
  return c.env.DB.prepare(
    `SELECT j.id, j.pseudo, j.solde, j.avatar, j.theme FROM sessions s JOIN joueurs j ON j.id = s.joueur_id
     WHERE s.token_hash = ? AND s.expire_le > ?`,
  )
    .bind(await sha256(jeton), Date.now())
    .first<JoueurSession>();
}

/** Code de secours affiché une seule fois : 4 groupes de 4 caractères, ex. « K7QM-3XRT-… ». */
export function nouveauCodeSecours(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [0, 1, 2, 3].map(() => chaineAleatoire(alphabet, 4)).join("-");
}

export function normaliserCodeSecours(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");
}

/** Âge en années révolues à partir d'une date AAAA-MM-JJ. */
export function age(dateNaissance: string, maintenant = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateNaissance);
  if (!m) return null;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) return null;
  let ans = maintenant.getUTCFullYear() - a;
  const anniversairePasse =
    maintenant.getUTCMonth() > mo - 1 || (maintenant.getUTCMonth() === mo - 1 && maintenant.getUTCDate() >= j);
  if (!anniversairePasse) ans--;
  return ans;
}
