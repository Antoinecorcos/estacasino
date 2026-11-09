import { defisDuJour, type DefiDuJour, type TypeDefi } from "../shared/defis";
import { jourParis } from "./economie";

/** Crée (une seule fois par jour) les 3 défis du joueur. */
export async function assurerDefis(db: D1Database, joueurId: string, jour = jourParis()): Promise<void> {
  await db.batch(
    defisDuJour(joueurId, jour).map((d) =>
      db
        .prepare("INSERT OR IGNORE INTO defis_jour (joueur_id, jour, defi, type, titre, objectif, recompense) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(joueurId, jour, d.id, d.type, d.titre, d.objectif, d.recompense),
    ),
  );
}

export async function lireDefis(db: D1Database, joueurId: string, jour = jourParis()): Promise<DefiDuJour[]> {
  await assurerDefis(db, joueurId, jour);
  const r = await db
    .prepare("SELECT defi, titre, objectif, progression, recompense, reclame FROM defis_jour WHERE joueur_id = ? AND jour = ? ORDER BY rowid")
    .bind(joueurId, jour)
    .all<Omit<DefiDuJour, "reclame"> & { reclame: number }>();
  return r.results.map((d) => ({ ...d, reclame: !!d.reclame }));
}

/**
 * Fait progresser les défis du jour d'un joueur après une main ou un tour.
 * Retourne les défis qui viennent d'être réussis (pour prévenir le joueur).
 */
export async function progresserDefis(
  db: D1Database,
  joueurId: string,
  evenements: Partial<Record<TypeDefi, number>>,
): Promise<{ titre: string; recompense: number }[]> {
  const types = Object.entries(evenements).filter(([, n]) => (n ?? 0) > 0) as [TypeDefi, number][];
  if (!types.length) return [];
  const jour = jourParis();
  await assurerDefis(db, joueurId, jour);
  const resultats = await db.batch(
    types.map(([type, n]) =>
      db
        .prepare(
          `UPDATE defis_jour SET progression = MIN(objectif, progression + ?)
           WHERE joueur_id = ? AND jour = ? AND type = ? AND progression < objectif
           RETURNING titre, progression, objectif, recompense`,
        )
        .bind(n, joueurId, jour, type),
    ),
  );
  return resultats
    .flatMap((r) => r.results as { titre: string; progression: number; objectif: number; recompense: number }[])
    .filter((d) => d.progression >= d.objectif)
    .map(({ titre, recompense }) => ({ titre, recompense }));
}
