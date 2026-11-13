-- Capital de départ porté à 20 000 jetons (Saison 1). Les comptes créés depuis le début de la Saison 1
-- avec l'ancien capital (10 000) reçoivent les 10 000 manquants, inscrits en ajustement.
UPDATE joueurs SET solde = solde + 10000
WHERE supprime_le IS NULL
  AND cree_le >= (SELECT debut FROM saisons WHERE nom = 'Saison 1')
  AND EXISTS (SELECT 1 FROM transactions_jetons t WHERE t.joueur_id = joueurs.id AND t.type = 'depart' AND t.montant = 10000);

INSERT INTO transactions_jetons (joueur_id, montant, type, le)
SELECT j.id, 10000, 'ajustement', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM joueurs j
WHERE j.supprime_le IS NULL
  AND j.cree_le >= (SELECT debut FROM saisons WHERE nom = 'Saison 1')
  AND EXISTS (SELECT 1 FROM transactions_jetons t WHERE t.joueur_id = j.id AND t.type = 'depart' AND t.montant = 10000);
