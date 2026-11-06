-- Estacasino : schéma initial (D1 / SQLite)

CREATE TABLE joueurs (
  id              TEXT PRIMARY KEY,
  pseudo          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  mdp_hash        TEXT NOT NULL,
  secours_hash    TEXT NOT NULL,             -- code de secours (mot de passe oublié)
  date_naissance  TEXT NOT NULL,             -- AAAA-MM-JJ, 18 ans minimum
  solde           INTEGER NOT NULL DEFAULT 10000 CHECK (solde >= 0),
  avatar          TEXT NOT NULL,             -- configuration JSON de l'avatar
  bonus_dernier   TEXT,                      -- date (AAAA-MM-JJ, Europe/Paris) du dernier bonus quotidien
  bonus_serie     INTEGER NOT NULL DEFAULT 0,
  filet_dernier   INTEGER,                   -- horodatage ms du dernier filet de sécurité
  cree_le         INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  joueur_id   TEXT NOT NULL REFERENCES joueurs(id) ON DELETE CASCADE,
  expire_le   INTEGER NOT NULL
);
CREATE INDEX idx_sessions_joueur ON sessions(joueur_id);

CREATE TABLE tentatives_connexion (
  pseudo  TEXT NOT NULL COLLATE NOCASE,
  le      INTEGER NOT NULL
);
CREATE INDEX idx_tentatives ON tentatives_connexion(pseudo, le);

-- Journal complet de chaque mouvement de jetons (audit et anti-triche).
-- N'a AUCUN lien avec la table `achats` : un paiement ne crédite jamais de jetons.
CREATE TABLE transactions_jetons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  joueur_id   TEXT NOT NULL REFERENCES joueurs(id),
  montant     INTEGER NOT NULL,              -- positif = crédit, négatif = débit
  type        TEXT NOT NULL,                 -- depart, bonus, filet, mise, gain
  jeu         TEXT,                          -- blackjack, roulette
  room        TEXT,
  le          INTEGER NOT NULL
);
CREATE INDEX idx_tx_joueur ON transactions_jetons(joueur_id, le);

CREATE TABLE saisons (
  id      INTEGER PRIMARY KEY,
  nom     TEXT NOT NULL,
  debut   INTEGER NOT NULL,
  fin     INTEGER NOT NULL
);

CREATE TABLE stats_saison (
  joueur_id     TEXT NOT NULL REFERENCES joueurs(id),
  saison_id     INTEGER NOT NULL REFERENCES saisons(id),
  gains_nets    INTEGER NOT NULL DEFAULT 0,
  mains         INTEGER NOT NULL DEFAULT 0,
  mains_bj      INTEGER NOT NULL DEFAULT 0,
  gains_bj      INTEGER NOT NULL DEFAULT 0,
  tours_roulette INTEGER NOT NULL DEFAULT 0,
  gains_roulette INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (joueur_id, saison_id)
);
CREATE INDEX idx_stats_classement ON stats_saison(saison_id, gains_nets DESC);

CREATE TABLE rooms (
  code        TEXT PRIMARY KEY,
  jeu         TEXT NOT NULL,                 -- blackjack, roulette
  hote_id     TEXT NOT NULL REFERENCES joueurs(id),
  mise_min    INTEGER NOT NULL,
  mise_max    INTEGER NOT NULL,
  ouverte     INTEGER NOT NULL DEFAULT 1,
  cree_le     INTEGER NOT NULL
);

-- Boutique : uniquement des cosmétiques, payés en euros via Stripe.
CREATE TABLE achats (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  joueur_id          TEXT NOT NULL REFERENCES joueurs(id),
  produit            TEXT NOT NULL,
  montant_centimes   INTEGER NOT NULL,       -- TTC
  stripe_session     TEXT NOT NULL UNIQUE,
  le                 INTEGER NOT NULL
);

CREATE TABLE inventaire (
  joueur_id   TEXT NOT NULL REFERENCES joueurs(id),
  piece       TEXT NOT NULL,                 -- identifiant d'une pièce d'avatar
  origine     TEXT NOT NULL,                 -- achat, offert, recompense
  le          INTEGER NOT NULL,
  PRIMARY KEY (joueur_id, piece)
);

-- Saison 1 : 6 semaines à partir du 1er novembre 2026 (heure de Paris).
INSERT INTO saisons (id, nom, debut, fin) VALUES
  (1, 'Nuit d''ouverture', 1793487600000, 1797116400000);
