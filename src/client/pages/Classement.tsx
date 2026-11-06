import { useEffect, useState } from "react";
import type { ConfigAvatar } from "../../shared/avatar";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Page } from "../components/Elements";
import { useSession } from "../session";

interface Reponse {
  saison: { nom: string; debut: number; fin: number } | null;
  minParties: number;
  lignes: { rang: number; pseudo: string; avatar: ConfigAvatar; gains: number; parties: number }[];
}

const ONGLETS = [
  { id: "global", nom: "Général" },
  { id: "blackjack", nom: "Blackjack" },
  { id: "roulette", nom: "Roulette" },
] as const;

export function Classement() {
  const { moi } = useSession();
  const [jeu, setJeu] = useState<(typeof ONGLETS)[number]["id"]>("global");
  const [donnees, setDonnees] = useState<Reponse | null>(null);

  useEffect(() => {
    setDonnees(null);
    void api<Reponse>(`/classement?jeu=${jeu}`).then(setDonnees);
  }, [jeu]);

  const date = (ms: number) => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  return (
    <Page etroite>
      <div className="pile" style={{ gap: 24 }}>
        <div className="pile" style={{ gap: 6 }}>
          <div className="surtitre">Classement de saison</div>
          <h1 style={{ fontSize: 40 }}>{donnees?.saison ? `« ${donnees.saison.nom} »` : "Classement"}</h1>
          {donnees?.saison && (
            <p className="muet">
              Du {date(donnees.saison.debut)} au {date(donnees.saison.fin)} · classé sur les gains nets de la saison, à partir de{" "}
              {donnees.minParties} parties jouées. Les parties en room comptent aussi.
            </p>
          )}
        </div>
        <div className="onglets" role="group" aria-label="Choix du classement">
          {ONGLETS.map((o) => (
            <button key={o.id} type="button" aria-pressed={jeu === o.id} onClick={() => setJeu(o.id)}>
              {o.nom}
            </button>
          ))}
        </div>
        <div className="carte-ui" style={{ overflowX: "auto" }}>
          {!donnees ? (
            <p className="muet" style={{ padding: 20 }}>Chargement…</p>
          ) : donnees.lignes.length === 0 ? (
            <p className="italique accent" style={{ padding: 24, fontSize: 18 }}>
              Personne n'est encore classé. La première place vous tend les bras.
            </p>
          ) : (
            <table className="tableau">
              <thead>
                <tr>
                  <th scope="col">Rang</th>
                  <th scope="col">Joueur</th>
                  <th scope="col" style={{ textAlign: "right" }}>Gains nets</th>
                  <th scope="col" style={{ textAlign: "right" }}>Parties</th>
                </tr>
              </thead>
              <tbody>
                {donnees.lignes.map((l) => (
                  <tr key={l.pseudo} className={l.pseudo === moi?.pseudo ? "moi" : undefined}>
                    <td className={`rang${l.rang <= 3 ? " podium" : ""}`}>{l.rang}</td>
                    <td>
                      <div className="rangee" style={{ gap: 10, flexWrap: "nowrap" }}>
                        <Avatar config={l.avatar} taille={36} />
                        <strong>{l.pseudo}</strong>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: l.gains >= 0 ? "var(--accent)" : "var(--carmin-clair)" }}>
                      {l.gains > 0 ? "+" : ""}
                      {formatJetons(l.gains)}
                    </td>
                    <td className="num muet" style={{ textAlign: "right" }}>{formatJetons(l.parties)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="muet" style={{ fontSize: 13 }}>
          Les récompenses de fin de saison sont uniquement honorifiques (titres, badges) et ne peuvent pas être achetées.
        </p>
      </div>
    </Page>
  );
}
