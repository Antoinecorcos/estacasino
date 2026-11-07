# Casino fictif multijeux : récapitulatif du projet

*Version du 6 novembre 2026, document de travail (brainstorming n° 1)*

---

## 1. Vision et concept

### Le pitch
Un casino en ligne **100 % fictif**, accessible depuis un navigateur sans installation, qui rassemble plusieurs jeux (poker, blackjack, roulette, machine à sous). On y joue avec des **jetons gratuits qui n'ont aucune valeur réelle**, on se mesure aux autres dans des **classements saisonniers**, et on invite ses amis à sa table **en leur envoyant un simple lien**.

### Positionnement
- **Ce que c'est** : un jeu social et compétitif dans l'ambiance d'un casino, où le style et la compétition sont le produit.
- **Ce que ce n'est pas** : un jeu d'argent. On ne mise jamais d'argent, on ne gagne jamais d'argent et on n'achète jamais de jetons.

### Public cible
- **Principal** : adultes de 18 à 35 ans qui aiment les soirées poker entre amis, les jeux compétitifs et la personnalisation.
- **Secondaire** : streamers et communautés en ligne qui veulent animer leur audience, groupes d'amis à distance, petites entreprises pour des événements internes.

### Différenciation
1. **Le lien d'invitation** : créer une table, envoyer le lien, et les amis jouent en 10 secondes, sans installation ni compte obligatoire pour une première partie.
2. **Un modèle sain** : aucune vente de jetons et aucun « payer pour gagner ». Les classements restent crédibles.
3. **Une direction artistique forte** : des thèmes de salle soignés qui font du style un argument de vente.

---

## 2. Cadre légal et lignes rouges

> ⚠️ Ce récapitulatif n'est pas un avis juridique. Faites valider le modèle par un avocat spécialisé en droit des jeux avant le lancement.

### Rappel du contexte
- En France, le casino en ligne avec de l'argent réel est interdit : aucune licence ANJ n'existe pour cette catégorie.
- Un casino à jetons fictifs se situe dans une zone grise. Il reste hors du jeu d'argent **tant que les jetons n'ont aucune valeur monétaire**.

### Lignes rouges absolues
| Interdit | Pourquoi |
|---|---|
| Vendre des jetons, directement ou indirectement | Le joueur engage de l'argent pour pouvoir miser |
| Donner plus de jetons aux abonnés premium (bonus doublé, multiplicateurs, recharges) | C'est une vente de jetons déguisée, et ça fausse les classements |
| Convertir des jetons en argent, cadeaux, lots ou bons d'achat | Donne une valeur réelle aux gains |
| Permettre l'échange ou le transfert de jetons entre joueurs | Crée un marché secondaire, donc une valeur réelle |
| Vendre des boosters ou coffres aléatoires payants | Assimilable aux loot boxes, de plus en plus encadrées en Europe |
| Intégrer de la crypto ou des NFT | Change totalement la nature juridique du projet |

### Obligations à prévoir
- **Accès réservé aux 18 ans et plus**, avec une vérification d'âge à l'inscription.
- **Mention claire et permanente** que les jetons sont fictifs et sans valeur.
- **CGU et CGV** rédigées spécifiquement, avec une clause interdisant la revente de comptes.
- **Conformité RGPD** : données personnelles, cookies, droit à l'effacement.
- **Prestataire de paiement** : vérifier les conditions de Stripe (ou de votre prestataire) pour une activité qui ressemble à un casino, même sans argent en jeu. Le fait que vous ne vendiez que des cosmétiques doit être clairement présenté.
- **Stores mobiles** (si une version app est prévue plus tard) : classement 17+ ou 18+ et respect des règles sur les jeux de hasard simulés.

### Prévention
Même sans argent en jeu, le projet doit éviter d'encourager des comportements compulsifs :
- pas de notifications agressives ;
- un rappel du temps de jeu optionnel ;
- un lien vers des ressources d'aide (Joueurs Info Service) dans les paramètres ;
- aucune publicité pour de vrais casinos ou sites de paris.

---

## 3. Catalogue de jeux

### Au lancement
| Jeu | Mode | Rôle dans le produit |
|---|---|---|
| **Poker Texas Hold'em** | Multijoueur (2 à 8 joueurs) | Cœur social, moteur des tables privées et des tournois |
| **Blackjack** | Solo contre le croupier, ou plusieurs joueurs à la même table | Rapide, accessible, avec un peu de stratégie |

