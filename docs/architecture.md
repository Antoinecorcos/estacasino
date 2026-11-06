# Estacasino : architecture technique (proposition v1)

## Vue d'ensemble : tout sur Cloudflare

```
Navigateur (React + Vite, servi en statique par le Worker)
   │  HTTPS (API)            │  WebSocket (temps réel)
   ▼                         ▼
Worker « estacasino » (Hono) ───► Durable Objects
   │                               ├─ RoomBlackjack   : une instance par room privée ou table solo
   │                               ├─ RoomRoulette    : une instance par room privée
   │                               └─ RouletteGrandeRoue : table publique permanente, tirage auto
   ├─► D1 (SQLite) : comptes, sessions, soldes, journal des jetons, saisons, boutique
   ├─► Stripe : Checkout + webhook (cosmétiques uniquement)
   └─► Resend : envoi des e-mails de lien magique
```

- **Un seul Worker** sert l'application, l'API et les WebSockets. Déploiement automatique depuis GitHub (Workers Builds).
- **Durable Objects** : chaque room est un objet unique qui détient l'état de la partie et les connexions WebSocket. Tout le hasard et toute la logique s'y exécutent (`crypto.getRandomValues`), jamais dans le navigateur. Les Durable Objects adossés à SQLite sont disponibles sur l'offre gratuite de Workers.
- **D1** : la base de données durable. Chaque mouvement de jetons est écrit dans `transactions_jetons`.

## Jouer seul
- **Blackjack** : bouton « Jouer seul » qui ouvre instantanément une table privée contre le croupier (une room sans code).
- **Roulette** : une **table publique permanente, « La Grande Roue »**, ouverte à tous, avec un tirage automatique toutes les 30 secondes. Un joueur seul y joue, et plusieurs joueurs inconnus peuvent s'y croiser.

## Rooms privées
- Code de 5 lettres sans caractères ambigus (pas de I, O). 24⁵ ≈ 8 millions de combinaisons.
- L'hôte fixe la mise minimum et maximum. Pas d'exclusion ni de verrouillage.
- Fermeture automatique après 15 minutes sans joueur (alarme du Durable Object).

## Connexion par lien magique
1. Le joueur saisit son e-mail.
2. Le Worker génère un jeton aléatoire, en stocke l'empreinte (SHA-256) dans D1 avec une expiration de 15 minutes, et envoie le lien par e-mail via Resend.
3. Le clic sur le lien ouvre une session (cookie `HttpOnly`, `Secure`, `SameSite=Lax`) stockée dans D1, valable 30 jours.
4. À la première connexion : choix du **pseudo unique** (insensible à la casse) et saisie de la **date de naissance** (refus si moins de 18 ans).

**Envoi des e-mails** : un service d'e-mails transactionnels est nécessaire. Je recommande **Resend** (gratuit jusqu'à 3 000 e-mails par mois, API simple). Il faut :
1. créer un compte Resend ;
2. une fois le domaine acheté, l'ajouter dans Resend et copier les enregistrements DNS proposés dans Cloudflare (SPF, DKIM) ;
3. créer une clé API et l'enregistrer comme secret `RESEND_API_KEY`.

Avant l'achat du domaine, Resend permet d'envoyer des e-mails de test uniquement à l'adresse du compte, ce qui suffit pour développer.

## Boutique et Stripe
- **Stripe Checkout** (paiement unique) avec `automatic_tax` activé.
- Les prix Stripe sont créés avec **`tax_behavior: inclusive`** : le prix affiché est le prix payé, TVA comprise, et Stripe Tax calcule la part de TVA selon le pays de l'acheteur.
- Le webhook `checkout.session.completed` (signature vérifiée) ajoute l'avatar à l'`inventaire`.
- **Aucun chemin de code entre un paiement et les jetons.** Les tables `achats` et `transactions_jetons` ne sont jamais liées.

## Variables et secrets à configurer dans Cloudflare

| Nom | Type | Rôle |
|---|---|---|
| `DB` | Binding D1 | Base de données `estacasino` |
| `ROOMS_BLACKJACK`, `ROOMS_ROULETTE` | Bindings Durable Objects | Rooms en temps réel |
| `APP_URL` | Variable | URL publique (sert aux liens magiques et aux retours Stripe) |
| `EMAIL_FROM` | Variable | Expéditeur, ex. `Estacasino <bonsoir@domaine.fr>` |
| `STRIPE_SECRET_KEY` | **Secret** | Clé secrète Stripe (`sk_test_…` puis `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | **Secret** | Secret de signature du webhook (`whsec_…`) |
| `RESEND_API_KEY` | **Secret** | Clé API Resend |
| `SESSION_SECRET` | **Secret** | Chaîne aléatoire longue pour signer les cookies |

Les secrets ne sont jamais écrits dans le dépôt : ils se saisissent dans le tableau de bord Cloudflare (Worker → Settings → Variables and Secrets) ou avec `wrangler secret put`.

## Prix des avatars (proposition, TTC)

Calcul pour un acheteur en France (TVA 20 %) et une carte européenne standard (frais Stripe ≈ 1,5 % + 0,25 €, plus environ 0,5 % pour Stripe Tax).

| Produit | Prix TTC | Dont TVA | HT | Frais Stripe | Net estimé |
|---|---|---|---|---|---|
| ~~Accessoire à 0,99 €~~ | 0,99 € | 0,17 € | 0,83 € | ≈ 0,27 € | ≈ 0,56 € |
| Accessoire (chapeau, lunettes…) | 1,99 € | 0,33 € | 1,66 € | ≈ 0,29 € | ≈ 1,37 € |
| Avatar complet | 3,99 € | 0,67 € | 3,33 € | ≈ 0,33 € | ≈ 3,00 € |
| Pack de 4 avatars | 9,99 € | 1,67 € | 8,33 € | ≈ 0,45 € | ≈ 7,88 € |

Sous 1,99 €, les frais fixes de Stripe absorbent une trop grosse part du prix. Pour un acheteur d'un autre pays de l'UE, le prix TTC reste identique et seule la part de TVA change.
