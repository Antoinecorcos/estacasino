-- Machine à sous « Les Années folles » : statistiques de saison à part (onglet du classement).
-- Les gains de la machine comptent aussi dans le classement général, comme le blackjack et la roulette.
ALTER TABLE stats_saison ADD COLUMN tours_machine INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_saison ADD COLUMN gains_machine INTEGER NOT NULL DEFAULT 0;
