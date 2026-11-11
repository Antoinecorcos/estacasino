import { useSyncExternalStore } from "react";

// Application installée : écran d'accueil sur iPhone (Safari, « Sur l'écran d'accueil »), installation
// native sur Android (Chrome propose « Installer l'application »), et favori sur ordinateur.
// Le tutoriel ne s'affiche qu'une fois, juste après la création du compte.

export type Plateforme = "ios-safari" | "ios-autre" | "ios-integre" | "android" | "bureau";

interface InviteInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CLE = "esta-installation"; // « a-montrer » après l'inscription, puis « vu »
let invite: InviteInstallation | null = null;
let ouvert = false;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

function lire(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}
function ecrire(v: string): void {
  try {
    localStorage.setItem(CLE, v);
  } catch {
    /* stockage indisponible */
  }
}

export function plateforme(): Plateforme {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter/i.test(ua)) return "ios-integre";
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return "ios-autre";
    return "ios-safari";
  }
  if (/Android/i.test(ua)) return "android";
  return "bureau";
}

export function estInstallee(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** À appeler au démarrage : service worker, et capture de l'invitation d'installation (Android, Chrome, Edge). */
export function initialiserInstallation(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    invite = e as InviteInstallation;
    prevenir();
  });
  window.addEventListener("appinstalled", () => {
    invite = null;
    fermerTuto();
  });
  ouvert = lire() === "a-montrer" && !estInstallee();
}

/** Juste après l'inscription : le tutoriel s'ouvrira sur le lobby. */
export function programmerTuto(): void {
  if (estInstallee()) return;
  ecrire("a-montrer");
  ouvert = true;
  prevenir();
}

/** Depuis le profil (mobile) : rouvrir le tutoriel. */
export function ouvrirTuto(): void {
  ouvert = true;
  prevenir();
}

export function fermerTuto(): void {
  ecrire("vu");
  ouvert = false;
  prevenir();
}

/** Lance l'installation native (Android, Chrome et Edge). Retourne true si le joueur a accepté. */
export async function installerNatif(): Promise<boolean> {
  if (!invite) return false;
  const i = invite;
  invite = null;
  prevenir();
  await i.prompt();
  return (await i.userChoice).outcome === "accepted";
}

function abonner(f: () => void) {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

export function useInstallation(): { ouvert: boolean; natif: boolean } {
  const ouv = useSyncExternalStore(abonner, () => ouvert);
  const natif = useSyncExternalStore(abonner, () => invite !== null);
  return { ouvert: ouv, natif };
}
