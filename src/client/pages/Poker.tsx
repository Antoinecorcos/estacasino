import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Carte as TCarte } from "../../shared/cartes";
import { libelleProvisoire, meilleureMain } from "../../shared/poker";
import type { PkAction, PkEtat, PkJoueur, PkMessageClient } from "../../shared/protocole";
import { formatJetons } from "../../shared/regles";
import { trouverTheme } from "../../shared/themes";
import { type CarteSuivie, useCartesPosees } from "../cartesPosees";
import { Avatar } from "../components/Avatar";
import { useAnnonceDefi } from "../components/Defis";
import { Carte, Compteur } from "../components/Elements";
import { BoutonReactions, BulleReaction } from "../components/Reactions";
import { celebrer, secouer, volerJeton } from "../fx/effets";
import { sons } from "../fx/sons";
import { useSession } from "../session";
import { useThemeRoom } from "../theme";
import { creerTable3D, type Table3D } from "../trois/table";
import { type Reaction, useCompteARebours, useEtroit, useRoom } from "../useRoom";
import { BarreRoom } from "./Room";

/** Places affichées autour de l'ovale ; la place 0 (en bas, au centre) est toujours la vôtre. */
const PLACES = [
  { x: 50, y: 80 },
  { x: 13, y: 62 },
  { x: 13, y: 22 },
  { x: 50, y: 5 },
  { x: 87, y: 22 },
  { x: 87, y: 62 },
];
const PLACES_MOBILE = [
  { x: 50, y: 82 },
  { x: 18, y: 64 },
  { x: 18, y: 24 },
  { x: 50, y: 4 },
  { x: 82, y: 24 },
  { x: 82, y: 64 },
];
const CENTRE = { x: 50, y: 44 };
const versCentre = (p: { x: number; y: number }, f: number) => ({ x: p.x + (CENTRE.x - p.x) * f, y: p.y + (CENTRE.y - p.y) * f });

const CLE_AIDE = "esta-aide-poker";
function useAide(): [boolean, () => void] {
  const [aide, setAide] = useState(() => {
    try {
      return localStorage.getItem(CLE_AIDE) !== "0";
    } catch {
      return true;
    }
  });
  return [
    aide,
    () =>
      setAide((a) => {
        try {
          localStorage.setItem(CLE_AIDE, a ? "0" : "1");
        } catch {
          /* préférence non mémorisée */
        }
        return !a;
      }),
  ];
}

function AncreCarte({ carte, ordre, surbrillance, grande }: { carte: TCarte | null; ordre: number; surbrillance?: boolean; grande?: boolean }) {
  return (
    <div className={`ancre-carte${surbrillance ? " surbrillance" : ""}${grande ? " grande" : ""}`} data-r={carte?.r} data-c={carte?.c} data-ordre={ordre}>
      <Carte carte={carte} surbrillance={surbrillance} />
    </div>
  );
}

const memeCarte = (a: TCarte, b: TCarte) => a.r === b.r && a.c === b.c;

