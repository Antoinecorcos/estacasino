-- Administration, suspension de comptes et suppression de compte (RGPD).

-- Rôle : 'joueur' ou 'admin'. Pour nommer un administrateur :
--   npx wrangler d1 execute estacasino --remote --command "UPDATE joueurs SET role = 'admin' WHERE pseudo = '<pseudo>'"
ALTER TABLE joueurs ADD COLUMN role TEXT NOT NULL DEFAULT 'joueur';
ALTER TABLE joueurs ADD COLUMN suspendu INTEGER NOT NULL DEFAULT 0;
ALTER TABLE joueurs ADD COLUMN suspendu_motif TEXT;
-- Compte supprimé à la demande du joueur : données personnelles effacées, achats conservés (obligation comptable).
ALTER TABLE joueurs ADD COLUMN supprime_le INTEGER;

-- Trace de chaque action d'administration.
CREATE TABLE journal_admin (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   TEXT NOT NULL REFERENCES joueurs(id),
  action     TEXT NOT NULL,
  joueur_id  TEXT,
  details    TEXT,
  le         INTEGER NOT NULL
);
CREATE INDEX idx_journal_admin ON journal_admin(le DESC);
