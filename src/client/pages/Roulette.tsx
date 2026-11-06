import { useEffect, useRef, useState } from "react";
import type { RlEtat, RlMessageClient } from "../../shared/protocole";
import { formatJetons } from "../../shared/regles";
import { couleurNumero, type CleMise, miseGagnante, ORDRE_ROUE } from "../../shared/roulette";
import { Avatar } from "../components/Avatar";
import { Compteur, Jeton, libelleJeton, VALEURS_JETONS } from "../components/Elements";
import { useSession } from "../session";
import { useCompteARebours, useRoom } from "../useRoom";
import { BarreRoom } from "./Room";

const PAS = 360 / 37;
const COULEURS_SVG = { rouge: "#b8433b", noir: "#141618", vert: "#1f7a52" };

function Roue({ resultat, enTirage }: { resultat: number | null; enTirage: boolean }) {
  const [rotation, setRotation] = useState(0);
  const precedent = useRef<number | null>(null);
  useEffect(() => {
    if (resultat === null || !enTirage || precedent.current === resultat) return;
    precedent.current = resultat;
    const index = ORDRE_ROUE.indexOf(resultat);
    setRotation((r) => {
      const cible = (360 - index * PAS) % 360;
      const actuel = ((r % 360) + 360) % 360;
      return r + 360 * 6 + ((cible - actuel + 360) % 360);
    });
  }, [resultat, enTirage]);
  useEffect(() => {
    if (!enTirage) precedent.current = null;
  }, [enTirage]);

  const point = (a: number, r: number) => `${(130 + r * Math.sin((a * Math.PI) / 180)).toFixed(2)} ${(130 - r * Math.cos((a * Math.PI) / 180)).toFixed(2)}`;
  return (
    <div className="roue-cadre">
      <svg className="roue" viewBox="0 0 260 260" style={{ transform: `rotate(${rotation}deg)` }} role="img" aria-label="Roue de la roulette">
        <circle cx="130" cy="130" r="129" fill="#1a1d1f" stroke="#c9a45c" strokeWidth="2" />
        {ORDRE_ROUE.map((n, i) => {
          const a1 = i * PAS - PAS / 2;
          const a2 = i * PAS + PAS / 2;
          return (
            <g key={n}>
              <path d={`M130 130 L${point(a1, 118)} A118 118 0 0 1 ${point(a2, 118)} Z`} fill={COULEURS_SVG[couleurNumero(n)]} stroke="#0b0d0e" strokeWidth="0.6" />
              <text x="130" y="24" fill="#f2ede4" fontSize="11" fontFamily="Manrope, sans-serif" fontWeight="700" textAnchor="middle" transform={`rotate(${i * PAS} 130 130)`}>
                {n}
              </text>
            </g>
          );
        })}
        <circle cx="130" cy="130" r="78" fill="#0f3d31" stroke="#0b0d0e" strokeWidth="3" />
        <circle cx="130" cy="130" r="56" fill="#0b0d0e" stroke="#c9a45c" strokeWidth="1.5" />
        {[0, 45, 90, 135].map((a) => (
          <rect key={a} x="127" y="80" width="6" height="100" rx="3" fill="#c9a45c" transform={`rotate(${a} 130 130)`} />
        ))}
        <circle cx="130" cy="130" r="14" fill="#c9a45c" />
      </svg>
      <div className="roue-index" aria-hidden="true" />
    </div>
  );
}

function classeCouleur(n: number) {
  return `${couleurNumero(n)}-bg`;
}

