import { useEffect, useState } from "react";
import type { DefiDuJour } from "../../shared/defis";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { pluieDePieces } from "../fx/effets";
import { sons } from "../fx/sons";
import { useSession } from "../session";

/** Message en jeu quand un défi est réussi (affiché après l'animation en cours). */
export function useAnnonceDefi(): (titre: string, recompense: number) => void {
  const { notifier } = useSession();
  return (titre, recompense) =>
    setTimeout(() => {
      sons.gain(0);
      notifier(`Défi réussi : ${titre}. ${formatJetons(recompense)} jetons à récupérer au lobby.`);
    }, 2200);
}

/** Carte « Défis du jour » du lobby. */
export function DefisDuJour() {
  const { rafraichir, notifier } = useSession();
  const [defis, setDefis] = useState<DefiDuJour[] | null>(null);
  const charger = () => void api<{ defis: DefiDuJour[] }>("/defis").then((r) => setDefis(r.defis)).catch(() => setDefis([]));
  useEffect(charger, []);

  const recuperer = async (d: DefiDuJour, bouton: HTMLElement) => {
    try {
      const r = await api<{ recompense: number }>(`/defis/${d.defi}/recuperer`, { corps: {} });
      sons.gain(0);
      pluieDePieces(bouton, 24);
      notifier(`+${formatJetons(r.recompense)} jetons. Joli travail.`);
      charger();
      await rafraichir();
    } catch (e) {
      notifier((e as Error).message, true);
    }
  };

  if (!defis?.length) return null;
  const faits = defis.filter((d) => d.reclame).length;
  return (
    <div className="carte-ui encart">
      <div className="rangee" style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 600 }}>Défis du jour</div>
        <span className="muet num" style={{ fontSize: 13 }}>{faits} / {defis.length}</span>
      </div>
      <ul className="liste-defis">
        {defis.map((d) => {
          const fini = d.progression >= d.objectif;
          return (
            <li key={d.defi} className={d.reclame ? "reclame" : undefined}>
              <div className="defi-tete">
                <span>{d.titre}</span>
                <span className="accent num">+{formatJetons(d.recompense)}</span>
              </div>
              <div className="defi-pied">
                <div className="jauge" role="progressbar" aria-valuemin={0} aria-valuemax={d.objectif} aria-valuenow={d.progression} aria-label={d.titre}>
                  <i style={{ width: `${(100 * d.progression) / d.objectif}%` }} />
                </div>
                {d.reclame ? (
                  <span className="muet" style={{ fontSize: 12 }}>Récupéré</span>
                ) : fini ? (
                  <button type="button" className="btn btn-principal btn-petit respire" onClick={(e) => void recuperer(d, e.currentTarget)}>Récupérer</button>
                ) : (
                  <span className="muet num" style={{ fontSize: 12 }}>{d.progression} / {d.objectif}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
