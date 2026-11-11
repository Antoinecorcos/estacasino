import { api } from "./api";
import { estInstallee, plateforme } from "./installation";

// Notifications sur le téléphone. Sur iPhone, elles ne marchent que dans l'application installée
// (écran d'accueil, iOS 16.4 ou plus) ; sur Android, dans Chrome comme dans l'application.

export type EtatNotifications = "non-supporte" | "installer-dabord" | "refuse" | "inactif" | "actif";

const supporte = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function abonnementActuel(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function etatNotifications(): Promise<EtatNotifications> {
  const p = plateforme();
  if (p.startsWith("ios") && !estInstallee()) return "installer-dabord";
  if (!supporte()) return "non-supporte";
  if (Notification.permission === "denied") return "refuse";
  return (await abonnementActuel()) && Notification.permission === "granted" ? "actif" : "inactif";
}

function cleServeur(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4));
  const o = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
  return o;
}

/** À appeler depuis un clic (exigé par iOS) : demande l'autorisation et abonne l'appareil. */
export async function activerNotifications(): Promise<EtatNotifications> {
  if (!supporte()) return "non-supporte";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "refuse" : "inactif";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { cle } = await api<{ cle: string }>("/notifications");
  let abo = await reg.pushManager.getSubscription();
  // Clé du serveur changée (rare) : on repart d'un abonnement neuf.
  if (abo && abo.options.applicationServerKey) {
    const actuelle = new Uint8Array(abo.options.applicationServerKey);
    const attendue = cleServeur(cle);
    if (actuelle.length !== attendue.length || actuelle.some((x, i) => x !== attendue[i])) {
      await abo.unsubscribe();
      abo = null;
    }
  }
  try {
    abo ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleServeur(cle) });
  } catch {
    throw new Error("Le téléphone n'a pas pu s'abonner aux notifications. Vérifiez votre connexion et réessayez.");
  }
  await api("/notifications/abonnement", { corps: abo.toJSON() });
  return "actif";
}

export async function desactiverNotifications(): Promise<void> {
  const abo = supporte() ? await abonnementActuel() : null;
  if (!abo) return;
  await api("/notifications/desabonnement", { corps: { endpoint: abo.endpoint } }).catch(() => {});
  await abo.unsubscribe();
}

/** Au démarrage : si l'appareil est abonné, on resynchronise (le serveur a pu l'oublier). */
export async function resynchroniserNotifications(): Promise<void> {
  if (!supporte() || Notification.permission !== "granted") return;
  const abo = await abonnementActuel();
  if (abo) await api("/notifications/abonnement", { corps: abo.toJSON() }).catch(() => {});
}
