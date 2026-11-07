# Estacasino : feuille de route vers la V1

*Point de départ : version 0.2 (blackjack et roulette en 3D, rooms, classement saison 0, boutique Stripe, thèmes de table).*

Légende : 🙋 = action de votre côté · 🤖 = je m'en occupe · ⚖️ = avocat / conformité

---

## Étape 1 : site en ligne, en privé (bloquant)

Objectif : une adresse qui fonctionne, testée de bout en bout, encore réservée à l'équipe.

| | Tâche |
|---|---|
| 🙋 | Vérifier que le build Cloudflare passe et me donner l'adresse du site (`….workers.dev` ou domaine) |
| 🙋 | Régler la branche de production dans Cloudflare. Recommandé : créer une branche `main` pour la production, et garder les autres branches en préversions |
| ✅ | `APP_URL` = `https://estacasino.com` dans `wrangler.jsonc` |
| 🙋 | Stripe en **mode test** : clé secrète `sk_test_…`, webhook vers `/api/stripe/webhook`, Stripe Tax activé |
| 🙋🤖 | Faire ensemble un achat test complet (carte de test Stripe) et vérifier la TVA sur le reçu |
| 🙋 | Retirer le code de secours de `brouillon.md` et en générer un nouveau depuis le profil |
| 🙋 | Brancher `estacasino.com` (et `www.estacasino.com`) sur le Worker : *Settings → Domains & Routes → Custom domain* |

## Étape 2 : solidité avant les premiers joueurs (bêta privée)

Objectif : pouvoir ouvrir à 10-30 amis sans risque de perdre des jetons, d'être spammé ou d'être aveugle en cas de problème.

| | Tâche |
|---|---|
| ✅ | **Remboursement automatique** des mises si une room redémarre en pleine main |
| ✅ | **Protection anti-robots** à l'inscription et à la réinitialisation (Turnstile) : code prêt, à activer avec les clés 🙋 |
| ✅ | Limites de débit : 10 requêtes/min sur la connexion, 150/min sur l'API (par adresse IP), 12 actions/s en room |
| ✅ | Filtre de pseudos (grossièretés, noms réservés « admin », « croupier »…) |
| ✅ | **Espace d'administration** `/admin` : résumé, recherche, fiche joueur, mot de passe provisoire, suspension, journal |
| ✅ | Suppression de compte par le joueur (RGPD) |
| ✅ | Vérifications automatiques à chaque push (GitHub Actions : types, tests, compilation) |
| 🙋 | Mesure d'audience sans cookie : tableau de bord Cloudflare → *Web Analytics* → *Add a site* → `estacasino.com` (activation automatique) |
| ✅ | Mode mobile de la roulette (roue, tapis, commandes collées en bas) |
| 🙋 | Me nommer… ou plutôt vous nommer administrateur (commande dans le `README.md`) |

## Étape 3 : conformité (en parallèle de l'étape 2)

| | Tâche |
|---|---|
| ⚖️ | Faire valider le modèle par un avocat en droit des jeux (jetons sans valeur, boutique de cosmétiques uniquement) |
| 🙋 | Vérifier auprès de Stripe que l'activité « jeu social sans argent, vente de cosmétiques » est acceptée (le « social casino » figure parfois dans les activités soumises à conditions) |
| 🤖⚖️ | Rédiger CGU, CGV, politique de confidentialité et mentions légales complètes. Il me faut : éditeur (nom ou société, adresse, SIRET), contact, hébergeur (Cloudflare) |
| 🤖 | Rappel du temps de jeu (optionnel, réglable par le joueur) et page « Jouer avec modération » |
| 🤖 | Adresse de contact et de support visible |

## Étape 4 : contenu de la V1

À prioriser ensemble ; ordre proposé :

1. **Fin de saison** : clôture automatique, récompenses honorifiques (titres, badges, cadres) et ouverture de la saison suivante.
2. **Défis quotidiens** (« Gagne 3 mains de blackjack ») pour donner une raison de revenir.
3. **Profil public et liste d'amis**, avec un classement entre amis.
4. **Réactions rapides en room** (emotes), plus simples à modérer qu'une discussion libre.
5. **Ligues** (Bronze à Légende).
6. **Musique d'ambiance** et sons affinés.
7. **Boutique enrichie** : sélection qui change chaque semaine, nouveaux thèmes et avatars.
8. **Petit tutoriel** des règles pour les débutants.
9. **Poker Texas Hold'em** : le plus gros chantier (enchères, pots, tournois). Prévu après la V1 ou en V1.1.

## Étape 5 : lancement public

| | Tâche |
|---|---|
| 🤖 | Page d'accueil soignée pour le partage (image d'aperçu, description, installable sur téléphone) |
| 🙋🤖 | Bêta privée, retours, ajustements |
| 🙋 | Stripe en **mode réel** (`sk_live_…`), nouveau webhook réel |
| 🙋 | Saison 0 close, saison 1 ouverte (6 semaines) |
| 🙋 | Annonce |

## Décisions encore ouvertes

- Prix des thèmes de table (2,99 € provisoire).
- Discussion libre en room, ou uniquement des réactions rapides ?
- Poker en V1 ou en V1.1 ?
- Date visée pour la bêta privée et pour le lancement.
