-- Défis quotidiens : 3 par joueur et par jour (date de Paris).
CREATE TABLE defis_jour (
  joueur_id    TEXT NOT NULL REFERENCES joueurs(id),
  jour         TEXT NOT NULL,
  defi         TEXT NOT NULL,
  type         TEXT NOT NULL,
  titre        TEXT NOT NULL,
  objectif     INTEGER NOT NULL,
  recompense   INTEGER NOT NULL,
  progression  INTEGER NOT NULL DEFAULT 0,
  reclame      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (joueur_id, jour, defi)
);
