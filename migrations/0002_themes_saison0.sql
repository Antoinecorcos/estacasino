-- Thèmes de table (feutre + accent) et passage en « Saison 0 ».

ALTER TABLE joueurs ADD COLUMN theme TEXT NOT NULL DEFAULT 'club';
-- Thème de l'hôte au moment de la création : tous les joueurs de la room le voient.
ALTER TABLE rooms ADD COLUMN theme TEXT NOT NULL DEFAULT 'club';

-- La première saison devient la Saison 0, sans date de fin fixée pour l'instant
-- (fin provisoire au 31/12/2027 ; elle sera close à l'ouverture de la Saison 1).
UPDATE saisons SET nom = 'Saison 0', fin = 1830294000000 WHERE id = 1;
