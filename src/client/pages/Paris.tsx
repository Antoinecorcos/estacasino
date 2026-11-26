import { useEffect, useState } from "react";
import { type Choix, COTE_PARIABLE_MIN, coteDe, gainPotentiel, libelleChoix, PARI_MIN, type Pari, pariable, type Rencontre } from "../../shared/paris";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { Page } from "../components/Elements";
import { useSession } from "../session";

// Paris sportifs (option « fantôme », visible seulement quand elle est activée).

interface Donnees {
  rencontres: Rencontre[];
  mesParis: Pari[];
  miseMax: number;
  test: boolean;
}
type LigneHistorique = Pari & { equipe1: string; equipe2: string; sport: string; competition: string; debut: number; resultat: Choix | null };

const cote = (x: number) => x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const heure = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
function jour(ms: number): string {
  const d = new Date(ms);
  const auj = new Date();
  const demain = new Date(Date.now() + 86_400_000);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === demain.toDateString()) return "Demain";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
const STATUTS: Record<Pari["statut"], string> = { en_cours: "En cours", gagne: "Gagné", perdu: "Perdu", rembourse: "Remboursé" };

export function PageParis() {
  const { notifier, majSolde } = useSession();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [onglet, setOnglet] = useState<"avenir" | "mes">("avenir");
  const [historique, setHistorique] = useState<LigneHistorique[] | null>(null);
  const [selection, setSelection] = useState<{ r: Rencontre; choix: Choix } | null>(null);
  const [mise, setMise] = useState("100");
  const [envoi, setEnvoi] = useState(false);
  const charger = () => void api<Donnees>("/paris/rencontres").then(setDonnees).catch((e: Error) => notifier(e.message, true));
  useEffect(charger, []);
  useEffect(() => {
    if (onglet === "mes") void api<{ paris: LigneHistorique[] }>("/paris/historique").then((r) => setHistorique(r.paris));
  }, [onglet]);

  const parier = async () => {
    if (!selection) return;
    setEnvoi(true);
    try {
      const r = await api<{ solde: number; gainPotentiel: number }>("/paris/parier", { corps: { rencontre: selection.r.id, choix: selection.choix, mise: Number(mise) } });
      majSolde(r.solde);
      notifier(`Pari enregistré : ${formatJetons(Number(mise))} sur ${libelleChoix(selection.r, selection.choix)}. Gain possible : ${formatJetons(r.gainPotentiel)}.`);
      setSelection(null);
      charger();
    } catch (e) {
      notifier((e as Error).message, true);
    } finally {
      setEnvoi(false);
    }
  };

  const now = Date.now();
  const parJour = new Map<string, Rencontre[]>();
  for (const r of donnees?.rencontres ?? []) parJour.set(jour(r.debut), [...(parJour.get(jour(r.debut)) ?? []), r]);
  const coteSel = selection ? coteDe(selection.r, selection.choix) ?? 0 : 0;
  const miseNum = Number(mise) || 0;

  return (
    <Page>
      <div className="pile" style={{ gap: 22, paddingBottom: selection ? 150 : 0 }}>
        <div className="pile" style={{ gap: 8 }}>
          <div className="surtitre">Paris sportifs</div>
          <h1 style={{ fontSize: 40 }}>Le comptoir des paris</h1>
          <p className="muet" style={{ maxWidth: 640, margin: 0 }}>
            Pariez vos jetons sur les vrais matchs. La cote est figée au moment du pari, et les paris ferment au coup d'envoi. On ne
            parie pas sous {cote(COTE_PARIABLE_MIN)}, et c'est 5 000 jetons au plus par match.
          </p>
          {donnees?.test && <span className="badge-test" style={{ alignSelf: "flex-start" }}>Test : visible des admins seulement</span>}
        </div>

        <div className="onglets" role="group" aria-label="Affichage">
          <button type="button" aria-pressed={onglet === "avenir"} onClick={() => setOnglet("avenir")}>Rencontres</button>
          <button type="button" aria-pressed={onglet === "mes"} onClick={() => setOnglet("mes")}>Mes paris</button>
        </div>

        {onglet === "avenir" && (
          <>
            {donnees && donnees.rencontres.length === 0 && <p className="italique accent" style={{ fontSize: 18 }}>Pas de rencontre ouverte pour le moment. Revenez bientôt !</p>}
            {[...parJour].map(([j, liste]) => (
              <section key={j} className="pile" style={{ gap: 10 }}>
                <h2 className="surtitre">{j}</h2>
                <div className="grille-rencontres">
                  {liste.map((r) => {
                    const ferme = r.statut !== "ouverte" || now >= r.debut;
                    const miens = donnees!.mesParis.filter((p) => p.rencontre_id === r.id);
                    const choix: Choix[] = r.coteN ? ["1", "N", "2"] : ["1", "2"];
                    return (
                      <article key={r.id} className={`carte-ui rencontre${ferme ? " fermee" : ""}`}>
                        <div className="rencontre-tete">
                          <span>{r.sport}{r.competition ? ` · ${r.competition}` : ""}</span>
                          <span className="rencontre-etat">
                            {r.statut === "reglee" ? `Terminé · ${libelleChoix(r, r.resultat!)}` : r.statut === "annulee" ? "Annulé · mises rendues" : now >= r.debut ? "En cours · paris fermés" : heure(r.debut)}
                          </span>
                        </div>
                        <div className="rencontre-equipes">
                          <strong>{r.equipe1}</strong>
                          <span className="muet">contre</span>
                          <strong>{r.equipe2}</strong>
                        </div>
                        <div className={`rencontre-cotes n${choix.length}`}>
                          {choix.map((c) => {
                            const actif = selection?.r.id === r.id && selection.choix === c;
                            const gagnant = r.statut === "reglee" && r.resultat === c;
                            const bloquee = !pariable(coteDe(r, c));
                            return (
                              <button
                                key={c} type="button" disabled={ferme || bloquee} aria-pressed={actif}
                                title={bloquee ? `Cote trop faible : on ne parie pas sous ${cote(COTE_PARIABLE_MIN)}` : undefined}
                                className={`cote${gagnant ? " gagnante" : ""}`}
                                onClick={() => setSelection(actif ? null : { r, choix: c })}
                              >
                                <span>{c === "N" ? "Nul" : c === "1" ? r.equipe1 : r.equipe2}</span>
                                <b className="num">{cote(coteDe(r, c)!)}</b>
                              </button>
                            );
                          })}
                        </div>
                        {miens.map((p) => (
                          <div key={p.id} className="mon-pari">
                            Vous : {formatJetons(p.mise)} sur {libelleChoix(r, p.choix)} à {cote(p.cote)}
                            {p.statut === "en_cours" ? ` · gain possible ${formatJetons(gainPotentiel(p.mise, p.cote))}` : ` · ${STATUTS[p.statut]}${p.gain ? ` (+${formatJetons(p.gain)})` : ""}`}
                          </div>
                        ))}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        {onglet === "mes" && (
          <section className="carte-ui encart">
            {!historique ? (
              <p className="muet">Chargement…</p>
            ) : historique.length === 0 ? (
              <p className="muet">Aucun pari pour l'instant.</p>
            ) : (
              historique.map((p) => (
                <div key={p.id} className="ligne-pari">
                  <div className="pile" style={{ gap: 2, minWidth: 0 }}>
                    <strong>{p.equipe1} – {p.equipe2}</strong>
                    <span className="muet" style={{ fontSize: 13 }}>
                      {libelleChoix(p, p.choix)} à {cote(p.cote)} · {formatJetons(p.mise)} jetons · {new Date(p.debut).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <span className={`statut-pari ${p.statut}`}>{STATUTS[p.statut]}{p.statut === "gagne" ? ` +${formatJetons(p.gain)}` : ""}</span>
                </div>
              ))
            )}
          </section>
        )}

        <p className="muet" style={{ fontSize: 13 }}>
          Jetons fictifs, sans aucune valeur : on ne gagne jamais d'argent. Les cotes sont celles d'Estacasino. Résultat au coup
          de sifflet final du temps réglementaire (sans prolongations ni tirs au but) ; une rencontre annulée ou reportée est remboursée.
        </p>
      </div>

      {selection && (
        <div className="bulletin" role="dialog" aria-label="Votre pari">
          <div className="bulletin-int">
            <div className="pile" style={{ gap: 2, minWidth: 0 }}>
              <span className="muet" style={{ fontSize: 12 }}>{selection.r.equipe1} – {selection.r.equipe2}</span>
              <strong>{libelleChoix(selection.r, selection.choix)} · cote {cote(coteSel)}</strong>
            </div>
            <div className="rangee" style={{ gap: 6, flexWrap: "nowrap" }}>
              <input className="input" inputMode="numeric" aria-label="Mise" style={{ width: 110, height: 40 }} value={mise} onChange={(e) => setMise(e.target.value.replace(/\D/g, ""))} />
              {[100, 500, 1000].map((v) => (
                <button key={v} type="button" className="btn btn-petit" onClick={() => setMise(String(v))}>{formatJetons(v)}</button>
              ))}
              <button type="button" className="btn btn-petit" onClick={() => setMise(String(donnees?.miseMax ?? 1000))}>Max</button>
            </div>
            <div className="pile" style={{ gap: 2, alignItems: "flex-end" }}>
              <span className="muet" style={{ fontSize: 12 }}>Gain possible</span>
              <b className="num accent">{formatJetons(gainPotentiel(miseNum, coteSel))}</b>
            </div>
            <div className="rangee" style={{ gap: 6 }}>
              <button type="button" className="btn btn-principal" disabled={envoi || miseNum < PARI_MIN} onClick={() => void parier()}>
                {envoi ? "…" : `Parier ${formatJetons(miseNum)}`}
              </button>
              <button type="button" className="btn" onClick={() => setSelection(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
