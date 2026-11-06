export interface Env {
  DB: D1Database;
  ROOMS_BLACKJACK: DurableObjectNamespace;
  ROOMS_ROULETTE: DurableObjectNamespace;
  APP_URL: string;
  /** Secret : clé secrète Stripe (sk_test_… ou sk_live_…). */
  STRIPE_SECRET_KEY?: string;
  /** Secret : secret de signature du webhook Stripe (whsec_…). */
  STRIPE_WEBHOOK_SECRET?: string;
}
