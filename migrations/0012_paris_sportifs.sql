-- Paris sportifs (option « fantôme » : invisible tant qu'elle n'est pas activée dans l'Admin).
-- Les rencontres et leurs cotes sont saisies par l'équipe ; les joueurs parient 1 / N / 2 jusqu'au
-- coup d'envoi avec des jetons fictifs ; l'équipe saisit le résultat et les gagnants sont payés.
-- Interrupteur : table config, clé « paris_sportifs » = off | admins | tous (absente = off).

CREATE TABLE rencontres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sport TEXT NOT NULL,
  competition TEXT NOT NULL DEFAULT '',
  equipe1 TEXT NOT NULL,
  equipe2 TEXT NOT NULL,
  debut INTEGER NOT NULL,                 -- coup d'envoi : les paris ferment à cette heure
  cote1 REAL NOT NULL,
  coteN REAL,                             -- NULL : pas de match nul possible
  cote2 REAL NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'ouverte', 'reglee', 'annulee')),
  resultat TEXT CHECK (resultat IN ('1', 'N', '2')),
  cree_le INTEGER NOT NULL,
  regle_le INTEGER
);
CREATE INDEX idx_rencontres_debut ON rencontres (statut, debut);

CREATE TABLE paris (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rencontre_id INTEGER NOT NULL REFERENCES rencontres(id),
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  choix TEXT NOT NULL CHECK (choix IN ('1', 'N', '2')),
  mise INTEGER NOT NULL,
  cote REAL NOT NULL,                     -- cote figée au moment du pari
  statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'gagne', 'perdu', 'rembourse')),
  gain INTEGER NOT NULL DEFAULT 0,
  le INTEGER NOT NULL,
  regle_le INTEGER
);
CREATE INDEX idx_paris_rencontre ON paris (rencontre_id, statut);
CREATE INDEX idx_paris_joueur ON paris (joueur_id, le DESC);

-- Statistiques de saison à part (comme le poker) : n'entrent pas dans le classement général.
ALTER TABLE stats_saison ADD COLUMN paris_joues INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_saison ADD COLUMN gains_paris INTEGER NOT NULL DEFAULT 0;
