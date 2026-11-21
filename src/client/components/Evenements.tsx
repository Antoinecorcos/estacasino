import { useEffect, useState } from "react";
import type { ConfigAvatar } from "../../shared/avatar";
import { NOMS_JEUX, NOMS_MESURES, type ParamsBoost, type ParamsClassement, type ParamsObjectif, type TypeEvenement } from "../../shared/evenements";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { Lien } from "../router";
import { useSession } from "../session";
import { Avatar } from "./Avatar";

// Affichage des événements côté joueur. Tant qu'aucun événement n'est publié, ces composants
// ne rendent rien et ne font aucune requête : l'interface reste exactement la même.

interface VueEvenement {
  id: number;
  type: TypeEvenement;
  titre: string;
  description: string;
  debut: number;
  fin: number;
  enCours: boolean;
  test: boolean;
  boost?: ParamsBoost;
  objectif?: ParamsObjectif & { total: number; maContribution: number; atteint: boolean; recupere: boolean };
  classement?: ParamsClassement & {
    lignes: { rang: number; pseudo: string; avatar: ConfigAvatar; valeur: number }[];
    moi: { rang: number; valeur: number } | null;
    cloture: boolean;
    maRecompense: number | null;
  };
  calendrier?: { recompenses: number[]; jour: number; recuperes: number[] };
}

export function restant(ms: number): string {
  if (ms <= 0) return "terminé";
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

function useMaintenant(periode = 30_000): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), periode);
    return () => clearInterval(id);
  }, [periode]);
  return t;
}

/** Fin bandeau sous l'en-tête, sur les pages hors jeu, pendant un événement en cours. */
export function BandeauEvenement({ chemin }: { chemin: string }) {
  const { moi } = useSession();
  const t = useMaintenant();
  const actif = moi?.evenements?.find((e) => e.debut <= t && t < e.fin);
  if (!actif || chemin === "/") return null;
  return (
    <Lien href="/" className="bandeau-evenement">
      <span className="bandeau-etoile" aria-hidden="true">✦</span>
      <strong>{actif.titre}</strong>
      <span className="muet">· encore {restant(actif.fin - t)}</span>
      {actif.test && <span className="badge-test">Test admin</span>}
    </Lien>
  );
}

