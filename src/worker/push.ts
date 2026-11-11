// Notifications Web Push, sans dépendance : chiffrement « aes128gcm » (RFC 8291) et
// authentification VAPID (RFC 8292), avec l'API WebCrypto du Worker.
// Les clés VAPID sont créées au premier besoin et gardées dans la table `config`.

const enc = new TextEncoder();

export function b64url(octets: ArrayBuffer | Uint8Array): string {
  const o = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let s = "";
  for (const x of o) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deB64url(texte: string): Uint8Array {
  const b = texte.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texte.length + 3) % 4);
  const s = atob(b);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function concat(...parties: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parties.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of parties) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hkdf(sel: Uint8Array, ikm: Uint8Array, info: Uint8Array, longueur: number): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sel, info }, cle, longueur * 8));
}

export interface ClesVapid {
  publique: string; // point P-256 non compressé, base64url (65 octets)
  privee: JsonWebKey;
}

/** Clés VAPID du serveur : lues dans `config`, ou créées la première fois. */
export async function clesVapid(db: D1Database): Promise<ClesVapid> {
  const l = await db.prepare("SELECT valeur FROM config WHERE cle = 'vapid'").first<{ valeur: string }>();
  if (l) return JSON.parse(l.valeur) as ClesVapid;
  const paire = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const cles: ClesVapid = {
    publique: b64url(await crypto.subtle.exportKey("raw", paire.publicKey) as ArrayBuffer),
    privee: (await crypto.subtle.exportKey("jwk", paire.privateKey)) as JsonWebKey,
  };
  // Si deux requêtes créent les clés en même temps, la première gagne et tout le monde la relit.
  await db.prepare("INSERT OR IGNORE INTO config (cle, valeur) VALUES ('vapid', ?)").bind(JSON.stringify(cles)).run();
  const final = await db.prepare("SELECT valeur FROM config WHERE cle = 'vapid'").first<{ valeur: string }>();
  return JSON.parse(final!.valeur) as ClesVapid;
}

/** Jeton VAPID (JWT ES256) pour le service de notifications du navigateur. */
export async function jetonVapid(cles: ClesVapid, endpoint: string, sujet: string): Promise<string> {
  const entete = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet })));
  const cle = await crypto.subtle.importKey("jwk", cles.privee, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, enc.encode(`${entete}.${corps}`));
  return `${entete}.${corps}.${b64url(signature)}`;
}

/** Chiffre un message pour un abonnement (RFC 8291, un seul enregistrement). */
export async function chiffrer(message: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array> {
  const clientPublique = deB64url(p256dh);
  const secretAuth = deB64url(auth);
  const ephemere = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const serveurPublique = new Uint8Array((await crypto.subtle.exportKey("raw", ephemere.publicKey)) as ArrayBuffer);
  const cleClient = await crypto.subtle.importKey("raw", clientPublique, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // Propriété standard « public » (les types de Workers l'écrivent « $public », le moteur lit bien « public »).
  const algo = { name: "ECDH", public: cleClient } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const partage = new Uint8Array(await crypto.subtle.deriveBits(algo, ephemere.privateKey, 256));
  const ikm = await hkdf(secretAuth, partage, concat(enc.encode("WebPush: info\0"), clientPublique, serveurPublique), 32);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const cleAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const clair = concat(message, new Uint8Array([2])); // 0x02 : dernier enregistrement, sans remplissage
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cleAes, clair));
  const entete = new Uint8Array(16 + 4 + 1 + serveurPublique.length);
  entete.set(sel, 0);
  new DataView(entete.buffer).setUint32(16, 4096);
  entete[20] = serveurPublique.length;
  entete.set(serveurPublique, 21);
  return concat(entete, chiffre);
}

export interface Abonnement {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Notification {
  titre: string;
  texte: string;
  url?: string;
  tag?: string;
}

/**
 * Envoie une notification. Retourne « ok », « expire » (abonnement à supprimer : 404 ou 410),
 * ou « erreur » (problème passager).
 */
export async function envoyer(cles: ClesVapid, sujet: string, a: Abonnement, n: Notification): Promise<"ok" | "expire" | "erreur"> {
  try {
    const corps = await chiffrer(enc.encode(JSON.stringify(n)), a.p256dh, a.auth);
    const rep = await fetch(a.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${await jetonVapid(cles, a.endpoint, sujet)}, k=${cles.publique}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "21600",
        Urgency: "normal",
        ...(n.tag ? { Topic: n.tag.slice(0, 32) } : {}),
      },
      body: corps,
    });
    if (rep.status === 404 || rep.status === 410) return "expire";
    if (!rep.ok) {
      console.warn("push", rep.status, await rep.text().catch(() => ""));
      return "erreur";
    }
    return "ok";
  } catch (e) {
    console.warn("push", e);
    return "erreur";
  }
}
