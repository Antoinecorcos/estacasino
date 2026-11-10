-- Vente de jetons (packs et forfait saison) et limitation des comptes multiples.

-- Un achat de jetons n'est crédité qu'une seule fois, même si Stripe renvoie le webhook.
ALTER TABLE achats ADD COLUMN jetons_credites INTEGER NOT NULL DEFAULT 0;

-- Forfait saison : recharge automatique quand le solde tombe à zéro, pendant toute la saison achetée.
CREATE TABLE forfaits_saison (
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  saison_id INTEGER NOT NULL,
  stripe_session TEXT NOT NULL,
  recharges INTEGER NOT NULL DEFAULT 0,
  le INTEGER NOT NULL,
  PRIMARY KEY (joueur_id, saison_id)
);

-- Empreintes (appareil, IP), stockées hachées, pour repérer les comptes créés en série.
CREATE TABLE empreintes (
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  type TEXT NOT NULL CHECK (type IN ('appareil', 'ip')),
  valeur TEXT NOT NULL,
  premier_le INTEGER NOT NULL,
  dernier_le INTEGER NOT NULL,
  inscription INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (joueur_id, type, valeur)
);
CREATE INDEX idx_empreintes_valeur ON empreintes (type, valeur);
