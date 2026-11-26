import { useEffect, useState } from "react";
import type { ConfigAvatar } from "../../shared/avatar";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { BadgeLigue } from "../components/Ligue";
import { Page } from "../components/Elements";
import { useSession } from "../session";

interface Reponse {
  saison: { nom: string; debut: number; fin: number } | null;
  minParties: number;
  lignes: { rang: number; pseudo: string; avatar: ConfigAvatar; gains: number; parties: number; ligue: string | null; badges?: string[] }[];
  /** Saison dont les champions portent un badge (la précédente). */
  saisonBadges?: string | null;
}

const ONGLETS = [
  { id: "global", nom: "Général" },
  { id: "blackjack", nom: "Blackjack" },
  { id: "roulette", nom: "Roulette" },
  { id: "poker", nom: "Poker" },
  { id: "machine", nom: "Machine à sous" },
  { id: "paris", nom: "Paris sportifs" }, // affiché seulement si l'option est activée pour le joueur
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
              {donnees.saison.fin - Date.now() > 300 * 24 * 3600 * 1000
                ? `Depuis le ${date(donnees.saison.debut)}`
                : `Du ${date(donnees.saison.debut)} au ${date(donnees.saison.fin)}`}{" "}
              · classé sur les gains nets de la saison (défis du jour compris), à partir de {donnees.minParties} parties jouées. Les
              parties en room comptent aussi.
            </p>
          )}
        </div>
        <div className="onglets" role="group" aria-label="Choix du classement">
          {ONGLETS.filter((o) => o.id !== "paris" || moi?.paris).map((o) => (
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
                  <th scope="col" className="col-parties" style={{ textAlign: "right" }}>Parties</th>
                </tr>
              </thead>
              <tbody>
                {donnees.lignes.map((l) => (
                  <tr key={l.pseudo} className={l.pseudo === moi?.pseudo ? "moi" : undefined}>
                    <td className={`rang${l.rang <= 3 ? " podium" : ""}`}>{l.rang}</td>
                    <td>
                      <div className="rangee" style={{ gap: 10, flexWrap: "nowrap" }}>
                        <Avatar config={l.avatar} taille={36} />
                        <strong className="pseudo-classement">{l.pseudo}</strong>
                        {l.ligue && <span className="col-ligue"><BadgeLigue id={l.ligue} /></span>}
                        {l.badges?.map((b) => <BadgeChampion key={b} titre={b} saison={donnees.saisonBadges ?? ""} />)}
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: l.gains >= 0 ? "var(--accent)" : "var(--carmin-clair)" }}>
                      {l.gains > 0 ? "+" : ""}
                      {formatJetons(l.gains)}
                    </td>
                    <td className="num muet col-parties" style={{ textAlign: "right" }}>{formatJetons(l.parties)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="muet" style={{ fontSize: 13 }}>
          En fin de saison, le premier du classement général et le premier de chaque jeu reçoivent des jetons et un badge de champion,
          affiché toute la saison suivante. Les récompenses ne peuvent pas être achetées.
        </p>
      </div>
    </Page>
  );
}

const NOMS_BADGES: Record<string, string> = { general: "Champion", blackjack: "Champion blackjack", roulette: "Champion roulette", poker: "Champion poker", machine: "Champion machine", paris: "Champion des paris" };

/** Badge d'un champion de la saison précédente (« Champion S1 », « Champion blackjack S1 »). */
export function BadgeChampion({ titre, saison }: { titre: string; saison: string }) {
  const court = saison.replace(/^Saison\s*/i, "S");
  return (
    <span className={`badge-champion${titre === "general" ? " general" : ""}`} title={`${NOMS_BADGES[titre] ?? "Champion"} de la ${saison}`}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M3 18h18l-1.5-10-5 4L12 4l-2.5 8-5-4z" fill="currentColor" /></svg>
      {NOMS_BADGES[titre] ?? "Champion"} {court}
    </span>
  );
}
