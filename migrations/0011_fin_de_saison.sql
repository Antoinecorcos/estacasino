-- Fin de saison : récompenses des champions et palmarès (badges affichés la saison suivante).

-- Récompenses prévues pour la fin d'une saison (JSON : {"general": 25000, "parJeu": 10000}) et date de distribution.
ALTER TABLE saisons ADD COLUMN recompenses TEXT;
ALTER TABLE saisons ADD COLUMN recompenses_le INTEGER;

-- Palmarès : un champion par saison et par classement (général, blackjack, roulette, poker, machine).
CREATE TABLE palmares (
  saison_id INTEGER NOT NULL REFERENCES saisons(id),
  titre TEXT NOT NULL CHECK (titre IN ('general', 'blackjack', 'roulette', 'poker', 'machine')),
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  jetons INTEGER NOT NULL DEFAULT 0,   -- jetons versés (0 si déjà récompensé au général)
  le INTEGER NOT NULL,
  PRIMARY KEY (saison_id, titre)
);
CREATE INDEX idx_palmares_joueur ON palmares (joueur_id);

-- Programmation de la fin de la Saison 1 : lundi 30 novembre 2026 à 23 h 59 (heure de Paris).
-- 25 000 jetons au champion du classement général, 10 000 au premier de chaque jeu s'il est différent.
-- La Saison 2 commence à la même minute : aucun trou entre les deux saisons.
UPDATE saisons SET fin = 1796079540000, recompenses = '{"general":25000,"parJeu":10000}'
WHERE nom = 'Saison 1' AND recompenses_le IS NULL AND fin > 1796079540000;

INSERT INTO saisons (id, nom, debut, fin)
SELECT (SELECT MAX(id) FROM saisons) + 1, 'Saison 2', 1796079540000, 1830294000000
WHERE EXISTS (SELECT 1 FROM saisons WHERE nom = 'Saison 1' AND fin = 1796079540000)
  AND NOT EXISTS (SELECT 1 FROM saisons WHERE nom = 'Saison 2');
