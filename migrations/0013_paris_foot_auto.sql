-- Paris foot automatiques : rencontres importées d'API-Football, choisies par la sélection quotidienne.
ALTER TABLE rencontres ADD COLUMN source TEXT NOT NULL DEFAULT 'manuel';   -- manuel | api
ALTER TABLE rencontres ADD COLUMN fixture_id INTEGER;                      -- identifiant API-Football
ALTER TABLE rencontres ADD COLUMN ligue_id INTEGER;
ALTER TABLE rencontres ADD COLUMN selection INTEGER NOT NULL DEFAULT 1;    -- 1 : retenue ; 0 : remplaçante proposée à l'admin
ALTER TABLE rencontres ADD COLUMN interet INTEGER;
ALTER TABLE rencontres ADD COLUMN ouverture_auto INTEGER;                  -- les paris s'ouvrent seuls à cette heure (sauf retrait)
ALTER TABLE rencontres ADD COLUMN cotes_marche TEXT;                       -- probabilités du marché (JSON)
ALTER TABLE rencontres ADD COLUMN cotes_maj INTEGER;
CREATE UNIQUE INDEX idx_rencontres_fixture ON rencontres (fixture_id) WHERE fixture_id IS NOT NULL;

-- Palmarès : un titre de champion des paris en plus (la table est recréée pour élargir sa contrainte).
CREATE TABLE palmares_nouveau (
  saison_id INTEGER NOT NULL REFERENCES saisons(id),
  titre TEXT NOT NULL CHECK (titre IN ('general', 'blackjack', 'roulette', 'poker', 'machine', 'paris')),
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  jetons INTEGER NOT NULL DEFAULT 0,
  le INTEGER NOT NULL,
  PRIMARY KEY (saison_id, titre)
);
INSERT INTO palmares_nouveau (saison_id, titre, joueur_id, jetons, le) SELECT saison_id, titre, joueur_id, jetons, le FROM palmares;
DROP TABLE palmares;
ALTER TABLE palmares_nouveau RENAME TO palmares;
CREATE INDEX idx_palmares_joueur ON palmares (joueur_id);