function useEtroit(): boolean {
  const requete = "(max-width: 700px)";
  const [etroit, setEtroit] = useState(() => window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const f = () => setEtroit(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return etroit;
}

interface CaseTapis {
  cle: CleMise;
  libelle: string;
  classe: string;
  h: [string, string]; // [gridColumn, gridRow] disposition horizontale
  v: [string, string]; // disposition verticale (mobile)
  texte?: boolean;
}

function casesTapis(): CaseTapis[] {
  const cases: CaseTapis[] = [{ cle: "plein:0", libelle: "0", classe: "vert-bg", h: ["1", "1 / span 3"], v: ["1 / span 3", "1"] }];
  for (let n = 1; n <= 36; n++) {
    const groupe = Math.ceil(n / 3); // 1..12
    const ligne = 3 - ((n - 1) % 3); // 1 = rangée du haut (3, 6, 9…)
    cases.push({ cle: `plein:${n}`, libelle: String(n), classe: classeCouleur(n), h: [String(groupe + 1), String(ligne)], v: [String(((n - 1) % 3) + 1), String(groupe + 1)] });
  }
  for (let c = 1; c <= 3; c++) {
    cases.push({ cle: `colonne:${c}`, libelle: "2 : 1", classe: "", texte: true, h: ["14", String(4 - c)], v: [String(c), "14"] });
    cases.push({ cle: `douzaine:${c}`, libelle: `${["1re", "2e", "3e"][c - 1]} 12`, classe: "", texte: true, h: [`${(c - 1) * 4 + 2} / span 4`, "4"], v: ["4", `${(c - 1) * 4 + 2} / span 4`] });
  }
  const simples: [CleMise, string, string][] = [["manque", "1-18", ""], ["pair", "Pair", ""], ["rouge", "Rouge", "rouge-bg"], ["noir", "Noir", "noir-bg"], ["impair", "Impair", ""], ["passe", "19-36", ""]];
  simples.forEach(([cle, libelle, classe], i) =>
    cases.push({ cle, libelle, classe, texte: true, h: [`${i * 2 + 2} / span 2`, "5"], v: ["5", `${i * 2 + 2} / span 2`] }),
  );
  return cases;
}
const CASES = casesTapis();

export function TableRoulette({ chemin }: { chemin: string }) {
  const { majSolde, notifier, rafraichir } = useSession();
  const { etat, moi, statut, envoyer } = useRoom<RlEtat, RlMessageClient>(chemin, (m) => notifier(m, true));
  const [jeton, setJeton] = useState(100);
  const secondes = useCompteARebours(etat?.echeance ?? null);
  const etroit = useEtroit();
  const moiJoueur = etat?.joueurs.find((j) => j.id === moi) ?? null;

  useEffect(() => {
    if (moiJoueur) majSolde(moiJoueur.solde);
  }, [moiJoueur?.solde, majSolde]);
  useEffect(() => {
    if (etat?.phase === "resultats") void rafraichir();
  }, [etat?.phase, rafraichir]);

  if (!etat) {
    return (
      <div className="conteneur" style={{ padding: "60px 20px", textAlign: "center" }}>
        <p className="italique accent" style={{ fontSize: 20 }}>{statut === "perdu" ? "Connexion perdue. Reconnexion…" : "Le croupier lustre la bille…"}</p>
      </div>
    );
  }

  const { min, max } = etat.limites;
  const ouvert = etat.phase === "mises" && !!moiJoueur;
  const mesMises = moiJoueur?.mises ?? {};
  const total = Object.values(mesMises).reduce((a, b) => a + b, 0);
  const afficheResultat = etat.phase === "resultats" ? etat.resultat : null;
  const dernier = moiJoueur?.dernier;

  return (
    <div className="ecran-jeu">
      <div className="conteneur">
        <BarreRoom
          titre={etat.nom}
          code={etat.code}
          detail={`Mise ${formatJetons(min)} min. par case · ${formatJetons(max)} max. par tour${etat.spectateurs ? ` · ${etat.spectateurs} spectateur${etat.spectateurs > 1 ? "s" : ""}` : ""}`}
          statut={statut}
        />
        <div className="roulette-haut">
          <Roue resultat={etat.resultat} enTirage={etat.phase === "tirage" || etat.phase === "resultats"} />
          <div className="pile" style={{ gap: 14, minWidth: 220 }}>
            <div className="rangee" style={{ gap: 14 }}>
              {afficheResultat !== null ? (
                <div className={`resultat-rond ${classeCouleur(afficheResultat)}`} aria-live="polite">{afficheResultat}</div>
              ) : (
                <div className="pile" style={{ gap: 4 }}>
                  <div className="surtitre">
                    {etat.phase === "mises" ? "Faites vos jeux" : etat.phase === "tirage" ? "Rien ne va plus" : "En attente de joueurs"}
                  </div>
                  {(etat.phase === "mises" || etat.phase === "tirage") && <Compteur secondes={secondes} total={etat.phase === "mises" ? 20 : 6} />}
                </div>
              )}
              {dernier && etat.phase === "resultats" && (
                <div className="pile" style={{ gap: 2 }}>
                  <div className="surtitre">Votre tour</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 800, color: dernier.rendu > dernier.mise ? "var(--accent)" : "var(--carmin-clair)" }}>
                    {dernier.rendu - dernier.mise > 0 ? "+" : ""}
                    {formatJetons(dernier.rendu - dernier.mise)}
                  </div>
                </div>
              )}
            </div>
            <div className="pile" style={{ gap: 6 }}>
              <div className="surtitre">Derniers numéros</div>
              <div className="historique">
                {etat.historique.length === 0 && <span className="muet" style={{ fontSize: 13 }}>Aucun tirage pour l'instant.</span>}
                {etat.historique.map((n, i) => (
                  <span key={i} className={`histo ${classeCouleur(n)}`}>{n}</span>
                ))}
              </div>
            </div>
            <div className="joueurs-roulette" style={{ justifyContent: "flex-start" }}>
              {etat.joueurs.map((j) => (
                <div key={j.id} className="joueur-roulette">
                  <Avatar config={j.avatar} taille={28} />
                  <span style={{ fontWeight: 700 }}>{j.pseudo}</span>
                  {Object.keys(j.mises).length > 0 && <span className="accent num">{formatJetons(Object.values(j.mises).reduce((a, b) => a + b, 0))}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="remarque" aria-live="polite">{etat.remarque ?? ""}</div>

        <div className={etroit ? "" : "tapis-defile"}>
          <div className={`tapis ${etroit ? "vertical" : "horizontal"}`} role="group" aria-label="Tapis de mises">
            {CASES.map((c) => {
              const [col, row] = etroit ? c.v : c.h;
              const gagnante = afficheResultat !== null && miseGagnante(c.cle, afficheResultat);
              const maMise = mesMises[c.cle];
              return (
                <button
                  key={c.cle}
                  type="button"
                  className={`case-tapis ${c.classe}${c.texte ? " texte" : ""}${gagnante ? " gagnante" : ""}`}
                  style={{ gridColumn: col, gridRow: row }}
                  disabled={!ouvert}
                  aria-label={`Miser ${formatJetons(jeton)} sur ${c.libelle}${maMise ? `, déjà ${formatJetons(maMise)}` : ""}`}
                  onClick={() => envoyer({ t: "miser", cle: c.cle, montant: jeton })}
                >
                  {c.libelle}
                  {maMise ? <span className="ma-mise">{libelleJeton(maMise)}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        {moiJoueur ? (
          <div className="commandes">
            <div className="jetons-choix" role="group" aria-label="Valeur du jeton">
              {VALEURS_JETONS.filter((v) => v >= min && v <= max).map((v) => (
                <Jeton key={v} valeur={v} aria-pressed={jeton === v} onClick={() => setJeton(v)} />
              ))}
            </div>
            <div className="rangee" style={{ gap: 14 }}>
              <span style={{ fontSize: 14 }}>
                Misé ce tour : <strong className="num accent" style={{ fontSize: 18 }}>{formatJetons(total)}</strong>
              </span>
              <button type="button" className="btn btn-petit" disabled={!ouvert || total === 0} onClick={() => envoyer({ t: "annuler" })}>
                Annuler mes mises
              </button>
            </div>
          </div>
        ) : (
          <p className="muet" style={{ textAlign: "center", padding: 16 }}>La table est complète (8 joueurs) : vous regardez la partie.</p>
        )}
        <p className="muet" style={{ fontSize: 12, padding: "4px 0 16px" }}>
          Roulette européenne, un seul zéro. Plein payé 35 pour 1, douzaines et colonnes 2 pour 1, chances simples 1 pour 1 (perdues sur le zéro).
        </p>
      </div>
    </div>
  );
}