### Ajouts prévus
| Jeu | Mode | Intérêt |
|---|---|---|
| **Roulette** | Table partagée, tirage commun | Très visuelle, idéale pour les animations et les cosmétiques |
| **Machine à sous** | Solo | Une seule machine, travaillée et stylée, aux couleurs de l'univers |
| **Baccara** | Table partagée | Simple et rapide |
| **Craps** | Table partagée | Ambiance et convivialité |
| **Jeux originaux** | À définir | Jeux exclusifs à votre univers, impossibles à trouver ailleurs |

### Principes communs
- **Toute la logique et le hasard sont calculés sur le serveur**, jamais sur le navigateur, pour empêcher la triche.
- Les règles et probabilités de chaque jeu sont **publiées et accessibles** aux joueurs.
- Les parties sont **courtes** : une main de blackjack dure moins d'une minute, et un tournoi de poker rapide se joue en moins de 30 minutes.

---

## 4. Économie des jetons

### Principe
Les jetons sont gratuits, renouvelés et sans valeur. Ils servent à jouer, pas à acheter. **On ne les obtient qu'en jouant ou en se connectant**, jamais en payant.

### Sources de jetons (montants indicatifs à équilibrer en test)
| Source | Montant proposé | Conditions |
|---|---|---|
| Capital de départ | 10 000 jetons | À l'inscription |
| Bonus quotidien | 2 000 jetons | Une fois par jour |
| Série de connexions | +200 par jour consécutif, plafonné à 3 000 | Remis à zéro après un jour manqué |
| Filet de sécurité | 2 000 jetons | Si le solde tombe sous 500, au maximum une fois toutes les 4 heures |
| Défis quotidiens | 500 à 1 500 jetons | Ex. : « Gagne 3 mains de blackjack » |
| Gains en jeu | Variable | Selon les résultats |

### Dépenses de jetons
- Les mises dans les jeux.
- Les droits d'entrée des tournois publics, payés **en jetons uniquement**.

### Saisons
- **Durée** : 4 à 6 semaines.
- **Remise à zéro** à chaque saison des compteurs de classement (gains nets, victoires). Le solde de jetons peut être conservé ou ramené à un capital standard : **ce choix reste à trancher**.
- Chaque saison peut avoir un **thème** (Vegas rétro, Monaco, cyberpunk…) avec ses cosmétiques et son ambiance.

### Limites anti-abus
- Plafond de mise par main selon la ligue.
- Détection des comptes multiples (même appareil, même IP, comportements identiques).
- Aucun transfert de jetons possible entre comptes, y compris au poker : surveiller les « dons » déguisés.

---

## 5. Classements, ligues et récompenses

### Les classements
| Classement | Critère | Pourquoi |
|---|---|---|
| **Global de saison** | Gains nets sur la saison | Récompense la performance, pas le temps passé |
| **Par jeu** | Indicateur propre à chaque jeu | Chaque joueur peut briller dans sa spécialité |
| **Entre amis** | Mêmes critères, limités à la liste d'amis | Souvent plus motivant que le global |
| **Tournois** | Points selon le classement final | Compétition ponctuelle et intense |

**Un minimum de parties jouées** (par exemple 50 mains dans la saison) est requis pour apparaître au classement.

### Les ligues
Bronze, Argent, Or, Platine, Diamant, puis « Légende » réservé au top 100.
- Montée et descente selon les points de ligue gagnés sur la saison.
- Chaque ligue débloque des tables à mises plus élevées et des cosmétiques de prestige.

### Récompenses de fin de saison
- **Exclusives et impossibles à acheter**.
- Titres, cadres de profil, tapis de table exclusifs, badges permanents.
- **Aucune récompense ayant une valeur réelle**.

---

## 6. Monétisation

| Source | Prix indicatif | Ce que le joueur obtient |
|---|---|---|
| Cosmétiques à l'unité | 1 à 5 € | Un élément de personnalisation |
| Packs thématiques | 5 à 15 € | Un ensemble cohérent (thème de salle complet) |
| Abonnement premium | 3 à 6 € par mois | Confort, social, prestige |
| Pass de saison | 5 à 10 € par saison | Cosmétiques débloqués en jouant |

