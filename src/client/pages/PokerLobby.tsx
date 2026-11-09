import { useEffect, useState } from "react";
import { LIGUES, trouverLigue } from "../../shared/ligues";
import { ENTREES_SNG, formatJetons, NIVEAUX_POKER } from "../../shared/regles";
import { api } from "../api";
import { Page } from "../components/Elements";
import { naviguer } from "../router";
import { useSession } from "../session";

interface Occupation {
  mode: string;
  niveau: string;
  joueurs: number;
  tables: number;
}

/** Tables publiques de poker : parties libres par niveau de blindes, et Sit & Go par entrée. */
export function PokerLobby() {
  const { moi, notifier } = useSession();
  const [occupation, setOccupation] = useState<Occupation[]>([]);
  useEffect(() => {
    const charger = () => void api<{ occupation: Occupation[] }>("/poker/tables").then((r) => setOccupation(r.occupation)).catch(() => undefined);
    charger();
    const t = setInterval(charger, 10_000);
    return () => clearInterval(t);
  }, []);
  if (!moi) return null;

  const rangMoi = LIGUES.findIndex((l) => l.id === moi.ligue.id);
  const rejoindre = async (mode: "cash" | "sng", niveau: string) => {
    try {
      const r = await api<{ nom: string }>("/poker/rejoindre", { corps: { mode, niveau } });
      naviguer(`/poker/table/${r.nom}`);
    } catch (e) {
      notifier((e as Error).message, true);
    }
  };
  const occ = (mode: string, niveau: string) => occupation.find((o) => o.mode === mode && o.niveau === niveau)?.joueurs ?? 0;

  return (
    <Page>
      <div className="pile" style={{ gap: 28 }}>
        <div className="pile" style={{ gap: 6 }}>
          <div className="surtitre">Poker Texas Hold'em · sans limite</div>
          <h1 style={{ fontSize: 40 }}>Les tables publiques</h1>
          <p className="muet" style={{ maxWidth: 640 }}>
            Asseyez-vous à une table ouverte, ou inscrivez-vous à un Sit &amp; Go. Pour jouer entre amis, ouvrez une room depuis le lobby. Les gains de poker
            ont leur propre classement.
          </p>
        </div>

        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Partie libre · on s'assoit et on repart quand on veut</h2>
          <div className="grille-poker">
            {NIVEAUX_POKER.map((n) => {
              const bloque = rangMoi < LIGUES.findIndex((l) => l.id === n.ligue);
              const assis = occ("cash", n.id);
              return (
                <article key={n.id} className={`carte-ui table-publique${bloque ? " bloquee" : ""}`}>
                  <div className="surtitre">Blindes</div>
                  <div className="blindes num">{formatJetons(n.petite)} / {formatJetons(n.grosse)}</div>
                  <div className="muet" style={{ fontSize: 13 }}>Cave de {formatJetons(n.grosse * 40)} à {formatJetons(n.grosse * 100)}</div>
                  <div className="muet" style={{ fontSize: 13 }}>{assis ? `${assis} joueur${assis > 1 ? "s" : ""} assis` : "Table libre"}</div>
                  <button type="button" className="btn btn-principal" disabled={bloque || moi.solde < n.grosse * 40} onClick={() => void rejoindre("cash", n.id)}>
                    {bloque ? `Ligue ${trouverLigue(n.ligue).nom}` : "Prendre place"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Sit &amp; Go · 6 joueurs, les 2 premiers payés</h2>
          <div className="grille-poker">
            {ENTREES_SNG.map((n) => {
              const bloque = rangMoi < LIGUES.findIndex((l) => l.id === n.ligue);
              const inscrits = occ("sng", n.id);
              return (
                <article key={n.id} className={`carte-ui table-publique${bloque ? " bloquee" : ""}`}>
                  <div className="surtitre">Entrée</div>
                  <div className="blindes num">{formatJetons(n.entree)}</div>
                  <div className="muet" style={{ fontSize: 13 }}>Jusqu'à {formatJetons(n.entree * 6)} jetons à se partager</div>
                  <div className="muet" style={{ fontSize: 13 }}>{inscrits ? `${inscrits} inscrit${inscrits > 1 ? "s" : ""}` : "Aucun inscrit"}</div>
                  <button type="button" className="btn btn-contour" disabled={bloque || moi.solde < n.entree} onClick={() => void rejoindre("sng", n.id)}>
                    {bloque ? `Ligue ${trouverLigue(n.ligue).nom}` : "Rejoindre"}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </Page>
  );
}
