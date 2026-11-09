import { useEffect, useRef, useState } from "react";
import type { RlEtat, RlMessageClient } from "../../shared/protocole";
import { formatJetons } from "../../shared/regles";
import { couleurNumero, type CleMise, miseGagnante } from "../../shared/roulette";
import { trouverTheme } from "../../shared/themes";
import { Avatar } from "../components/Avatar";
import { useAnnonceDefi } from "../components/Defis";
import { BoutonReactions, BulleReaction } from "../components/Reactions";
import { Compteur, Jeton, libelleJeton, VALEURS_JETONS } from "../components/Elements";
import { celebrer, volerJeton } from "../fx/effets";
import { sons } from "../fx/sons";
import { useSession } from "../session";
import { useThemeRoom } from "../theme";
import { creerRoue, type Roue } from "../trois/roue";
import { useCompteARebours, useEtroit, useRoom } from "../useRoom";
import { BarreRoom } from "./Room";

const classeCouleur = (n: number) => `${couleurNumero(n)}-bg`;
const NOM_COULEUR = { rouge: "rouge", noir: "noir", vert: "zéro" } as const;

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
    const groupe = Math.ceil(n / 3);
    const ligne = 3 - ((n - 1) % 3);
    cases.push({ cle: `plein:${n}`, libelle: String(n), classe: classeCouleur(n), h: [String(groupe + 1), String(ligne)], v: [String(((n - 1) % 3) + 1), String(groupe + 1)] });
  }
  for (let c = 1; c <= 3; c++) {
    cases.push({ cle: `colonne:${c}`, libelle: "2 : 1", classe: "", texte: true, h: ["14", String(4 - c)], v: [String(c), "14"] });
    cases.push({ cle: `douzaine:${c}`, libelle: `${["1re", "2e", "3e"][c - 1]} 12`, classe: "", texte: true, h: [`${(c - 1) * 4 + 2} / span 4`, "4"], v: ["4", `${(c - 1) * 4 + 2} / span 4`] });
  }
  const simples: [CleMise, string, string][] = [["manque", "1-18", ""], ["pair", "Pair", ""], ["rouge", "Rouge", "rouge-bg"], ["noir", "Noir", "noir-bg"], ["impair", "Impair", ""], ["passe", "19-36", ""]];
  simples.forEach(([cle, libelle, classe], i) => cases.push({ cle, libelle, classe, texte: true, h: [`${i * 2 + 2} / span 2`, "5"], v: ["5", `${i * 2 + 2} / span 2`] }));
  return cases;
}
const CASES = casesTapis();
const selecteurCase = (cle: CleMise) => `[data-cle="${cle}"]`;

