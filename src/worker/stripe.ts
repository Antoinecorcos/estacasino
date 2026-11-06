import type { Produit } from "../shared/boutique";
import { egaliteConstante, hmacSha256Hex } from "./crypto";

// Intégration Stripe minimale, sans SDK (appels HTTP directs) :
//  - création d'une session Checkout en paiement unique, TVA incluse dans le prix (tax_behavior=inclusive),
//    avec Stripe Tax activé (automatic_tax) ;
//  - vérification de la signature des webhooks.
// La boutique ne vend que des cosmétiques : rien ici ne touche aux jetons.

/** Code fiscal Stripe : « General - Electronically Supplied Services ». */
const CODE_FISCAL = "txcd_10000000";

export async function creerSessionCheckout(
  cleSecrete: string,
  produit: Produit,
  joueur: { id: string; pseudo: string },
  appUrl: string,
): Promise<{ id: string; url: string }> {
  const f = new URLSearchParams();
  f.set("mode", "payment");
  f.set("success_url", `${appUrl}/boutique?achat=ok&session={CHECKOUT_SESSION_ID}`);
  f.set("cancel_url", `${appUrl}/boutique?achat=annule`);
  f.set("client_reference_id", joueur.id);
  f.set("metadata[joueur_id]", joueur.id);
  f.set("metadata[produit]", produit.id);
  f.set("payment_intent_data[metadata][joueur_id]", joueur.id);
  f.set("payment_intent_data[metadata][produit]", produit.id);
  f.set("automatic_tax[enabled]", "true");
  f.set("billing_address_collection", "auto");
  f.set("locale", "fr");
  f.set("line_items[0][quantity]", "1");
  f.set("line_items[0][price_data][currency]", "eur");
  f.set("line_items[0][price_data][unit_amount]", String(produit.prixCentimes));
  f.set("line_items[0][price_data][tax_behavior]", "inclusive");
  f.set("line_items[0][price_data][product_data][name]", `Estacasino · ${produit.nom}`);
  f.set("line_items[0][price_data][product_data][description]", `${produit.description} Cosmétique uniquement, sans jetons.`);
  f.set("line_items[0][price_data][product_data][tax_code]", CODE_FISCAL);

  const rep = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cleSecrete}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: f,
  });
  const json = (await rep.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!rep.ok || !json.id || !json.url) throw new Error(json.error?.message ?? `Stripe a répondu ${rep.status}`);
  return { id: json.id, url: json.url };
}

/** Vérifie l'en-tête Stripe-Signature (HMAC-SHA256, tolérance de 5 minutes). */
export async function verifierSignatureWebhook(corps: string, entete: string | null, secret: string): Promise<boolean> {
  if (!entete) return false;
  let t = "";
  const signatures: string[] = [];
  for (const partie of entete.split(",")) {
    const [k, v] = partie.split("=");
    if (k === "t") t = v;
    if (k === "v1") signatures.push(v);
  }
  if (!t || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const attendu = await hmacSha256Hex(secret, `${t}.${corps}`);
  return signatures.some((s) => egaliteConstante(s, attendu));
}

export interface SessionCheckoutTerminee {
  id: string;
  payment_status: string;
  amount_total: number | null;
  metadata: { joueur_id?: string; produit?: string } | null;
}
