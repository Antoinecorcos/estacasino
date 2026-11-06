// Petits outils cryptographiques (WebCrypto, disponible nativement dans les Workers).

const enc = new TextEncoder();

export function hex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function octetsAleatoires(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Entier aléatoire uniforme dans [0, n), sans biais de modulo. */
export function aleatoire(n: number): number {
  if (n <= 0 || n > 2 ** 32) throw new Error("borne invalide");
  const limite = Math.floor(2 ** 32 / n) * n;
  const tampon = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(tampon);
    if (tampon[0] < limite) return tampon[0] % n;
  }
}

export function chaineAleatoire(alphabet: string, longueur: number): string {
  let s = "";
  for (let i = 0; i < longueur; i++) s += alphabet[aleatoire(alphabet.length)];
  return s;
}

export async function sha256(texte: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(texte)));
}

// Mots de passe : PBKDF2-SHA256, 100 000 itérations (maximum accepté par les Workers), sel de 16 octets.
// Format stocké : pbkdf2$<itérations>$<sel hex>$<hash hex>.
// Le script scripts/reset-password.mjs produit exactement le même format.
const ITERATIONS = 100_000;

async function pbkdf2(mdp: string, sel: Uint8Array, iterations: number): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", enc.encode(mdp), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations }, cle, 256);
  return hex(bits);
}

export async function hacherMotDePasse(mdp: string): Promise<string> {
  const sel = octetsAleatoires(16);
  return `pbkdf2$${ITERATIONS}$${hex(sel)}$${await pbkdf2(mdp, sel, ITERATIONS)}`;
}

export async function verifierMotDePasse(mdp: string, stocke: string): Promise<boolean> {
  const [algo, it, selHex, attendu] = stocke.split("$");
  if (algo !== "pbkdf2" || !selHex || !attendu) return false;
  const sel = new Uint8Array(selHex.match(/../g)!.map((h) => parseInt(h, 16)));
  return egaliteConstante(await pbkdf2(mdp, sel, Number(it)), attendu);
}

export function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", cle, enc.encode(message)));
}