export function TableRoulette({ chemin }: { chemin: string }) {
  const { moi: profil, majSolde, notifier, rafraichir } = useSession();
  const annoncerDefi = useAnnonceDefi();
  const { etat, moi, statut, envoyer, reactions, reagir } = useRoom<RlEtat, RlMessageClient>(chemin, (m) => notifier(m, true), annoncerDefi);
  const [jeton, setJeton] = useState(100);
  const [vu, setVu] = useState<number | null>(null); // numéro affiché une fois la bille arrêtée
  const secondes = useCompteARebours(etat?.echeance ?? null);
  const etroit = useEtroit();
  const hoteRoue = useRef<HTMLDivElement>(null);
  const roue = useRef<Roue | null>(null);
  const historiqueMises = useRef<{ cle: CleMise; montant: number }[]>([]);
  const dernieresMises = useRef<Record<CleMise, number>>({});
  const tirageAnime = useRef<string>("");
  const theme = trouverTheme(etat?.theme ?? profil?.theme);
  useThemeRoom(etat?.theme, profil?.theme);
  const moiJoueur = etat?.joueurs.find((j) => j.id === moi) ?? null;

  useEffect(() => {
    if (moiJoueur) majSolde(moiJoueur.solde);
  }, [moiJoueur?.solde, majSolde]);

  // La roue (3D si possible), créée une seule fois.
  const pret = !!etat;
  useEffect(() => {
    if (!pret || !hoteRoue.current) return;
    let annule = false;
    void creerRoue(hoteRoue.current, theme).then((r) => {
      if (annule) r.detruire();
      else roue.current = r;
    });
    return () => {
      annule = true;
      roue.current?.detruire();
      roue.current = null;
    };
  }, [pret]);
  useEffect(() => roue.current?.theme(theme), [theme]);

  // Tirage : la bille roule jusqu'au numéro annoncé par le serveur.
  const phase = etat?.phase;
  const resultat = etat?.resultat ?? null;
  useEffect(() => {
    if (phase === "mises") {
      setVu(null);
      roue.current?.surbrillance(null);
      historiqueMises.current = [];
      return;
    }
    if (phase !== "tirage" && phase !== "resultats") return;
    if (resultat === null) return;
    if (phase === "tirage") {
      // Un même tirage n'est animé qu'une fois (l'état est rediffusé à chaque mise d'un autre joueur).
      const cle = `${resultat}@${etat?.historique.length}`;
      if (tirageAnime.current === cle) return;
      tirageAnime.current = cle;
      // Sur téléphone, on ramène la roue à l'écran pour suivre la bille.
      if (window.matchMedia("(max-width: 700px)").matches) hoteRoue.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (moiJoueur && Object.keys(moiJoueur.mises).length) dernieresMises.current = { ...moiJoueur.mises };
      const reste = (etat?.echeance ?? Date.now()) - Date.now() - 150;
      const lancer = () =>
        void roue.current?.lancer(resultat, reste).then(() => {
          setVu(resultat);
          roue.current?.surbrillance(resultat);
        });
      if (roue.current) lancer();
      else setTimeout(lancer, 400);
    } else {
      setVu(resultat);
      roue.current?.surbrillance(resultat);
    }
  }, [phase, resultat]);

  // Résultat : jetons gagnants vers le solde, célébration.
  useEffect(() => {
    if (phase !== "resultats" || !moiJoueur?.dernier || resultat === null) return;
    const { mise, rendu } = moiJoueur.dernier;
    const net = rendu - mise;
    const t = setTimeout(() => {
      const gagnantes = Object.keys(dernieresMises.current).filter((c) => miseGagnante(c, resultat));
      gagnantes.slice(0, 8).forEach((c, i) => void volerJeton(selecteurCase(c), "#solde-total", { valeur: dernieresMises.current[c], delai: i * 60, duree: 650 }));
      if (net > 0) celebrer(net, mise, ".resultat-bulle", resultat !== 0 && gagnantes.some((c) => c.startsWith("plein:")) ? "Plein !" : undefined);
      else if (net < 0) sons.perte();
      else if (rendu > 0) sons.egalite();
      void rafraichir();
    }, 250);
    return () => clearTimeout(t);
  }, [phase, resultat, moiJoueur?.dernier?.mise, moiJoueur?.dernier?.rendu]);

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
  // Mises des autres joueurs, case par case (visibles de tous, comme sur un vrai tapis).
  const autresMises: Record<CleMise, { total: number; joueurs: string[] }> = {};
  for (const j of etat.joueurs) {
    if (j.id === moi) continue;
    for (const [cle, m] of Object.entries(j.mises)) {
      const a = (autresMises[cle] ??= { total: 0, joueurs: [] });
      a.total += m;
      a.joueurs.push(j.pseudo);
    }
  }
  const total = Object.values(mesMises).reduce((a, b) => a + b, 0);
  const totalPrecedent = Object.values(dernieresMises.current).reduce((a, b) => a + b, 0);
  const comptes = { rouge: 0, noir: 0, vert: 0 };
  etat.historique.forEach((n) => comptes[couleurNumero(n)]++);
  const dernier = moiJoueur?.dernier;

  const miser = (cle: CleMise, montant: number, depuis?: Element | null) => {
    if (!ouvert) return;
    sons.jeton();
    if (depuis !== undefined) void volerJeton(depuis ?? ".jetons-choix [aria-pressed=true]", selecteurCase(cle), { valeur: montant, duree: 380 });
    historiqueMises.current.push({ cle, montant });
    envoyer({ t: "miser", cle, montant });
  };
  const annulerDerniere = () => {
    const d = historiqueMises.current.pop();
    if (d) envoyer({ t: "retirer", cle: d.cle, montant: d.montant });
  };
  const rejouer = () => Object.entries(dernieresMises.current).forEach(([cle, m]) => miser(cle, m, null));
  const doubler = () => Object.entries(mesMises).forEach(([cle, m]) => miser(cle, m, null));
  const libellePhase =
    etat.phase === "mises" ? "Faites vos jeux" : etat.phase === "tirage" ? "Rien ne va plus" : etat.phase === "resultats" ? "Les jeux sont faits" : "En attente de joueurs";

  return (
    <div className={`ecran-jeu ecran-roulette${etat.phase === "tirage" ? " en-tirage" : ""}`}>
      <div className="conteneur">
        <BarreRoom
          titre={etat.nom}
          code={etat.code}
          detail={`Mise ${formatJetons(min)} min. par case · ${formatJetons(max)} max. par tour${etat.spectateurs ? ` · ${etat.spectateurs} spectateur${etat.spectateurs > 1 ? "s" : ""}` : ""}`}
          statut={statut}
        />
        <div className="roulette-haut">
          <div className="carte-ui panneau-roue">
            {!etat.solo && moiJoueur && <BoutonReactions reagir={reagir} className="reactions-roue" />}
            {reactions.length > 0 && (
              <div className="pile-reactions">
                {reactions.map((r) => (
                  <BulleReaction key={r.id} reaction={r} avecPseudo />
                ))}
              </div>
            )}
            <div className="cadre-roue" ref={hoteRoue}>
              {vu !== null && (
                <div key={`${vu}-${etat.historique.length}`} className={`resultat-bulle ${classeCouleur(vu)}`} aria-live="polite">
                  {vu}
                </div>
              )}
            </div>
            <div className="historique" aria-label="Derniers numéros">
              {etat.historique.length === 0 && <span className="muet" style={{ fontSize: 13 }}>Les numéros sortis s'afficheront ici.</span>}
              {etat.historique.map((n, i) => (
                <span key={`${etat.historique.length - i}`} className={`histo ${classeCouleur(n)}${i === 0 && vu !== null ? " frais" : ""}`}>{n}</span>
              ))}
            </div>
            {etat.historique.length > 0 && (
              <div className="tendance">
                <div className="barre-tendance" aria-hidden="true">
                  {(["rouge", "vert", "noir"] as const).map((c) => (comptes[c] ? <i key={c} className={`${c}-bg`} style={{ flexGrow: comptes[c] }} /> : null))}
                </div>
                <div className="rangee muet" style={{ justifyContent: "space-between", fontSize: 12 }}>
                  <span>Rouge <b className="num">{comptes.rouge}</b></span>
                  <span>Zéro <b className="num">{comptes.vert}</b></span>
                  <span>Noir <b className="num">{comptes.noir}</b></span>
                </div>
              </div>
            )}
          </div>

          <div className="carte-ui panneau-mises">
            <div className="rangee" style={{ justifyContent: "space-between", gap: 10 }}>
              <div className="pile" style={{ gap: 2 }}>
                <div className="surtitre">{libellePhase}</div>
                <h2 style={{ fontSize: 26 }}>Roulette européenne</h2>
              </div>
              {!etat.solo && (etat.phase === "mises" || etat.phase === "tirage") && <Compteur secondes={secondes} total={etat.phase === "mises" ? 18 : 8} />}
            </div>
            <div className="pile" style={{ gap: 8 }}>
              <div className="surtitre">Valeur du jeton · ajoutée à chaque clic</div>
              <div className="jetons-choix" role="group" aria-label="Valeur du jeton">
                {VALEURS_JETONS.filter((v) => v >= min && v <= max).map((v) => (
                  <Jeton key={v} valeur={v} aria-pressed={jeton === v} onClick={() => { sons.jeton(); setJeton(v); }} />
                ))}
              </div>
            </div>
            <div className="rangee" style={{ gap: 28 }}>
              <div className="stat"><span className="surtitre">Mise totale</span><b className="num accent">{formatJetons(total)}</b></div>
              <div className="stat">
                <span className="surtitre">Dernier résultat</span>
                <b>{etat.historique[0] !== undefined && etat.phase !== "tirage" ? `${etat.historique[0]} ${NOM_COULEUR[couleurNumero(etat.historique[0])]}` : "—"}</b>
              </div>
              {dernier && etat.phase !== "tirage" && (
                <div className="stat">
                  <span className="surtitre">Votre tour</span>
                  <b className="num" style={{ color: dernier.rendu > dernier.mise ? "var(--accent)" : dernier.rendu < dernier.mise ? "var(--carmin-clair)" : undefined }}>
                    {dernier.rendu - dernier.mise > 0 ? "+" : ""}
                    {formatJetons(dernier.rendu - dernier.mise)}
                  </b>
                </div>
              )}
            </div>
            <div className="rangee" style={{ gap: 8 }}>
              <button type="button" className="btn btn-petit" disabled={!ouvert || total === 0} onClick={annulerDerniere}>Annuler</button>
              <button type="button" className="btn btn-petit" disabled={!ouvert || total === 0} onClick={() => envoyer({ t: "annuler" })}>Effacer</button>
              <button type="button" className="btn btn-petit" disabled={!ouvert || total > 0 || totalPrecedent === 0} onClick={rejouer}>
                Rejouer{totalPrecedent ? ` (${formatJetons(totalPrecedent)})` : ""}
              </button>
              <button type="button" className="btn btn-petit" disabled={!ouvert || total === 0 || total * 2 > max} onClick={doubler}>×2</button>
            </div>
            {etat.solo ? (
              <button type="button" className="btn btn-principal btn-geant respire" disabled={!ouvert || total === 0} onClick={() => envoyer({ t: "lancer" })}>
                {etat.phase === "tirage" ? "La bille tourne…" : "Lancer la bille"}
              </button>
            ) : (
              <div className="joueurs-roulette">
                {etat.joueurs.map((j) => (
                  <div key={j.id} className="joueur-roulette">
                    <Avatar config={j.avatar} taille={28} />
                    <span style={{ fontWeight: 700 }}>{j.id === moi ? "Vous" : j.pseudo}</span>
                    {Object.keys(j.mises).length > 0 && <span className="accent num">{formatJetons(Object.values(j.mises).reduce((a, b) => a + b, 0))}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="remarque" aria-live="polite">{etat.remarque ?? ""}</div>

        <div className={`zone-tapis${etroit ? "" : " tapis-defile"}`}>
          <div className={`tapis ${etroit ? "vertical" : "horizontal"}`} role="group" aria-label="Tapis de mises">
            {CASES.map((c) => {
              const [col, row] = etroit ? c.v : c.h;
              const gagnante = vu !== null && etat.phase !== "mises" && miseGagnante(c.cle, vu);
              const maMise = mesMises[c.cle];
              return (
                <button
                  key={c.cle}
                  type="button"
                  data-cle={c.cle}
                  className={`case-tapis ${c.classe}${c.texte ? " texte" : ""}${gagnante ? " gagnante" : ""}`}
                  style={{ gridColumn: col, gridRow: row }}
                  disabled={!ouvert}
                  aria-label={`Miser ${formatJetons(jeton)} sur ${c.libelle}${maMise ? `, déjà ${formatJetons(maMise)}` : ""}${autresMises[c.cle] ? `, autres joueurs : ${formatJetons(autresMises[c.cle].total)}` : ""}`}
                  title={autresMises[c.cle] ? `${autresMises[c.cle].joueurs.join(", ")} : ${formatJetons(autresMises[c.cle].total)}` : undefined}
                  onClick={() => miser(c.cle, jeton)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (ouvert && maMise) envoyer({ t: "retirer", cle: c.cle, montant: maMise });
                  }}
                >
                  {c.libelle}
                  {maMise ? <span key={maMise} className="ma-mise">{libelleJeton(maMise)}</span> : null}
                  {autresMises[c.cle] ? (
                    <span key={`a${autresMises[c.cle].total}`} className="mises-autres" aria-hidden="true">
                      {libelleJeton(autresMises[c.cle].total)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        {!moiJoueur && <p className="muet" style={{ textAlign: "center", padding: 16 }}>La table est complète (8 joueurs) : vous regardez la partie.</p>}
        <p className="muet" style={{ fontSize: 12, padding: "8px 0 16px" }}>
          Plein payé 35 pour 1, douzaines et colonnes 2 pour 1, chances simples 1 pour 1 (perdues sur le zéro). Clic droit sur une case : retirer sa mise.
        </p>
      </div>
    </div>
  );
}
