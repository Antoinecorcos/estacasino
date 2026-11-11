import { FORFAIT_MONTANT, FORFAIT_SEUIL, type Jeu } from "../shared/regles";

// Tous les mouvements de jetons passent par ici et sont inscrits dans `transactions_jetons`.
// Jetons achetés : type « achat » (pack) ou « forfait » (recharge du forfait saison).

export type TypeTransaction =
  | "depart" | "bonus" | "filet" | "mise" | "gain" | "remboursement" | "defi" | "cave" | "retrait" | "ajustement" | "achat" | "forfait";

/** Débite un joueur si son solde le permet. Retourne le nouveau solde, ou null si solde insuffisant. */
export async function debiter(
  db: D1Database,
  joueurId: string,
  montant: number,
  jeu: Jeu | null,
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

/**
 * Pack de jetons payé (webhook Stripe). Tout se fait dans une seule transaction D1, et l'indicateur
 * `jetons_credites` garantit un seul crédit par session Stripe, même si le webhook arrive plusieurs fois.
 */
export async function crediterAchatJetons(
  db: D1Database,
  a: { joueurId: string; produit: string; jetons: number; centimes: number; session: string },
): Promise<void> {
  const now = Date.now();
  const nonCredite = "EXISTS (SELECT 1 FROM achats WHERE stripe_session = ? AND jetons_credites = 0)";
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO achats (joueur_id, produit, montant_centimes, stripe_session, le) VALUES (?, ?, ?, ?, ?)")
      .bind(a.joueurId, a.produit, a.centimes, a.session, now),
    db.prepare(`INSERT INTO transactions_jetons (joueur_id, montant, type, jeu, room, le) SELECT ?, ?, 'achat', NULL, ?, ? WHERE ${nonCredite}`)
      .bind(a.joueurId, a.jetons, a.produit, now, a.session),
    db.prepare(`UPDATE joueurs SET solde = solde + ? WHERE id = ? AND ${nonCredite}`).bind(a.jetons, a.joueurId, a.session),
    db.prepare("UPDATE achats SET jetons_credites = 1 WHERE stripe_session = ?").bind(a.session),
  ]);
}

/**
 * Forfait saison : si le joueur l'a pour la saison en cours et que son solde est tombé à zéro
 * (sous la plus petite mise), il reçoit 2 000 jetons. La condition sur le solde dans l'UPDATE
 * empêche une double recharge si deux rooms règlent en même temps. Retourne le nouveau solde, ou null.
 */
export async function rechargerForfait(db: D1Database, joueurId: string): Promise<number | null> {
  const saison = await saisonCourante(db);
  if (!saison) return null;
  const ligne = await db
    .prepare(
      `UPDATE joueurs SET solde = solde + ?1 WHERE id = ?2 AND solde < ?3 AND supprime_le IS NULL
       AND EXISTS (SELECT 1 FROM forfaits_saison WHERE joueur_id = ?2 AND saison_id = ?4) RETURNING solde`,
    )
    .bind(FORFAIT_MONTANT, joueurId, FORFAIT_SEUIL, saison.id)
    .first<{ solde: number }>();
  if (!ligne) return null;
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO transactions_jetons (joueur_id, montant, type, le) VALUES (?, ?, 'forfait', ?)").bind(joueurId, FORFAIT_MONTANT, now),
    db.prepare("UPDATE forfaits_saison SET recharges = recharges + 1 WHERE joueur_id = ? AND saison_id = ?").bind(joueurId, saison.id),
  ]);
  return ligne.solde;
}

/** Le joueur a-t-il le forfait pour la saison en cours ? */
export async function aForfait(db: D1Database, joueurId: string): Promise<boolean> {
  const saison = await saisonCourante(db);
  if (!saison) return false;
  return Boolean(await db.prepare("SELECT 1 FROM forfaits_saison WHERE joueur_id = ? AND saison_id = ?").bind(joueurId, saison.id).first());
}

export async function saisonCourante(db: D1Database): Promise<{ id: number; nom: string; debut: number; fin: number } | null> {
  const now = Date.now();
  return db
    .prepare("SELECT id, nom, debut, fin FROM saisons WHERE debut <= ?1 AND fin > ?1 ORDER BY id DESC LIMIT 1")
    .bind(now)
    .first();
}

/**
 * Enregistre le résultat d'une main (blackjack), d'un tour (roulette) ou d'un lancer (machine à sous)
 * dans les statistiques de saison. Les parties en room privée comptent comme les autres.
 */
export async function enregistrerResultat(db: D1Database, joueurId: string, jeu: Exclude<Jeu, "poker">, mise: number, rendu: number): Promise<void> {
  const saison = await saisonCourante(db);
  if (!saison) return;
  const net = rendu - mise;
  const [parties, gains] =
    jeu === "blackjack" ? ["mains_bj", "gains_bj"] : jeu === "roulette" ? ["tours_roulette", "gains_roulette"] : ["tours_machine", "gains_machine"];
  await db
    .prepare(
      `INSERT INTO stats_saison (joueur_id, saison_id, gains_nets, mains, ${parties}, ${gains})
       VALUES (?1, ?2, ?3, 1, 1, ?3)
       ON CONFLICT (joueur_id, saison_id) DO UPDATE SET
         gains_nets = gains_nets + excluded.gains_nets,
         mains = mains + 1,
         ${parties} = ${parties} + 1,
         ${gains} = ${gains} + excluded.${gains}`,
    )
    .bind(joueurId, saison.id, net)
    .run();
}

/**
 * Défis quotidiens : la récompense compte dans les gains de saison (classement général et ligues),
 * mais pas comme une partie jouée. Les jetons achetés, le bonus quotidien et le filet n'y comptent pas.
 */
export async function enregistrerDefi(db: D1Database, joueurId: string, recompense: number): Promise<void> {
  const saison = await saisonCourante(db);
  if (!saison) return;
  await db
    .prepare(
      `INSERT INTO stats_saison (joueur_id, saison_id, gains_nets) VALUES (?1, ?2, ?3)
       ON CONFLICT (joueur_id, saison_id) DO UPDATE SET gains_nets = gains_nets + excluded.gains_nets`,
    )
    .bind(joueurId, saison.id, recompense)
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
