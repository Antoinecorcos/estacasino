# Estacasino

Casino social **100 % fictif** : blackjack, roulette, poker et machine à sous avec des jetons sans valeur, des rooms privées par code de 5 lettres, des classements saisonniers et une boutique payée via Stripe (cosmétiques, packs de jetons et forfait saison).

- **Front** : React + Vite (`src/client`)
- **Serveur** : un Worker Cloudflare avec Hono (`src/worker`)
- **Temps réel** : Durable Objects, un par room (`src/worker/rooms`)
- **Base de données** : Cloudflare D1 (`migrations/`)
- **Règles partagées** : cartes, blackjack, roulette, poker, machine à sous, avatars, boutique (`src/shared`)
- **Machine à sous** : mathématiques dans `src/shared/machine.ts` (simulées pour un taux de redistribution d'environ 97 %, voir `machine.test.ts`), rendu et mise en scène dans `src/client/machine/`

Voir aussi `docs/recap-projet.md` (produit) et `docs/architecture.md` (technique).

## Développement local

```bash
npm install
```

```bash
npm run dev
```

Le site tourne sur http://localhost:8787 avec une base D1 et des Durable Objects simulés en local. Après une modification du front, relancez `npm run dev`, ou travaillez avec rechargement à chaud : `npx wrangler dev` dans un terminal et `npm run dev:client` dans un autre (http://localhost:5173).

Pour tester les achats en local, créez un fichier `.dev.vars` (ignoré par git) :

```
APP_URL=http://localhost:8787
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Vérifications :

```bash
npm run typecheck
```

```bash
npm test
```

## Mise en ligne sur Cloudflare

### 1. Créer la base D1

Dans le tableau de bord Cloudflare (Storage & Databases → D1 → Create), créez une base nommée `estacasino`, ou en ligne de commande :

```bash
npx wrangler d1 create estacasino
```

Copiez l'identifiant obtenu dans `wrangler.jsonc` (`database_id`), puis commitez.

### 2. Brancher le dépôt GitHub

Workers & Pages → Create → Import a repository → `estacasino`, puis :

- **Build command** : `npm run build`
- **Deploy command** : `npx wrangler d1 migrations apply estacasino --remote && npx wrangler deploy`

Chaque push sur la branche de production redéploie le site et applique les nouvelles migrations de base de données.

### 3. Variables et secrets

| Nom | Type | Où le définir |
|---|---|---|
| `APP_URL` | Variable | Dans `wrangler.jsonc` (`vars`) : l'URL publique : `https://estacasino.com` |
| `STRIPE_SECRET_KEY` | **Secret** | Worker → Settings → Variables and Secrets → Add → type *Secret* |
| `STRIPE_WEBHOOK_SECRET` | **Secret** | Idem |
| `TURNSTILE_SITE_KEY` | Variable | Optionnel : clé publique Turnstile (anti-robots), dans `wrangler.jsonc` (`vars`) |
| `TURNSTILE_SECRET` | **Secret** | Optionnel : clé secrète Turnstile. Sans ces deux clés, pas de vérification anti-robot |

Les bindings `DB`, `ROOMS_BLACKJACK` et `ROOMS_ROULETTE` sont créés automatiquement à partir de `wrangler.jsonc`. Tant que `STRIPE_SECRET_KEY` n'est pas défini, la boutique s'affiche avec « Bientôt disponible ».

### 4. Stripe

1. **Stripe Tax** : Settings → Tax → activez-le et ajoutez votre immatriculation (France). Les prix sont envoyés en *TVA incluse* (`tax_behavior: inclusive`) : le prix affiché est le prix payé.
2. **Webhook** : Developers → Webhooks → Add endpoint
   - URL : `https://estacasino.com/api/stripe/webhook`
   - Événements : `checkout.session.completed` et `checkout.session.async_payment_succeeded`
   - Copiez le *Signing secret* (`whsec_…`) dans le secret `STRIPE_WEBHOOK_SECRET`.
3. Les produits n'ont pas besoin d'être créés dans Stripe : le catalogue est dans `src/shared/boutique.ts` et chaque paiement est créé avec son prix.

### 5. Nom de domaine

Worker → Settings → Domains & Routes → Add → Custom domain. Pensez à mettre à jour `APP_URL` et l'URL du webhook Stripe.

## Opérations courantes

### Nommer un administrateur

```bash
npx wrangler d1 execute estacasino --remote --command "UPDATE joueurs SET role = 'admin' WHERE pseudo = '<pseudo>'"
```

L'onglet « Admin » apparaît alors dans l'en-tête (page `/admin`) : chercher un joueur, voir ses jetons et ses achats, **lui ajouter ou retirer des jetons** (motif obligatoire, sans effet sur les gains de saison), lui donner un mot de passe provisoire, suspendre ou réactiver son compte. Chaque action est enregistrée dans un journal.

### Protection anti-robots (Turnstile)

Tableau de bord Cloudflare → *Turnstile* → *Add widget* (domaine `estacasino.com`, mode « Managed »). Mettez la clé publique dans `TURNSTILE_SITE_KEY` (`wrangler.jsonc`) et la clé secrète dans le secret `TURNSTILE_SECRET`. La vérification s'active alors sur l'inscription et la réinitialisation du mot de passe.

### Mot de passe oublié

Le joueur utilise d'abord son **code de secours** (donné à l'inscription) sur la page « Mot de passe oublié ». S'il l'a perdu aussi :

```bash
npm run reset-password -- <pseudo>
```

Le script écrit un mot de passe provisoire dans la base en ligne et l'affiche ; transmettez-le au joueur. Ajoutez `--local` pour la base de développement. Plus simple : le bouton « Mot de passe provisoire » de l'espace admin.

### Ouvrir une nouvelle saison

Les dates sont des horodatages en millisecondes (UTC). Exemple pour une saison de 6 semaines :

```bash
npx wrangler d1 execute estacasino --remote --command "INSERT INTO saisons (id, nom, debut, fin) VALUES (2, 'Saison 2', 1797116400000, 1800745200000)"
```

Le solde total des joueurs est conservé ; le classement repart de zéro avec la nouvelle saison.

### Comptes multiples

Un seul compte par appareil (cookie technique `esta_appareil`) et au plus 3 inscriptions par adresse IP sur 24 heures. Les empreintes sont hachées. Les appareils déjà utilisés par un administrateur ne sont pas limités, pour les comptes de test. Les réglages sont dans `src/shared/regles.ts` (`COMPTES_PAR_APPAREIL`, `INSCRIPTIONS_PAR_IP_JOUR`). La fiche d'un joueur dans l'admin liste ses **comptes liés** (même appareil ou même IP).

## Règles du produit à ne jamais casser

- Les jetons, achetés ou gagnés, n'ont **aucune valeur** : jamais de retrait, de conversion en argent ou en lots, ni de transfert entre joueurs.
- Les jetons achetés passent uniquement par le webhook Stripe (`crediterAchatJetons`, `forfaits_saison`), crédités une seule fois par session de paiement.
- Plafond de 5 packs de jetons par 24 heures (`PLAFOND_PACKS_JOUR`).
- Tous les tirages sont faits sur le serveur (`crypto.getRandomValues`), jamais dans le navigateur.
