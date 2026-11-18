import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, ErreurApi, type Moi } from "./api";
import { appliquerTheme } from "./theme";

interface ValeurSession {
  moi: Moi | null;
  charge: boolean;
  rafraichir: () => Promise<void>;
  /** Met à jour le solde affiché (les rooms envoient le solde à jour en temps réel). */
  majSolde: (solde: number) => void;
  /** Met à jour les gains de saison affichés (machine à sous : renvoyés avec chaque lancer). */
  majSaison: (gains: number, parties: number) => void;
  notifier: (message: string, erreur?: boolean) => void;
}

const Ctx = createContext<ValeurSession | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [moi, setMoi] = useState<Moi | null>(null);
  const [charge, setCharge] = useState(false);
  const [toast, setToast] = useState<{ message: string; erreur: boolean; id: number } | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      setMoi(await api<Moi>("/moi"));
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) setMoi(null);
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    void rafraichir();
  }, [rafraichir]);
  useEffect(() => appliquerTheme(moi?.theme), [moi?.theme]);

  const majSolde = useCallback((solde: number) => setMoi((m) => (m && m.solde !== solde ? { ...m, solde } : m)), []);
  const majSaison = useCallback(
    (gains: number, parties: number) => setMoi((m) => (m?.saison ? { ...m, saison: { ...m.saison, gains, parties } } : m)),
    [],
  );
  const notifier = useCallback((message: string, erreur = false) => {
    const id = Date.now();
    setToast({ message, erreur, id });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3800);
  }, []);

  return (
    <Ctx.Provider value={{ moi, charge, rafraichir, majSolde, majSaison, notifier }}>
      {children}
      {toast && (
        <div className={`toast${toast.erreur ? " err" : ""}`} role="status">
          {toast.message}
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useSession(): ValeurSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider manquant");
  return v;
}
