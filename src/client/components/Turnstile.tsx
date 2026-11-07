import { useEffect, useRef, useState } from "react";
import { api } from "../api";

// Vérification anti-robot Cloudflare Turnstile (sans cookie publicitaire, souvent invisible).
// Elle ne s'affiche que si la clé publique est configurée côté serveur.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; theme?: string; language?: string; callback: (t: string) => void; "expired-callback"?: () => void }) => string;
      remove: (id: string) => void;
    };
  }
}

let cle: Promise<string | null> | null = null;
const lireCle = () => (cle ??= api<{ turnstile: string | null }>("/config").then((r) => r.turnstile).catch(() => null));

let script: Promise<void> | null = null;
const chargerScript = () =>
  (script ??= new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => ko(new Error("Turnstile indisponible"));
    document.head.append(s);
  }));

/** Zone du widget, jeton à envoyer au serveur, et « requis » si une vérification est demandée. */
export function useTurnstile(): { zone: React.ReactNode; jeton: string; requis: boolean } {
  const ref = useRef<HTMLDivElement>(null);
  const [jeton, setJeton] = useState("");
  const [requis, setRequis] = useState(false);
  useEffect(() => {
    let id: string | null = null;
    let fini = false;
    void lireCle().then(async (k) => {
      if (!k || fini) return;
      setRequis(true);
      await chargerScript();
      if (fini || !ref.current || !window.turnstile) return;
      id = window.turnstile.render(ref.current, { sitekey: k, theme: "dark", language: "fr", callback: setJeton, "expired-callback": () => setJeton("") });
    });
    return () => {
      fini = true;
      if (id) window.turnstile?.remove(id);
    };
  }, []);
  return { zone: <div ref={ref} className="zone-turnstile" />, jeton, requis };
}
