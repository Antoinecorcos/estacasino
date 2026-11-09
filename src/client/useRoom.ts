import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageServeur } from "../shared/protocole";

export type StatutConnexion = "connexion" | "ouvert" | "perdu";

export interface Reaction {
  id: number;
  joueurId: string;
  pseudo: string;
  r: number;
}

/** Connexion WebSocket à une room, avec reconnexion automatique. */
export function useRoom<Etat, MessageClient>(
  chemin: string | null,
  surErreur: (message: string) => void,
  surDefi?: (titre: string, recompense: number) => void,
) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const defiRef = useRef(surDefi);
  defiRef.current = surDefi;
  const [moi, setMoi] = useState<string | null>(null);
  const [statut, setStatut] = useState<StatutConnexion>("connexion");
  const ws = useRef<WebSocket | null>(null);
  const erreurRef = useRef(surErreur);
  erreurRef.current = surErreur;

  useEffect(() => {
    if (!chemin) return;
    let ferme = false;
    let essais = 0;
    let minuteur: ReturnType<typeof setTimeout> | undefined;

    const ouvrir = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const s = new WebSocket(`${proto}//${location.host}/api${chemin}`);
      ws.current = s;
      setStatut("connexion");
      s.onopen = () => {
        essais = 0;
        setStatut("ouvert");
      };
      s.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as MessageServeur<Etat>;
        if (msg.t === "etat") {
          setEtat(msg.etat);
          setMoi(msg.moi);
        } else if (msg.t === "erreur") erreurRef.current(msg.message);
        else if (msg.t === "defi") defiRef.current?.(msg.titre, msg.recompense);
        else if (msg.t === "reaction") {
          const r: Reaction = { id: Date.now() + Math.random(), joueurId: msg.joueurId, pseudo: msg.pseudo, r: msg.r };
          setReactions((l) => [...l.filter((x) => x.joueurId !== r.joueurId), r]);
          setTimeout(() => setReactions((l) => l.filter((x) => x.id !== r.id)), 2800);
        }
      };
      s.onclose = () => {
        if (ferme) return;
        setStatut("perdu");
        essais++;
        if (essais <= 6) minuteur = setTimeout(ouvrir, Math.min(8000, 600 * 2 ** essais));
      };
    };
    ouvrir();
    return () => {
      ferme = true;
      clearTimeout(minuteur);
      ws.current?.close();
      ws.current = null;
    };
  }, [chemin]);

  const reagir = useCallback((r: number) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ t: "reaction", r }));
  }, []);

  const envoyer = useCallback((msg: MessageClient) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  return { etat, moi, statut, envoyer, reactions, reagir };
}

/** Secondes restantes avant une échéance (mise à jour 4 fois par seconde). */
export function useCompteARebours(echeance: number | null): number | null {
  const [maintenant, setMaintenant] = useState(Date.now());
  useEffect(() => {
    if (!echeance) return;
    const t = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(t);
  }, [echeance]);
  if (!echeance) return null;
  return Math.max(0, Math.ceil((echeance - maintenant) / 1000));
}

/** Vrai sur un écran étroit (téléphone). */
export function useEtroit(largeurMax = 700): boolean {
  const requete = `(max-width: ${largeurMax}px)`;
  const [etroit, setEtroit] = useState(() => window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const f = () => setEtroit(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [requete]);
  return etroit;
}
