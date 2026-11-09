-- Poker : statistiques à part (classement poker), rooms de poker, tables publiques.
ALTER TABLE stats_saison ADD COLUMN mains_poker INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_saison ADD COLUMN gains_poker INTEGER NOT NULL DEFAULT 0;

-- Rooms privées de poker : variante ('cash' ou 'sng') et niveau (blindes ou entrée).
ALTER TABLE rooms ADD COLUMN variante TEXT;
ALTER TABLE rooms ADD COLUMN niveau TEXT;

-- Registre des tables publiques (mis à jour par les tables elles-mêmes).
CREATE TABLE poker_tables (
  nom      TEXT PRIMARY KEY,
  mode     TEXT NOT NULL,            -- cash, sng
  niveau   TEXT NOT NULL,            -- n1…n4 (blindes) ou s1…s3 (entrée)
  joueurs  INTEGER NOT NULL DEFAULT 0,
  statut   TEXT NOT NULL DEFAULT 'ouverte', -- ouverte, inscription, en_cours, termine
  maj      INTEGER NOT NULL
);
CREATE INDEX idx_poker_tables ON poker_tables(mode, niveau, statut);
