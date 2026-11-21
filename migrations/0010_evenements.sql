-- Événements paramétrables (pilotés depuis l'espace Admin). Rien n'est visible des joueurs
-- tant qu'un événement n'est pas passé en visibilité « tous ».

CREATE TABLE evenements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('boost', 'objectif', 'classement', 'calendrier')),
  titre TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  debut INTEGER NOT NULL,
  fin INTEGER NOT NULL,
  -- brouillon : invisible ; admins : test, visible et actif pour les admins seulement ; tous : en ligne.
  visibilite TEXT NOT NULL DEFAULT 'brouillon' CHECK (visibilite IN ('brouillon', 'admins', 'tous')),
  notifier INTEGER NOT NULL DEFAULT 0,       -- notification au démarrage (abonnés)
  params TEXT NOT NULL,                      -- réglages propres au type (JSON)
  cloture INTEGER NOT NULL DEFAULT 0,        -- classement : récompenses distribuées
  cree_le INTEGER NOT NULL
);

-- Participation : progression d'un joueur (objectif, classement) et récompense reçue.
CREATE TABLE evenements_joueurs (
  evenement_id INTEGER NOT NULL REFERENCES evenements(id),
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  valeur INTEGER NOT NULL DEFAULT 0,
  parties INTEGER NOT NULL DEFAULT 0,
  recompense INTEGER,
  recompense_le INTEGER,
  PRIMARY KEY (evenement_id, joueur_id)
);
CREATE INDEX idx_evenements_classement ON evenements_joueurs (evenement_id, valeur DESC);

-- Calendrier : cadeaux récupérés, un par jour.
CREATE TABLE evenements_cadeaux (
  evenement_id INTEGER NOT NULL REFERENCES evenements(id),
  joueur_id TEXT NOT NULL REFERENCES joueurs(id),
  jour INTEGER NOT NULL,
  le INTEGER NOT NULL,
  PRIMARY KEY (evenement_id, joueur_id, jour)
);

-- Notifications de démarrage déjà envoyées (une par joueur et par événement).
CREATE TABLE evenements_notifs (
  evenement_id INTEGER NOT NULL,
  joueur_id TEXT NOT NULL,
  PRIMARY KEY (evenement_id, joueur_id)
);
