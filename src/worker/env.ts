export interface Env {
  DB: D1Database;
  ROOMS_BLACKJACK: DurableObjectNamespace;
  ROOMS_ROULETTE: DurableObjectNamespace;
  ROOMS_POKER: DurableObjectNamespace;
  APP_URL: string;
  LIMITE_AUTH?: RateLimit;
  LIMITE_API?: RateLimit;
  /** Clé publique Cloudflare Turnstile (anti-robots). Absente : pas de vérification. */
  TURNSTILE_SITE_KEY?: string;
  /** Secret : clé secrète Turnstile. */
  TURNSTILE_SECRET?: string;
  /** Secret : clé secrète Stripe (sk_test_… ou sk_live_…). */
  STRIPE_SECRET_KEY?: string;
  /** Secret : secret de signature du webhook Stripe (whsec_…). */
  STRIPE_WEBHOOK_SECRET?: string;
}