- **Cosmétiques** : profil, table, salle, expression, habillages de jeux. Boutique rotative hebdomadaire. **Jamais de tirage aléatoire payant.**
- **Premium** (aucun effet sur les jetons ni les chances) : tables privées illimitées et règles personnalisées, tournois privés, statistiques avancées, accès anticipé, cosmétique mensuel exclusif, badge, pas de pub. Version gratuite : 1 table privée à la fois, 4 joueurs max.
- **Pass de saison** : piste gratuite + piste premium, progression en jouant, jamais en dépensant des jetons.
- **Publicité (optionnelle)** : discrète ou volontaire, jamais contre des jetons, jamais pour des jeux d'argent réels.

---

## 7. Fonctionnalités sociales

### Rooms privées par code (fonctionnalité phare)
1. Le joueur crée une room et choisit le jeu et les règles.
2. Il reçoit un **code de 5 lettres** (ex. `VXKTR`) à transmettre à ses amis.
3. Les amis saisissent le code depuis leur compte : **pas de mode invité, chacun doit avoir un compte**.

### Tournois
- **Publics** planifiés, entrée en jetons ; **privés** (premium) ; formats rapide, Sit & Go, élimination.

### Social
- Amis, invitations, statut en ligne ; discussion modérée ; emotes ; partage des exploits.
- Évolution : mode spectateur et tournois communautaires pour streamers.

---

## 8. Architecture technique et modèle de données

- **Navigateur** : application web responsive.
- **Serveur de jeu** : temps réel (WebSocket). **Toute la logique et tous les tirages se font sur le serveur.**
- **Générateur aléatoire** cryptographiquement sûr, à terme « provably fair ».
- **API** : comptes, boutique, classements, profils.
- **Base de données** + **cache en mémoire** (Redis).
- **Paiement** limité aux cosmétiques et abonnements.

### Tables principales
`joueurs`, `soldes_jetons`, `transactions_jetons` (journal complet), `saisons`, `stats_saison`, `parties`, `tables`, `tournois`, `cosmetiques`, `inventaire`, `achats`, `abonnements`, `amis`, `signalements`.

**Point important** : les achats en euros et les transactions de jetons ne doivent **jamais** être liés.

---

## 9. Périmètre MVP et feuille de route

- **MVP** : inscription (compte obligatoire, date de naissance), **blackjack + roulette**, poker affiché grisé « Bientôt disponible », bonus quotidien + filet, **rooms privées par code à 5 lettres**, classement de saison global, boutique de 10-15 cosmétiques, mentions légales.
- **1.1** : premium, ligues, défis, classements par jeu et amis, liste d'amis.
- **1.2** : poker Texas Hold'em, machine à sous, tournois publics, pass de saison, premier thème.
- **2** : tournois privés, stats avancées, spectateur/streamers, jeux originaux, app mobile.

---

## 10. Indicateurs, risques et prochaines étapes

**Indicateurs** : rétention J1/J7/J30, conversion des invités, tables privées par joueur, coefficient viral, durée de session, conversion payante, ARPPU, taux premium.

**Risques** : requalification en jeu d'argent, refus du prestataire de paiement, image négative, manque de joueurs, triche/collusion, monétisation faible, modération.

**Décisions ouvertes** : nom et DA, solde conservé ou remis à zéro, publicité, monnaie de boutique vs euros, prix définitifs.

**Prochaines étapes** : avocat → prestataire de paiement → nom et DA → modèle de données et serveur blackjack → MVP testé entre amis → analyse et ajustements.

---

## 11. Décisions prises (tour de questions n° 1)

| Sujet | Décision |
|---|---|
| Nom | **Estacasino** |
| Ambiance | **Club privé moderne** : fond presque noir, feutre profond, une seule couleur d'accent |
| Rendu | 2D, mais dynamique (animations soignées) |
| Personnages | **Avatars illustrés**, déclinables en cosmétiques (potentiel de vente) |
| Ton | Sérieux, avec une petite touche décalée (le croupier fait des remarques, en italique) |
| Son | Plus tard (hors MVP) |
| Soldes | Solde total conservé d'une saison à l'autre ; classement sur les gains de la saison. **Les deux chiffres sont toujours affichés séparément et clairement libellés** (« Solde total » / « Gains de la saison ») |
| Jeux du MVP | **Blackjack + roulette** ; poker affiché en grisé « Bientôt disponible » |
| Rejoindre des amis | **Rooms avec code à 5 lettres**, compte obligatoire pour tous (pas de mode invité) |
| Vérification d'âge | Date de naissance déclarée à la création du compte |
| Langue | Français uniquement |
| Équipe | Le porteur du projet et Benjamin |
| Paiement | **Stripe**, prix toujours affichés **TTC (TVA incluse)** |