function Siege({
  j, etat, estMoi, pos, posee, reaction, secondes, ordreBase,
}: {
  j: PkJoueur; etat: PkEtat; estMoi: boolean; pos: { x: number; y: number }; posee: (cle: string) => boolean; reaction?: Reaction; secondes: number | null; ordreBase: number;
}) {
  const actif = etat.tour === j.id;
  const pile = versCentre(pos, 0.42);
  // Bouton du donneur : à côté de la plaque, côté intérieur, sans couvrir les cartes.
  const bouton = { x: pos.x + (pos.x <= 50 ? 8 : -8), y: pos.y + 4 };
  const gagne = etat.phase === "abattage" && j.gain > 0;
  return (
    <>
      <div className={`siege-poker${actif ? " actif" : ""}${j.couche ? " couche" : ""}${gagne ? " gagne" : ""}${estMoi ? " moi" : ""}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }} data-siege={j.id}>
        {j.enMain && !j.couche && (
          <div className="cartes-poker">
            {j.cartes.map((c, k) => (
              <AncreCarte
                key={`${etat.donne}-${j.id}-${k}`}
                carte={estMoi && c && !posee(`${etat.donne}-${j.id}-${k}`) ? null : c}
                ordre={ordreBase + k * 10}
                grande={estMoi}
                surbrillance={gagne && !!c && j.meilleures.some((m) => memeCarte(m, c))}
              />
            ))}
          </div>
        )}
        <div className="plaque">
          {reaction && <BulleReaction key={reaction.id} reaction={reaction} />}
          <Avatar config={j.avatar} taille={34} />
          <div className="plaque-texte">
            <span className="pseudo">{estMoi ? "Vous" : j.pseudo}</span>
            <span className="num accent">{j.tapisTout ? "Tapis" : formatJetons(j.tapis)}</span>
          </div>
          {actif && secondes !== null && <span className="chrono num">{secondes}</span>}
        </div>
        {(j.action || j.combinaison || j.rang) && (
          <span className={`pastille${gagne ? " gagne" : ""}${j.couche ? " couche" : ""}`}>
            {j.rang && etat.phase !== "abattage" ? `${j.rang}e` : gagne && j.gain ? `+${formatJetons(j.gain)}` : j.combinaison ?? j.action}
          </span>
        )}
        {gagne && j.combinaison && <span className="combinaison-gagnante">{j.combinaison}</span>}
        {!j.connecte && <span className="muet absent">absent</span>}
      </div>
      {j.mise > 0 && (
        <div className="mise-poker" style={{ left: `${pile.x}%`, top: `${pile.y}%` }} data-pile="" data-montant={j.mise}>
          <span className="pile-2d num">{formatJetons(j.mise)}</span>
          <span className="montant-mise num">{formatJetons(j.mise)}</span>
        </div>
      )}
      {etat.bouton === j.place && <div className="bouton-donneur" style={{ left: `${bouton.x}%`, top: `${bouton.y}%` }} aria-label="Bouton du donneur">D</div>}
    </>
  );
}

/** Votre combinaison en direct (désactivable). */
function AideCombinaison({ aide, basculer, combinaison }: { aide: boolean; basculer: () => void; combinaison: string | null }) {
  return (
    <span className="aide-combinaison">
      {aide && combinaison && <span className="ma-combinaison italique">{combinaison}</span>}
      <button type="button" className="btn-lien" onClick={basculer}>
        {aide ? "Masquer l'aide" : "Afficher ma combinaison"}
      </button>
    </span>
  );
}

export function TablePoker({ chemin }: { chemin: string }) {
  const { moi: profil, notifier, rafraichir } = useSession();
  const annoncerDefi = useAnnonceDefi();
  const { etat, moi, statut, envoyer, reactions, reagir } = useRoom<PkEtat, PkMessageClient>(chemin, (m) => notifier(m, true), annoncerDefi);
  const secondes = useCompteARebours(etat?.echeance ?? null);
  const hote = useRef<HTMLDivElement>(null);
  const table3d = useRef<Table3D | null>(null);
  const etroit = useEtroit();
  const [aide, basculerAide] = useAide();
  const [relance, setRelance] = useState(0);
  const [cave, setCave] = useState<number | null>(null);
  const celebree = useRef(0);
  const theme = trouverTheme(etat?.theme ?? profil?.theme);
  useThemeRoom(etat?.theme, profil?.theme);

  const moiJoueur = etat?.joueurs.find((j) => j.id === moi) ?? null;

  // Table 3D ovale.
  const pret = !!etat;
  useEffect(() => {
    if (!pret || !hote.current) return;
    let annule = false;
    void creerTable3D(hote.current, theme, ["Texas Hold'em", "Sans limite · 2 à 6 joueurs"], { forme: "ovale", yLibelles: [0.6, 0.645] }).then((t) => {
      if (annule) t?.detruire();
      else table3d.current = t;
    });
    return () => {
      annule = true;
      table3d.current?.detruire();
      table3d.current = null;
    };
  }, [pret]);
  useEffect(() => table3d.current?.theme(theme), [theme]);
  useLayoutEffect(() => table3d.current?.sync());

  // Cartes : rien ne compte avant d'être posé (aide « votre main », boutons).
  const placesTriees = [...(etat?.joueurs ?? [])].sort((a, b) => a.place - b.place);
  const suivies: CarteSuivie[] = etat
    ? [
        ...placesTriees.flatMap((j, r) => j.cartes.map((_, k) => ({ cle: `${etat.donne}-${j.id}-${k}`, ordre: k * 10 + r, revelation: false }))),
        ...etat.board.map((c, i) => ({ cle: `${etat.donne}-b-${i}-${c.r}${c.c}`, ordre: 100 + i, revelation: false })),
      ]
    : [];
  const { posee, toutPose } = useCartesPosees(suivies);

  // Fin de main : jetons vers le gagnant, célébration si c'est vous.
  useEffect(() => {
    if (!etat || etat.phase !== "abattage" || celebree.current === etat.donne) return;
    celebree.current = etat.donne;
    const gagnants = etat.joueurs.filter((j) => j.gain > 0);
    const t = setTimeout(() => {
      for (const g of gagnants) {
        for (let i = 0; i < 4; i++) void volerJeton(".pot-poker", `[data-siege="${g.id}"] .plaque`, { valeur: 500, delai: i * 90, duree: 650 });
      }
      const moiG = gagnants.find((g) => g.id === moi);
      if (moiG && moiJoueur) celebrer(moiG.gain, Math.max(1, moiG.gain / 4), `[data-siege="${moiG.id}"] .plaque`, moiG.combinaison?.includes("Quinte flush") ? "Quinte flush" : undefined);
      else if (moiJoueur?.enMain && !moiJoueur.couche) {
        sons.perte();
        secouer(`[data-siege="${moi}"] .plaque`);
      }
      void rafraichir();
    }, 900);
    return () => clearTimeout(t);
  }, [etat?.phase, etat?.donne]);

  useEffect(() => {
    if (moiJoueur === null) void rafraichir();
  }, [moiJoueur === null]);

  const monTour = !!etat && etat.tour === moi && toutPose;
  const maxRelance = moiJoueur ? moiJoueur.mise + moiJoueur.tapis : 0;
  useEffect(() => {
    if (monTour && etat) setRelance(Math.min(etat.relanceMin, maxRelance));
  }, [monTour, etat?.relanceMin, maxRelance]);

  // Raccourcis : F se coucher, C parole/suivre, R relancer.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (!monTour || !etat || !moiJoueur || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const aSuivre = etat.miseCourante - moiJoueur.mise;
      if (k === "f") envoyer({ t: "action", action: "coucher" });
      else if (k === "c") envoyer({ t: "action", action: aSuivre > 0 ? "suivre" : "parole" });
      else if (k === "r" && maxRelance > etat.miseCourante) envoyer({ t: "action", action: "relancer", montant: relance });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [monTour, etat, moiJoueur, relance, maxRelance, envoyer]);

  if (!etat) {
    return (
      <div className="conteneur" style={{ padding: "60px 20px", textAlign: "center" }}>
        <p className="italique accent" style={{ fontSize: 20 }}>{statut === "perdu" ? "Connexion perdue. Reconnexion…" : "Le croupier sort un jeu neuf…"}</p>
      </div>
    );
  }

  // Les places tournent pour que la vôtre soit toujours en bas.
  const decalage = moiJoueur ? moiJoueur.place : 0;
  const positions = etroit ? PLACES_MOBILE : PLACES;
  const posDe = (place: number) => positions[(place - decalage + 6) % 6];

  const aSuivre = moiJoueur ? Math.max(0, etat.miseCourante - moiJoueur.mise) : 0;
  const maCombinaison = (() => {
    if (!moiJoueur || !moiJoueur.enMain || moiJoueur.couche) return null;
    const miennes = moiJoueur.cartes.filter((c, k): c is TCarte => !!c && posee(`${etat.donne}-${moiJoueur.id}-${k}`));
    const board = etat.board.filter((c, i) => posee(`${etat.donne}-b-${i}-${c.r}${c.c}`));
    if (miennes.length < 2) return null;
    const toutes = [...miennes, ...board];
    return toutes.length >= 5 ? meilleureMain(toutes).libelle : libelleProvisoire(toutes);
  })();
  const potTotal = etat.pot;
  const action = (a: PkAction, montant?: number) => envoyer({ t: "action", action: a, montant });
  const raccourcis = [
    { nom: "Min", v: etat.relanceMin },
    // Relance « au pot » : on suit, puis on relance de la taille du pot après avoir suivi.
    { nom: "½ pot", v: etat.miseCourante + Math.floor((potTotal + aSuivre) / 2) },
    { nom: "Pot", v: etat.miseCourante + potTotal + aSuivre },
    { nom: "Tapis", v: maxRelance },
  ].map((r) => ({ ...r, v: Math.max(etat.relanceMin, Math.min(maxRelance, r.v)) }));
  const sng = etat.sng;
  const soldeDispo = profil?.solde ?? 0;
  const caveVal = etat.cave ? Math.min(etat.cave.max, Math.max(etat.cave.min, cave ?? Math.min(etat.cave.max, soldeDispo))) : 0;
  const tempsNiveau = sng?.prochainNiveau ? Math.max(0, Math.round((sng.prochainNiveau - Date.now()) / 1000)) : null;

  return (
    <div className="ecran-jeu">
      <div className="conteneur">
        <BarreRoom
          titre={etat.nom}
          code={etat.code}
          detail={`${etat.mode === "sng" ? "Sit & Go · " : ""}Blindes ${formatJetons(etat.blindes.petite)} / ${formatJetons(etat.blindes.grosse)}${etat.spectateurs ? ` · ${etat.spectateurs} spectateur${etat.spectateurs > 1 ? "s" : ""}` : ""}`}
          statut={statut}
        />
        {sng && (
          <div className="bandeau-sng">
            <span>Entrée <b className="num">{formatJetons(sng.entree)}</b></span>
            <span>Prix : {sng.prix.map((p, i) => `${i === 0 ? "1er" : `${i + 1}e`} ${formatJetons(p)}`).join(" · ")}</span>
            {sng.demarre && tempsNiveau !== null && <span>Niveau {sng.niveau + 1} · blindes en hausse dans {Math.floor(tempsNiveau / 60)}:{String(tempsNiveau % 60).padStart(2, "0")}</span>}
            {!sng.demarre && <span>{etat.joueurs.length} / 6 inscrits{sng.depart ? " · départ automatique bientôt" : ""}</span>}
          </div>
        )}
        <div ref={hote} className="table-poker">
          <div className="ancre-sabot" aria-hidden="true" />
          <div className="ancre-defausse" aria-hidden="true" />
          <div className="centre-poker">
            <div className="rang-cartes board">
              {etat.board.map((c, i) => (
                <AncreCarte key={`${etat.donne}-b-${i}`} carte={c} ordre={100 + i} />
              ))}
            </div>
            {potTotal > 0 && (
              <>
                <div className="pile-pot" data-pile="" data-montant={etat.phase === "abattage" ? 0 : potTotal - etat.joueurs.reduce((a, j) => a + j.mise, 0)} aria-hidden="true" />
                <div className="pot-poker num">Pot {formatJetons(potTotal)}</div>
              </>
            )}
          </div>
          {etat.joueurs.map((j) => (
            <Siege
              key={j.id}
              j={j}
              etat={etat}
              estMoi={j.id === moi}
              pos={posDe(j.place)}
              posee={posee}
              reaction={reactions.find((r) => r.joueurId === j.id)}
              secondes={secondes}
              ordreBase={placesTriees.findIndex((x) => x.id === j.id)}
            />
          ))}
          {moiJoueur && <BoutonReactions reagir={reagir} className="reactions-table" />}
          {sng && etat.phase === "termine" && (
            <div className="classement-sng carte-ui" role="dialog" aria-label="Classement du tournoi">
              <h2 style={{ fontSize: 26 }}>Fin du tournoi</h2>
              {sng.classement.map((c) => (
                <div key={c.pseudo} className="ligne-admin">
                  <span><b>{c.place}{c.place === 1 ? "er" : "e"}</b> · {c.pseudo}</span>
                  <span className="num accent">{c.gain ? `+${formatJetons(c.gain)}` : ""}</span>
                </div>
              ))}
              {(etat.code ? etat.hoteId === moi : false) && (
                <button type="button" className="btn btn-principal" onClick={() => envoyer({ t: "demarrer" })}>Nouveau tournoi</button>
              )}
            </div>
          )}
        </div>
        <div className="remarque" aria-live="polite">{etat.remarque ?? ""}</div>

        <div className="panneau-jeu">
          {!moiJoueur ? (
            etat.mode === "cash" && etat.cave ? (
              <>
                <div className="pile" style={{ gap: 8, flex: 1, minWidth: 240 }}>
                  <label htmlFor="cave" className="surtitre">Votre cave · {formatJetons(caveVal)} jetons</label>
                  <input id="cave" type="range" min={etat.cave.min} max={etat.cave.max} step={etat.blindes.grosse} value={caveVal} onChange={(e) => setCave(Number(e.target.value))} />
                  <span className="muet" style={{ fontSize: 12 }}>Entre {formatJetons(etat.cave.min)} et {formatJetons(etat.cave.max)} · solde {formatJetons(soldeDispo)}</span>
                </div>
                <button type="button" className="btn btn-principal btn-geant respire" disabled={etat.joueurs.length >= 6 || soldeDispo < etat.cave.min} onClick={() => envoyer({ t: "asseoir", cave: caveVal })}>
                  S'asseoir
                </button>
              </>
            ) : sng && !sng.demarre && etat.phase !== "termine" ? (
              <>
                <span className="muet">Entrée {formatJetons(sng.entree)} jetons · tapis de tournoi de 1 500 · blindes qui montent toutes les 4 minutes.</span>
                <button type="button" className="btn btn-principal btn-geant respire" disabled={etat.joueurs.length >= 6 || soldeDispo < sng.entree} onClick={() => envoyer({ t: "asseoir" })}>
                  S'inscrire
                </button>
              </>
            ) : (
              <span className="muet">Vous regardez la partie.</span>
            )
          ) : monTour ? (
            <>
              <div className="pile" style={{ gap: 6 }}>
                <span style={{ fontWeight: 700 }}>
                  À vous <Compteur secondes={secondes} total={20} />
                </span>
                <AideCombinaison aide={aide} basculer={basculerAide} combinaison={maCombinaison} />
              </div>
              <div className="actions-poker">
                <button type="button" className="btn" onClick={() => action("coucher")}>Se coucher <kbd>F</kbd></button>
                {aSuivre > 0 ? (
                  <button type="button" className="btn btn-contour" onClick={() => action("suivre")}>
                    {aSuivre >= moiJoueur.tapis ? "Tapis" : `Suivre ${formatJetons(aSuivre)}`} <kbd>C</kbd>
                  </button>
                ) : (
                  <button type="button" className="btn btn-contour" onClick={() => action("parole")}>Parole <kbd>C</kbd></button>
                )}
                {maxRelance > etat.miseCourante && (
                  <div className="relance">
                    <div className="raccourcis-relance">
                      {raccourcis.map((r) => (
                        <button key={r.nom} type="button" className="btn btn-petit" aria-pressed={relance === r.v} onClick={() => setRelance(r.v)}>{r.nom}</button>
                      ))}
                    </div>
                    <input type="range" aria-label="Montant de la relance" min={Math.min(etat.relanceMin, maxRelance)} max={maxRelance} step={etat.blindes.petite} value={relance} onChange={(e) => setRelance(Number(e.target.value))} />
                    <button type="button" className="btn btn-principal respire" onClick={() => action("relancer", relance)}>
                      {relance >= maxRelance ? "Tapis" : etat.miseCourante === 0 ? `Miser ${formatJetons(relance)}` : `Relancer à ${formatJetons(relance)}`} <kbd>R</kbd>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="pile" style={{ gap: 4 }}>
                <span className="muet">
                  {etat.phase === "attente"
                    ? etat.mode === "sng" && !sng?.demarre
                      ? "En attente des inscriptions…"
                      : "En attente d'un autre joueur…"
                    : etat.phase === "abattage"
                      ? "Abattage"
                      : etat.tour
                        ? `${etat.joueurs.find((j) => j.id === etat.tour)?.pseudo ?? "…"} réfléchit…`
                        : "Le croupier distribue…"}
                </span>
                <AideCombinaison aide={aide} basculer={basculerAide} combinaison={maCombinaison} />
              </div>
              <div className="rangee" style={{ gap: 8 }}>
                {etat.phase === "abattage" && moiJoueur.enMain && !moiJoueur.couche && moiJoueur.cartes.length > 0 && !moiJoueur.combinaison && (
                  <button type="button" className="btn btn-petit btn-contour" onClick={() => envoyer({ t: "montrer" })}>Montrer mes cartes</button>
                )}
                {sng && !sng.demarre && etat.code && etat.hoteId === moi && etat.phase !== "termine" && (
                  <button type="button" className="btn btn-principal btn-petit" disabled={etat.joueurs.length < 2} onClick={() => envoyer({ t: "demarrer" })}>Lancer le tournoi</button>
                )}
                {(etat.mode === "cash" || (sng && !sng.demarre)) && (
                  <button type="button" className="btn btn-petit" onClick={() => envoyer({ t: "quitter" })}>
                    {etat.mode === "cash" ? "Quitter la table" : "Se désinscrire"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
