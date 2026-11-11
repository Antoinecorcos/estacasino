-- 1) Les récompenses des défis quotidiens comptent désormais dans les gains de saison.
--    Rattrapage pour la saison en cours : on ajoute les défis déjà récupérés.
INSERT INTO stats_saison (joueur_id, saison_id, gains_nets)
SELECT t.joueur_id, s.id, SUM(t.montant)
FROM transactions_jetons t JOIN saisons s ON t.le >= s.debut AND t.le < s.fin
WHERE t.type = 'defi'
  AND s.debut <= CAST(strftime('%s', 'now') AS INTEGER) * 1000
  AND s.fin > CAST(strftime('%s', 'now') AS INTEGER) * 1000
GROUP BY t.joueur_id, s.id
ON CONFLICT (joueur_id, saison_id) DO UPDATE SET gains_nets = gains_nets + excluded.gains_nets;

-- 2) Notifications (application installée sur le téléphone).
-- Réglages du serveur générés au premier besoin (clés VAPID des notifications).
CREATE TABLE config (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

-- Un abonnement par appareil (un joueur peut en avoir plusieurs).
CREATE TABLE abonnements_push (
  endpoint TEXT PRIMARY KEY,
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  cree_le INTEGER NOT NULL,
  echecs INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_abonnements_joueur ON abonnements_push (joueur_id);

-- Préférences et anti-doublons.
ALTER TABLE joueurs ADD COLUMN notif_bonus INTEGER NOT NULL DEFAULT 1;
ALTER TABLE joueurs ADD COLUMN notif_filet INTEGER NOT NULL DEFAULT 1;
ALTER TABLE joueurs ADD COLUMN bonus_notifie TEXT;       -- jour (Paris) du dernier rappel de bonus
ALTER TABLE joueurs ADD COLUMN filet_notifie INTEGER;    -- horodatage du dernier rappel de filet
