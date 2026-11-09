import type { Jeu } from "../shared/regles";

// Tous les mouvements de jetons passent par ici et sont inscrits dans `transactions_jetons`.
// Rappel : aucune fonction de ce fichier n'est appelée par la boutique ou par Stripe.

export type TypeTransaction = "depart" | "bonus" | "filet" | "mise" | "gain" | "remboursement" | "defi" | "cave" | "retrait";

/** Débite un joueur si son solde le permet. Retourne le nouveau solde, ou null si solde insuffisant. */
export async function debiter(
  db: D1Database,
  joueurId: string,
  montant: number,
  jeu: Jeu,
  room: string | null,
  type: TypeTransaction = "mise",
): Promise<number | null> {
  if (!Number.isInteger(montant) || montant <= 0) return null;
  const ligne = await db
    .prepare("UPDATE joueurs SET solde = solde - ?1 WHERE id = ?2 AND solde >= ?1 RETURNING solde")
    .bind(montant, joueurId)
    .first<{ solde: number }>();
  if (!ligne) return null;
  await db
    .prepare("INSERT INTO transactions_jetons (joueur_id, montant, type, jeu, room, le) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(joueurId, -montant, type, jeu, room, Date.now())
    .run();
  return ligne.solde;
}

export async function crediter(
  db: D1Database,
  joueurId: string,
  montant: number,
  type: TypeTransaction,
  jeu: Jeu | null,
  room: string | null,
): Promise<number | null> {
  if (!Number.isInteger(montant) || montant <= 0) return lireSolde(db, joueurId);
  const [maj] = await db.batch([
    db.prepare("UPDATE joueurs SET solde = solde + ? WHERE id = ? RETURNING solde").bind(montant, joueurId),
    db
      .prepare("INSERT INTO transactions_jetons (joueur_id, montant, type, jeu, room, le) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(joueurId, montant, type, jeu, room, Date.now()),
  ]);
  return (maj.results[0] as { solde: number } | undefined)?.solde ?? null;
}

export async function lireSolde(db: D1Database, joueurId: string): Promise<number | null> {
  const l = await db.prepare("SELECT solde FROM joueurs WHERE id = ?").bind(joueurId).first<{ solde: number }>();
  return l?.solde ?? null;
}

export async function saisonCourante(db: D1Database): Promise<{ id: number; nom: string; debut: number; fin: number } | null> {
  const now = Date.now();
  return db
    .prepare("SELECT id, nom, debut, fin FROM saisons WHERE debut <= ?1 AND fin > ?1 ORDER BY id DESC LIMIT 1")
    .bind(now)
    .first();
}

/**
 * Enregistre le résultat d'une main (blackjack) ou d'un tour (roulette) dans les statistiques de saison.
 * Les parties en room privée comptent comme les autres.
 */
export async function enregistrerResultat(db: D1Database, joueurId: string, jeu: Jeu, mise: number, rendu: number): Promise<void> {
  const saison = await saisonCourante(db);
  if (!saison) return;
  const net = rendu - mise;
  const bj = jeu === "blackjack";
  await db
    .prepare(
      `INSERT INTO stats_saison (joueur_id, saison_id, gains_nets, mains, mains_bj, gains_bj, tours_roulette, gains_roulette)
       VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?7)
       ON CONFLICT (joueur_id, saison_id) DO UPDATE SET
         gains_nets = gains_nets + excluded.gains_nets,
         mains = mains + 1,
         mains_bj = mains_bj + excluded.mains_bj,
         gains_bj = gains_bj + excluded.gains_bj,
         tours_roulette = tours_roulette + excluded.tours_roulette,
         gains_roulette = gains_roulette + excluded.gains_roulette`,
    )
    .bind(joueurId, saison.id, net, bj ? 1 : 0, bj ? net : 0, bj ? 0 : 1, bj ? 0 : net)
    .run();
}

/**
 * Poker : statistiques à part (classement poker). N'affecte pas les gains de saison du classement général.
 * `net` = jetons gagnés ou perdus sur la main (partie libre) ou sur le tournoi (Sit & Go).
 */
export async function enregistrerPoker(db: D1Database, joueurId: string, net: number): Promise<void> {
  const saison = await saisonCourante(db);
  if (!saison) return;
  await db
    .prepare(
      `INSERT INTO stats_saison (joueur_id, saison_id, mains_poker, gains_poker) VALUES (?1, ?2, 1, ?3)
       ON CONFLICT (joueur_id, saison_id) DO UPDATE SET mains_poker = mains_poker + 1, gains_poker = gains_poker + excluded.gains_poker`,
    )
    .bind(joueurId, saison.id, net)
    .run();
}

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function jourParis(ms = Date.now()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function veille(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