/** Section « Événements » du lobby. */
export function EvenementsLobby() {
  const { moi, notifier, majSolde, rafraichir } = useSession();
  const [liste, setListe] = useState<VueEvenement[] | null>(null);
  const t = useMaintenant();
  const nb = moi?.evenements?.length ?? 0;
  const charger = () => void api<{ evenements: VueEvenement[] }>("/evenements").then((r) => setListe(r.evenements)).catch(() => setListe([]));
  useEffect(() => {
    if (nb > 0) charger();
    else setListe(null);
  }, [nb]);
  if (!nb || !liste?.length) return null;

  const recuperer = async (e: VueEvenement) => {
    try {
      const r = await api<{ montant: number; solde: number }>(`/evenements/${e.id}/recuperer`, { corps: {} });
      majSolde(r.solde);
      notifier(`+${formatJetons(r.montant)} jetons · ${e.titre}`);
      charger();
      void rafraichir();
    } catch (err) {
      notifier((err as Error).message, true);
    }
  };

  return (
    <section className="pile" style={{ gap: 12 }} aria-label="Événements">
      <h2 className="surtitre">Événements</h2>
      <div className="grille-evenements">
        {liste.map((e) => (
          <article key={e.id} className={`carte-ui evenement evt-${e.type}${e.enCours ? "" : " fini"}`}>
            <div className="evt-entete">
              <h3>{e.titre}</h3>
              <span className="evt-temps">{e.enCours ? `encore ${restant(e.fin - t)}` : "terminé"}</span>
            </div>
            {e.test && <span className="badge-test" style={{ alignSelf: "flex-start" }}>Test : visible des admins seulement</span>}
            {e.description && <p className="muet evt-description">{e.description}</p>}

            {e.boost && (
              <div className="rangee" style={{ gap: 8 }}>
                {e.boost.multDefis > 1 && <span className="evt-multi">Défis ×{e.boost.multDefis}</span>}
                {e.boost.multBonus > 1 && <span className="evt-multi">Bonus du jour ×{e.boost.multBonus}</span>}
              </div>
            )}

            {e.objectif && (
              <div className="pile" style={{ gap: 8 }}>
                <div className="evt-jauge" role="progressbar" aria-valuenow={e.objectif.total} aria-valuemin={0} aria-valuemax={e.objectif.cible}>
                  <i style={{ width: `${Math.min(100, (100 * e.objectif.total) / e.objectif.cible)}%` }} />
                </div>
                <div className="rangee evt-ligne">
                  <span className="num">
                    <strong>{formatJetons(Math.min(e.objectif.total, e.objectif.cible))}</strong> / {formatJetons(e.objectif.cible)} {NOMS_MESURES[e.objectif.mesure]}
                    {e.objectif.jeu !== "tous" ? ` (${NOMS_JEUX[e.objectif.jeu]})` : ""}
                  </span>
                  <span className="muet">Vous : {formatJetons(e.objectif.maContribution)}</span>
                </div>
                {e.objectif.recupere ? (
                  <span className="accent">Récompense récupérée. Merci pour l'équipe !</span>
                ) : e.objectif.atteint && e.objectif.maContribution > 0 ? (
                  <button type="button" className="btn btn-principal btn-petit" style={{ alignSelf: "flex-start" }} onClick={() => void recuperer(e)}>
                    Récupérer {formatJetons(e.objectif.recompense)} jetons
                  </button>
                ) : (
                  <span className="muet" style={{ fontSize: 13 }}>
                    Objectif atteint : {formatJetons(e.objectif.recompense)} jetons pour chaque participant.
                  </span>
                )}
              </div>
            )}

            {e.classement && (
              <div className="pile" style={{ gap: 8 }}>
                <div className="evt-podium muet">
                  {e.classement.recompenses.slice(0, 3).map((r, i) => (
                    <span key={i}>{i + 1}{i === 0 ? "er" : "e"} : {formatJetons(r)}</span>
                  ))}
                  {e.classement.recompenses.length > 3 && <span>… jusqu'au {e.classement.recompenses.length}e</span>}
                </div>
                {e.classement.lignes.length === 0 ? (
                  <p className="muet" style={{ fontSize: 13, margin: 0 }}>Personne n'est encore classé : la première place est libre.</p>
                ) : (
                  <ol className="evt-liste">
                    {e.classement.lignes.slice(0, 5).map((l) => (
                      <li key={l.rang} className={l.pseudo === moi?.pseudo ? "moi" : ""}>
                        <span className="rang">{l.rang}</span>
                        <Avatar config={l.avatar} taille={24} />
                        <span className="pseudo">{l.pseudo}</span>
                        <span className="num">{e.classement!.mesure === "gains" && l.valeur > 0 ? "+" : ""}{formatJetons(l.valeur)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <span className="muet" style={{ fontSize: 13 }}>
                  {e.classement.maRecompense
                    ? `Bravo : ${formatJetons(e.classement.maRecompense)} jetons gagnés.`
                    : e.classement.moi
                      ? `Votre rang : ${e.classement.moi.rang}e (${formatJetons(e.classement.moi.valeur)})`
                      : `Classé sur les ${NOMS_MESURES[e.classement.mesure]}${e.classement.jeu !== "tous" ? ` (${NOMS_JEUX[e.classement.jeu]})` : ""}.`}
                </span>
              </div>
            )}

            {e.calendrier && (
              <div className="pile" style={{ gap: 10 }}>
                <div className="evt-cases">
                  {e.calendrier.recompenses.map((r, i) => {
                    const ouvert = e.calendrier!.recuperes.includes(i);
                    const etat = ouvert ? "ouverte" : i === e.calendrier!.jour ? "aujourdhui" : i < e.calendrier!.jour ? "passee" : "future";
                    return (
                      <span key={i} className={`evt-case ${etat}`} title={ouvert ? `${formatJetons(r)} jetons` : undefined}>
                        {ouvert ? "✓" : i + 1}
                      </span>
                    );
                  })}
                </div>
                {e.enCours && e.calendrier.jour >= 0 && e.calendrier.jour < e.calendrier.recompenses.length && !e.calendrier.recuperes.includes(e.calendrier.jour) ? (
                  <button type="button" className="btn btn-principal btn-petit" style={{ alignSelf: "flex-start" }} onClick={() => void recuperer(e)}>
                    Ouvrir la case du jour
                  </button>
                ) : (
                  <span className="muet" style={{ fontSize: 13 }}>{e.enCours ? "Case du jour ouverte. Rendez-vous demain !" : "Le calendrier est terminé."}</span>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
