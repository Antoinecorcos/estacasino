import { useEffect, useRef, useState } from "react";
import { peutDoubler, peutSeparer, valeurMain } from "../../shared/blackjack";
import type { BjAction, BjEtat, BjJoueur, BjMain, BjMessageClient } from "../../shared/protocole";
import { formatJetons } from "../../shared/regles";
import { Avatar } from "../components/Avatar";
import { Carte, Compteur, Jeton, VALEURS_JETONS } from "../components/Elements";
import { useSession } from "../session";
import { useCompteARebours, useRoom } from "../useRoom";
import { BarreRoom } from "./Room";

const LIBELLES_ISSUE = { blackjack: "Blackjack !", gagne: "Gagné", egalite: "Égalité", perdu: "Perdu", bust: "Bust" } as const;

function totalAffiche(cartes: BjMain["cartes"]): string {
  const v = valeurMain(cartes);
  if (v.souple && v.total < 21) return `${v.total - 10} ou ${v.total}`;
  return String(v.total);
}

function Place({ j, etat, moi }: { j: BjJoueur; etat: BjEtat; moi: string | null }) {
  const actif = etat.tour?.joueurId === j.id;
  return (
    <div className={`place${actif ? " active" : ""}`}>
      <div className="mains">
        {j.mains.map((m, i) => (
          <div key={i} className="pile" style={{ alignItems: "center", gap: 6 }}>
            <div className="cartes">
              {m.cartes.map((c, k) => (
                <Carte key={k} carte={c} petite={j.id !== moi || j.mains.length > 1} surbrillance={actif && etat.tour?.main === i} />
              ))}
            </div>
            {m.issue ? (
              <span className={`pastille ${m.issue}`}>
                {LIBELLES_ISSUE[m.issue]}
                {m.rendu && m.rendu > m.mise ? ` +${formatJetons(m.rendu - m.mise)}` : ""}
              </span>
            ) : (
              <span className={`pastille${actif && etat.tour?.main === i ? " tour" : ""}`}>{totalAffiche(m.cartes)}</span>
            )}
          </div>
        ))}
      </div>
      <div className="qui">
        <Avatar config={j.avatar} taille={40} />
        <div>
          <div className="pseudo">
            {j.pseudo}
            {j.id === moi ? " (vous)" : ""}
          </div>
          <div className="mise">
            {j.mains.length > 0 && etat.phase !== "attente" && etat.phase !== "mises"
              ? `Mise ${formatJetons(j.mains.reduce((a, m) => a + m.mise, 0))}`
              : j.mise > 0
                ? `Mise ${formatJetons(j.mise)}`
                : j.connecte ? "Pas de mise" : "Absent"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TableBlackjack({ chemin }: { chemin: string }) {
  const { majSolde, notifier, rafraichir } = useSession();
  const { etat, moi, statut, envoyer } = useRoom<BjEtat, BjMessageClient>(chemin, (m) => notifier(m, true));
  const [jeton, setJeton] = useState<number>(100);
  const [mise, setMise] = useState(0);
  const derniereMise = useRef(0);
  const secondes = useCompteARebours(etat?.echeance ?? null);

  const moiJoueur = etat?.joueurs.find((j) => j.id === moi) ?? null;
  useEffect(() => {
    if (moiJoueur) majSolde(moiJoueur.solde);
  }, [moiJoueur?.solde, majSolde]);
  // Fin de donne : on rafraîchit les gains de saison affichés dans l'en-tête.
  const fin = etat?.joueurs.some((j) => j.mains.some((m) => m.issue)) ?? false;
  useEffect(() => {
    if (fin) void rafraichir();
  }, [fin, rafraichir]);
  // Mise affichée = mise déjà posée côté serveur.
  useEffect(() => {
    if (moiJoueur && moiJoueur.mise > 0) {
      setMise(moiJoueur.mise);
      derniereMise.current = moiJoueur.mise;
    }
  }, [moiJoueur?.mise]);

  if (!etat) {
    return (
      <div className="conteneur" style={{ padding: "60px 20px", textAlign: "center" }}>
        <p className="italique accent" style={{ fontSize: 20 }}>{statut === "perdu" ? "Connexion perdue. Reconnexion…" : "Le croupier vous installe…"}</p>
      </div>
    );
  }

  const { min, max } = etat.limites;
  const peutMiser = (etat.phase === "attente" || etat.phase === "mises") && !!moiJoueur;
  const monTour = etat.tour?.joueurId === moi && etat.phase === "jeu";
  const maMain = monTour && moiJoueur ? moiJoueur.mains[etat.tour!.main] : null;
  const miseServeur = moiJoueur?.mise ?? 0;
  const soldeDispo = (moiJoueur?.solde ?? 0) + miseServeur;
  const places = Array.from({ length: 5 }, (_, i) => etat.joueurs.find((j) => j.place === i) ?? null);

  const ajouter = (v: number) => setMise((m) => Math.min(max, soldeDispo, m + v));
  const poser = (montant: number) => envoyer({ t: "miser", montant });
  const action = (a: BjAction) => envoyer({ t: "action", action: a });
  const rejouer = () => {
    const m = derniereMise.current || mise;
    if (m < min) return;
    if (etat.solo) {
      poser(m);
      envoyer({ t: "distribuer" });
    } else poser(m);
  };

  return (
    <div className="ecran-jeu">
      <div className="conteneur">
        <BarreRoom
          titre={etat.solo ? "Blackjack · table privée" : "Blackjack"}
          code={etat.code}
          detail={`Mise ${formatJetons(min)} à ${formatJetons(max)}${etat.spectateurs ? ` · ${etat.spectateurs} spectateur${etat.spectateurs > 1 ? "s" : ""}` : ""}`}
          statut={statut}
        />
        <div className="table">
          <div className="zone-croupier">
            <div className="cartes ecartees">
              {etat.croupier.length > 0 ? etat.croupier.map((c, i) => <Carte key={i} carte={c} />) : <div style={{ height: 92 }} />}
            </div>
            <div className="etiquette-table">
              Croupier{etat.croupier.length > 0 ? ` · ${totalAffiche(etat.croupier.filter((c): c is NonNullable<typeof c> => c !== null))}` : ""}
            </div>
          </div>
          <div style={{ margin: "14px 0 18px" }}>
            <div className="devise">Le blackjack paie 3 pour 2</div>
            <div className="regle">Le croupier tire jusqu'à 16 et reste à 17</div>
          </div>
          <div className="places">
            {(etat.solo ? etat.joueurs : places).map((j, i) =>
              j ? (
                <Place key={j.id} j={j} etat={etat} moi={moi} />
              ) : (
                <div key={`vide-${i}`} className="place vide">
                  <div className="etiquette-table">Place libre</div>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="remarque" aria-live="polite">{etat.remarque ?? ""}</div>

        {!moiJoueur ? (
          <p className="muet" style={{ textAlign: "center", padding: 16 }}>La table est complète (5 joueurs) : vous regardez la partie.</p>
        ) : monTour && maMain ? (
          <div className="commandes">
            <div className="rangee" style={{ gap: 10 }}>
              <span style={{ fontWeight: 700 }}>À vous{moiJoueur.mains.length > 1 ? ` · main ${etat.tour!.main + 1}` : ""}</span>
              <Compteur secondes={secondes} total={20} />
            </div>
            <div className="actions">
              <button type="button" className="btn" disabled={!peutSeparer(maMain.cartes, maMain.separee) || moiJoueur.mains.length > 1 || moiJoueur.solde < maMain.mise} onClick={() => action("separer")}>Séparer</button>
              <button type="button" className="btn" disabled={!peutDoubler(maMain.cartes) || moiJoueur.solde < maMain.mise} onClick={() => action("doubler")}>Doubler</button>
              <button type="button" className="btn btn-contour" onClick={() => action("rester")}>Rester</button>
              <button type="button" className="btn btn-principal" onClick={() => action("tirer")}>Tirer</button>
            </div>
          </div>
        ) : peutMiser ? (
          <div className="commandes">
            <div className="pile" style={{ gap: 10 }}>
              <div className="jetons-choix" role="group" aria-label="Ajouter des jetons à la mise">
                {VALEURS_JETONS.filter((v) => v <= max).map((v) => (
                  <Jeton key={v} valeur={v} aria-pressed={jeton === v} onClick={() => { setJeton(v); ajouter(v); }} />
                ))}
              </div>
              <div className="rangee" style={{ gap: 12, fontSize: 14 }}>
                <span>
                  Mise : <strong className="num accent" style={{ fontSize: 18 }}>{formatJetons(mise)}</strong>
                </span>
                <button type="button" className="btn-lien" onClick={() => { setMise(0); if (miseServeur > 0) poser(0); }}>Effacer</button>
                {etat.phase === "mises" && !etat.solo && <Compteur secondes={secondes} total={12} />}
              </div>
            </div>
            <div className="actions">
              {etat.solo ? (
                <>
                  {derniereMise.current > 0 && mise === 0 && (
                    <button type="button" className="btn" onClick={rejouer}>Même mise ({formatJetons(derniereMise.current)})</button>
                  )}
                  <button
                    type="button" className="btn btn-principal" disabled={mise < min}
                    onClick={() => {
                      derniereMise.current = mise;
                      if (miseServeur !== mise) poser(mise);
                      envoyer({ t: "distribuer" });
                    }}
                  >
                    Distribuer
                  </button>
                </>
              ) : miseServeur > 0 && miseServeur === mise ? (
                <span className="muet" style={{ alignSelf: "center" }}>Mise posée. La donne part dès que tout le monde a misé.</span>
              ) : (
                <button type="button" className="btn btn-principal" disabled={mise < min} onClick={() => { derniereMise.current = mise; poser(mise); }}>
                  Poser la mise
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="commandes" style={{ justifyContent: "center" }}>
            <span className="muet">
              {etat.phase === "croupier" ? "Le croupier joue…" : etat.tour ? `Au tour de ${etat.joueurs.find((j) => j.id === etat.tour?.joueurId)?.pseudo ?? "…"}` : "…"}
            </span>
            {etat.tour && <Compteur secondes={secondes} total={20} />}
          </div>
        )}
        {mise > 0 && mise < min && peutMiser && <p className="muet" style={{ fontSize: 13 }}>Mise minimum : {formatJetons(min)}.</p>}
      </div>
    </div>
  );
}
