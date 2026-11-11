import { useEffect, useState } from "react";
import { api } from "../api";
import { ouvrirTuto, plateforme } from "../installation";
import { activerNotifications, desactiverNotifications, type EtatNotifications, etatNotifications, resynchroniserNotifications } from "../notifications";
import { useSession } from "../session";

// Rappels sur le téléphone : bonus du jour à 10 h et filet de sécurité disponible.

const CLE_INVITE = "esta-rappels-invite";

const Cloche = () => (
  <span className="rappels-cloche" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
      <path d="M10 20a2.2 2.2 0 0 0 4 0" />
    </svg>
  </span>
);

function useEtat(): [EtatNotifications | null, (e: EtatNotifications) => void] {
  const [etat, setEtat] = useState<EtatNotifications | null>(null);
  useEffect(() => {
    void etatNotifications().then(setEtat).catch(() => setEtat("non-supporte"));
  }, []);
  return [etat, setEtat];
}

/** Réglages complets, dans le profil (mobile). */
export function CarteRappels() {
  const { notifier } = useSession();
  const [etat, setEtat] = useEtat();
  const [prefs, setPrefs] = useState<{ bonus: boolean; filet: boolean } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (etat === "actif") void api<{ bonus: boolean; filet: boolean }>("/notifications").then((r) => setPrefs({ bonus: r.bonus, filet: r.filet }));
  }, [etat]);

  if (!etat || etat === "non-supporte" || plateforme() === "bureau") return null;

  const activer = async () => {
    setEnvoi(true);
    try {
      const e = await activerNotifications();
      setEtat(e);
      if (e === "actif") notifier("Notifications activées. Rendez-vous demain à 10 h.");
    } catch (err) {
      notifier((err as Error).message || "Impossible d'activer les notifications.", true);
    } finally {
      setEnvoi(false);
    }
  };
  const changer = async (cle: "bonus" | "filet", v: boolean) => {
    setPrefs((p) => (p ? { ...p, [cle]: v } : p));
    await api("/notifications/preferences", { methode: "PUT", corps: { [cle]: v } }).catch(() => notifier("Réglage non enregistré, réessayez.", true));
  };

  return (
    <section className="carte-ui encart rappels">
      <div className="rangee" style={{ gap: 12, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <Cloche />
        <div className="pile" style={{ gap: 4 }}>
          <h2 style={{ fontSize: 22 }}>Rappels sur ce téléphone</h2>
          <p className="muet" style={{ fontSize: 14, margin: 0 }}>Votre bonus du jour à 10 h, et votre filet de sécurité dès qu'il est prêt. Rien d'autre.</p>
        </div>
      </div>
      {etat === "installer-dabord" && (
        <>
          <p style={{ fontSize: 14, margin: 0 }}>Sur iPhone, les notifications arrivent seulement dans l'application installée sur l'écran d'accueil.</p>
          <button type="button" className="btn btn-contour" onClick={ouvrirTuto}>Installer l'application</button>
        </>
      )}
      {etat === "refuse" && (
        <p className="muet" style={{ fontSize: 14, margin: 0 }}>
          Les notifications sont bloquées pour Estacasino. Autorisez-les dans les réglages du téléphone (Notifications → Estacasino), puis revenez ici.
        </p>
      )}
      {etat === "inactif" && (
        <button type="button" className="btn btn-principal" disabled={envoi} onClick={() => void activer()}>
          {envoi ? "Activation…" : "Activer les notifications"}
        </button>
      )}
      {etat === "actif" && (
        <div className="pile" style={{ gap: 10 }}>
          <label className="case">
            <input type="checkbox" checked={prefs?.bonus ?? true} onChange={(e) => void changer("bonus", e.target.checked)} />
            <span>Bonus du jour, tous les jours à 10 h (si vous ne l'avez pas déjà pris)</span>
          </label>
          <label className="case">
            <input type="checkbox" checked={prefs?.filet ?? true} onChange={(e) => void changer("filet", e.target.checked)} />
            <span>Filet de sécurité disponible (en journée, jamais en pleine partie)</span>
          </label>
          <div className="rangee" style={{ gap: 8 }}>
            <button
              type="button" className="btn btn-petit btn-contour" disabled={envoi}
              onClick={() => {
                setEnvoi(true);
                void api("/notifications/test", { corps: {} })
                  .then(() => notifier("Notification envoyée : elle arrive dans quelques secondes."))
                  .catch((e: Error) => notifier(e.message, true))
                  .finally(() => setEnvoi(false));
              }}
            >
              Envoyer un test
            </button>
            <button
              type="button" className="btn btn-petit"
              onClick={() => void desactiverNotifications().then(() => { setEtat("inactif"); notifier("Notifications désactivées sur ce téléphone."); })}
            >
              Désactiver
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Petite invitation dans le lobby (mobile), une seule fois : « Un rappel à 10 h ? ». */
export function InvitationRappels() {
  const { notifier } = useSession();
  const [etat, setEtat] = useEtat();
  const [masque, setMasque] = useState(() => {
    try {
      return localStorage.getItem(CLE_INVITE) === "non";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    void resynchroniserNotifications();
  }, []);
  if (masque || etat !== "inactif" || plateforme() === "bureau") return null;
  const fermer = () => {
    try {
      localStorage.setItem(CLE_INVITE, "non");
    } catch {
      /* stockage indisponible */
    }
    setMasque(true);
  };
  return (
    <div className="carte-ui encart invitation-rappels">
      <div className="rangee" style={{ gap: 10, flexWrap: "nowrap" }}>
        <Cloche />
        <div style={{ fontSize: 14 }}>
          <b>Un rappel pour votre bonus du jour ?</b>
          <div className="muet">Une notification à 10 h, et quand votre filet de sécurité est prêt.</div>
        </div>
      </div>
      <div className="rangee" style={{ gap: 8 }}>
        <button
          type="button" className="btn btn-petit btn-principal"
          onClick={() =>
            void activerNotifications()
              .then((e) => {
                setEtat(e);
                if (e === "actif") {
                  notifier("C'est noté : rendez-vous demain à 10 h.");
                  fermer();
                }
              })
              .catch((e: Error) => notifier(e.message || "Impossible d'activer les notifications.", true))
          }
        >
          Activer
        </button>
        <button type="button" className="btn btn-petit" onClick={fermer}>Non merci</button>
      </div>
    </div>
  );
}