Planche d'ambiance v1 (palette, typographies, composants, lobby, table desktop et mobile) : voir l'artefact de design associé.

---

## 12. Décisions prises (tour de questions n° 2)

| Sujet | Décision |
|---|---|
| Blackjack | 6 jeux, croupier reste à 17, blackjack payé 3 pour 2, doubler sur 2 cartes, séparer une fois, pas d'assurance |
| Roulette | Européenne (un seul zéro), la roue tourne automatiquement |
| Taille des rooms | 5 joueurs au blackjack, 8 à la roulette |
| Droits de l'hôte | Fixe la mise minimum et maximum. Ne peut ni exclure ni verrouiller : la diffusion du code est sa responsabilité |
| Room vide | Fermée après 15 minutes |
| Jeu en solo | Obligatoire : un joueur seul doit pouvoir jouer au blackjack et à la roulette sans room |
| Classement | Les parties en room privée comptent (jeux contre la maison, pas de collusion possible) |
| Connexion | ~~E-mail + lien magique~~ → remplacé au tour n° 3 par pseudo + mot de passe |
| Boutique | **Dès le MVP**, basique : avatars uniquement. Prix à valider ensemble |
| Prix | Toujours affichés **TTC** ; Stripe Tax calcule la TVA incluse dans le prix |
| Hébergement | Le code est poussé sur GitHub, déployé sur **Cloudflare** avec une base de données Cloudflare. Nom de domaine à venir |

Architecture technique détaillée : voir `docs/architecture.md`.

---

## 13. Décisions prises (tour de questions n° 3) et MVP v0.1

| Sujet | Décision |
|---|---|
| Connexion | **Pseudo unique + mot de passe**, sans e-mail. Mot de passe oublié : code de secours donné à l'inscription, et script de réinitialisation pour l'équipe |
| Prix | Accessoire **1,99 €**, avatar premium **2,99 €**, collection de 4 avatars **8,99 €** (TTC) |
| Avatars | SVG modulaire construit en code : 3 avatars gratuits au choix à l'inscription, pièces gratuites et pièces premium |
| Couleurs | Feutre vert bouteille et accent laiton. Des thèmes achetables pourront les changer plus tard |
| Grande Roue | Un tirage toutes les 30 secondes, **seulement s'il y a quelqu'un** |

**Version 0.1 livrée** : inscription, connexion, mot de passe oublié, lobby, blackjack solo et en room, roulette « La Grande Roue » et en room, rooms par code, bonus quotidien et filet de sécurité, classement de saison (général, blackjack, roulette), boutique Stripe d'avatars, éditeur d'avatar, page des règles et mentions. Voir le `README.md` pour la mise en ligne.

---

## 14. Décisions prises (tour n° 4) et version 0.2

| Sujet | Décision |
|---|---|
| Priorité | **Thèmes de table** achetables : Minuit, Velours, Riviera, Onyx (Club reste offert). Prix provisoire **2,99 €**, à valider |
| Thème en room | Tous les joueurs d'une room voient le thème de l'hôte |
| Saison | **Saison 0** (lancement), sans date de fin fixée ; la saison 1 (6 semaines) ouvrira ensuite |
| Classement | Classé dès **5 parties** jouées dans la saison |
| Gameplay | Refonte inspirée de l'exemple fourni : tables et roue en 3D, animations, sons |

**Version 0.2** :
- Blackjack : table 3D (feutre, bois, sabot), cartes distribuées une à une depuis le sabot, carte du croupier qui se retourne, piles de jetons, jetons ½ / ×2 / mise précédente, raccourcis clavier (T, R, D, S, Espace).
- Roulette : roue 3D avec bille qui ralentit et rebondit avant de tomber dans la case tirée par le serveur ; **roulette solo** où l'on lance soi-même la bille ; Annuler / Effacer / Rejouer / ×2 ; tendance rouge / noir / zéro.
- Effets : jetons qui volent vers le solde, solde qui défile, pluie de pièces et bannière sur les gros gains, sons synthétisés (coupables depuis l'en-tête).
- Rendu 2D de secours automatique si l'appareil ne gère pas la 3D.
