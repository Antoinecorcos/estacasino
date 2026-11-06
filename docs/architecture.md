# Estacasino : architecture technique

## Vue d'ensemble : tout sur Cloudflare

```
Navigateur (React + Vite, servi en statique par le Worker)
   │  HTTPS (API /api/*)       │  WebSocket (temps réel)
   ▼                           ▼
Worker « estacasino » (Hono) ───► Durable Objects
   │                               ├─ BlackjackRoom : une instance par room privée et par table solo
   │                               └─ RouletteRoom  : une instance par room privée + « La Grande Roue »
   ├─► D1 (SQLite) : comptes, sessions, soldes, journal des jetons, saisons, rooms, boutique
   └─► Stripe : Checkout + webhook (cosmétiques uniquement)
```

- **Un seul Worker** sert le site, l'API et les WebSockets. Déploiement automatique depuis GitHub.
- **Durable Objects** : chaque room détient l'état de la partie et les connexions. Tout le hasard et toute la logique s'y exécutent (`crypto.getRandomValues`, sans biais de modulo). Les actions d'une room passent par une file : jamais deux à la fois.
- **D1** : chaque mouvement de jetons est écrit dans `transactions_jetons` (départ, bonus, filet, mise, gain, remboursement).

## Jouer seul
- **Blackjack** : « Jouer seul » ouvre une table privée face au croupier (une instance par joueur).
- **Roulette** : « La Grande Roue », table publique permanente. Cycle de 30 s (20 s de mises, 6 s de tirage, 4 s de résultats), **seulement quand quelqu'un est présent**.

## Rooms privées
- Code de 5 lettres sans I ni O (24⁵ ≈ 8 millions de combinaisons). Un code n'est réattribué qu'après fermeture de la room et 24 h d'attente.
- L'hôte choisit la mise minimum et maximum. Pas d'exclusion ni de verrouillage : quiconque a le code peut entrer.
- 5 places au blackjack, 8 à la roulette ; au-delà, on regarde la partie.
- Fermeture automatique après 15 minutes sans connexion (alarme du Durable Object).

## Comptes : pseudo + mot de passe
- Pseudo unique (insensible à la casse), mot de passe de 8 caractères minimum, date de naissance (refus sous 18 ans).
- Mots de passe hachés en PBKDF2-SHA256, 100 000 itérations, sel aléatoire.
- Sessions : jeton aléatoire dans un cookie `HttpOnly`, `Secure`, `SameSite=Lax`, valable 30 jours ; seule son empreinte SHA-256 est en base.
- Limite de 10 essais ratés par pseudo et par quart d'heure.
- **Mot de passe oublié**, sans e-mail :
  1. un **code de secours** (16 caractères) est affiché une seule fois à l'inscription ; il permet de choisir un nouveau mot de passe, puis un nouveau code est donné ;
  2. le joueur peut régénérer son code depuis son profil ;
  3. en dernier recours, l'équipe lance `npm run reset-password -- <pseudo>`, qui écrit un mot de passe provisoire dans D1.

## Boutique et Stripe
- **Stripe Checkout** (paiement unique), `automatic_tax` activé, prix envoyés avec **`tax_behavior: inclusive`** : le prix affiché est le prix payé, TVA comprise.
- Catalogue dans `src/shared/boutique.ts` (pas de produits à créer dans Stripe).
- Avant le paiement, le joueur confirme la livraison immédiate du contenu numérique (renonciation au droit de rétractation).
- Le webhook (signature HMAC vérifiée, tolérance 5 minutes, idempotent) ajoute les pièces d'avatar à l'`inventaire`.
- **Aucun chemin de code entre un paiement et les jetons.**

## Variables et secrets

| Nom | Type | Rôle |
|---|---|---|
| `DB` | Binding D1 | Base de données `estacasino` |
| `ROOMS_BLACKJACK`, `ROOMS_ROULETTE` | Bindings Durable Objects | Rooms en temps réel |
| `APP_URL` | Variable (`wrangler.jsonc`) | URL publique, pour les retours Stripe |
| `STRIPE_SECRET_KEY` | **Secret** | Clé secrète Stripe (`sk_test_…` puis `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | **Secret** | Secret de signature du webhook (`whsec_…`) |

## Prix (TTC, validés)

Calcul pour un acheteur en France (TVA 20 %) et une carte européenne standard (frais Stripe ≈ 1,5 % + 0,25 €, plus environ 0,5 % pour Stripe Tax).

| Produit | Prix TTC | Dont TVA | HT | Frais Stripe | Net estimé |
|---|---|---|---|---|---|
| Accessoire (6 au catalogue) | 1,99 € | 0,33 € | 1,66 € | ≈ 0,29 € | ≈ 1,37 € |
| Avatar premium (4 au catalogue) | 2,99 € | 0,50 € | 2,49 € | ≈ 0,31 € | ≈ 2,18 € |
| Collection Salon privé (les 4 avatars) | 8,99 € | 1,50 € | 7,49 € | ≈ 0,43 € | ≈ 7,06 € |

Pour un acheteur d'un autre pays de l'UE, le prix TTC reste identique et seule la part de TVA change.
