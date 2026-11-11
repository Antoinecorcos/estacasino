import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type CarteSuivie, useCartesPosees } from "../cartesPosees";
import { peutDoubler, peutSeparer, valeurMain } from "../../shared/blackjack";
import type { Carte as TCarte } from "../../shared/cartes";
import type { BjAction, BjEtat, BjJoueur, BjMain, BjMessageClient } from "../../shared/protocole";
import { formatJetons } from "../../shared/regles";
import { trouverTheme } from "../../shared/themes";
import { Avatar } from "../components/Avatar";
import { useAnnonceDefi } from "../components/Defis";
import { BoutonReactions, BulleReaction } from "../components/Reactions";
import { Carte, Compteur, Jeton, VALEURS_JETONS } from "../components/Elements";
import { celebrer, secouer, volerJeton } from "../fx/effets";
import { sons } from "../fx/sons";
import { useSession } from "../session";
import { useThemeRoom } from "../theme";
import { creerTable3D, type Table3D } from "../trois/table";
import { type Reaction, useCompteARebours, useEtroit, useRoom } from "../useRoom";
import { BarreRoom } from "./Room";

const LIBELLES_ISSUE = { blackjack: "Blackjack", gagne: "Gagné", egalite: "Égalité", perdu: "Perdu", bust: "Bust" } as const;

/** Places autour de la demi-lune (en % de la table) : place 0 à droite, comme au casino. */
const PLACES_ROOM = [
  { x: 86, y: 28 },
  { x: 69, y: 41 },
  { x: 50, y: 47 },
  { x: 31, y: 41 },
  { x: 14, y: 28 },
];
/** Sur téléphone, la table est plus haute que large : les places s'étagent davantage. */
const PLACES_ROOM_MOBILE = [
  { x: 80, y: 29 },
  { x: 74, y: 59 },
  { x: 50, y: 64 },
  { x: 26, y: 59 },
  { x: 20, y: 29 },
];
const PLACE_SOLO = { x: 50, y: 44 };

function totalAffiche(cartes: (TCarte | null)[]): string {
  const visibles = cartes.filter((c): c is TCarte => c !== null);
  if (!visibles.length) return "";
  const v = valeurMain(visibles);
  if (v.souple && v.total < 21) return `${v.total - 10} / ${v.total}`;
  return String(v.total);
}

const cleCarteJoueur = (donne: number, joueurId: string, main: number, k: number, c: TCarte) => `${donne}-${joueurId}-${main}-${k}-${c.r}${c.c}`;
const cleCarteCroupier = (donne: number, i: number, c: TCarte | null) => `${donne}-c-${i}-${c ? c.r + c.c : "x"}`;

function AncreCarte({ carte, ordre, surbrillance }: { carte: TCarte | null; ordre: number; surbrillance?: boolean }) {
  return (
    <div
      className={`ancre-carte${surbrillance ? " surbrillance" : ""}`}
      data-r={carte?.r}
      data-c={carte?.c}
      data-ordre={ordre}
    >
      <Carte carte={carte} surbrillance={surbrillance} />
    </div>
  );
}

function miseMain(j: BjJoueur): number {
  return j.mains.reduce((a, m) => a + (m.issue ? 0 : m.mise), 0);
}

function Siege({
  j, etat, moi, rang, nbJoueurs, pos, miseLocale, posee, toutPose, reaction,
}: {
  j: BjJoueur; etat: BjEtat; moi: string | null; rang: number; nbJoueurs: number; pos: { x: number; y: number }; miseLocale: number;
  posee: (cle: string) => boolean; toutPose: boolean; reaction?: Reaction;
}) {
  const estMoi = j.id === moi;
  const actif = etat.tour?.joueurId === j.id;
  const enMises = etat.phase === "attente" || etat.phase === "mises";
  const pile = enMises ? (estMoi ? miseLocale || j.mise : j.mise) : miseMain(j);
  const fini = toutPose && j.mains.length > 0 && j.mains.every((m) => m.issue);
  return (
    <div className={`siege${actif ? " actif" : ""}${estMoi ? " moi" : ""}`} style={{ left: `${pos.x}%`, top: `${pos.y}%` }} data-siege={j.id}>
      <div className="siege-mains">
        {j.mains.map((m, i) => {
          const visibles = m.cartes.filter((c, k) => posee(cleCarteJoueur(etat.donne, j.id, i, k, c)));
          const issue = toutPose ? m.issue : undefined;
          const total = totalAffiche(visibles);
          return (
            <div key={i} className={`siege-main${issue === "bust" || issue === "perdu" ? " perdue" : ""}${issue === "gagne" || issue === "blackjack" ? " gagnee" : ""}`}>
              <span key={`${visibles.length}-${issue ?? ""}`} className={`pastille apparait${actif && etat.tour?.main === i ? " tour" : ""}${issue ? ` ${issue}` : ""}${!issue && !total ? " vide" : ""}`}>
                {issue ? LIBELLES_ISSUE[issue] : total || "\u00a0"}
                {issue && m.rendu && m.rendu > m.mise ? ` +${formatJetons(m.rendu - m.mise)}` : ""}
              </span>
              <div className="rang-cartes">
                {m.cartes.map((c, k) => (
                  <AncreCarte key={`${etat.donne}-${i}-${k}-${c.r}${c.c}`} carte={c} ordre={k * (nbJoueurs + 1) + rang} surbrillance={actif && etat.tour?.main === i} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="siege-pile" data-pile="" data-montant={fini ? 0 : pile}>
        {pile > 0 && !fini && <span className="pile-2d num">{formatJetons(pile)}</span>}
      </div>
      <div className="plaque">
        {reaction && <BulleReaction key={reaction.id} reaction={reaction} />}
        <Avatar config={j.avatar} taille={34} />
        <div className="plaque-texte">
          <span className="pseudo">{estMoi ? "Vous" : j.pseudo}</span>
          <span className="num accent">{pile > 0 ? formatJetons(pile) : j.connecte ? "—" : "absent"}</span>
        </div>
      </div>
    </div>
  );
}

export function TableBlackjack({ chemin }: { chemin: string }) {
  const { moi: profil, majSolde, notifier, rafraichir } = useSession();
  const annoncerDefi = useAnnonceDefi();
  const { etat, moi, statut, envoyer, reactions, reagir } = useRoom<BjEtat, BjMessageClient>(chemin, (m) => notifier(m, true), annoncerDefi);
  const [jeton, setJeton] = useState<number>(100);
  const [mise, setMise] = useState(0);
  const precedente = useRef(0);
  const secondes = useCompteARebours(etat?.echeance ?? null);
  const hote = useRef<HTMLDivElement>(null);
  const table3d = useRef<Table3D | null>(null);
  const celebree = useRef<string>("");
  const etroit = useEtroit();
  const theme = trouverTheme(etat?.theme ?? profil?.theme);
  useThemeRoom(etat?.theme, profil?.theme);

  const moiJoueur = etat?.joueurs.find((j) => j.id === moi) ?? null;
  useEffect(() => {
    if (moiJoueur) majSolde(moiJoueur.solde);
  }, [moiJoueur?.solde, majSolde]);

  // Cartes suivies, dans l'ordre de distribution : rien n'est révélé avant que la carte soit posée.
  const nbJ = etat?.joueurs.length ?? 0;
  const rangs = new Map([...(etat?.joueurs ?? [])].sort((a, b) => a.place - b.place).map((j, r) => [j.id, r]));
  const suivies: CarteSuivie[] = etat
    ? [
        ...etat.joueurs.flatMap((j) =>
          j.mains.flatMap((m, i) => m.cartes.map((c, k) => ({ cle: cleCarteJoueur(etat.donne, j.id, i, k, c), ordre: k * (nbJ + 1) + (rangs.get(j.id) ?? 0), revelation: false }))),
        ),
        ...etat.croupier.map((c, i) => ({ cle: cleCarteCroupier(etat.donne, i, c), ordre: i * (nbJ + 1) + nbJ, revelation: i === 1 && c !== null })),
      ]
    : [];
  const { posee, toutPose } = useCartesPosees(suivies);

  // Table 3D : créée une fois l'état reçu, synchronisée après chaque rendu.
  const pret = !!etat;
  useEffect(() => {
    if (!pret || !hote.current) return;
    let annule = false;
    // Sur téléphone, le feutre est trop petit pour le slogan : il chevaucherait les cartes et l'étiquette du croupier.
    const slogan: [string, string] = innerWidth < 700 ? ["", ""] : ["Le blackjack paie 3 pour 2", "Le croupier tire jusqu'à 16 et reste à 17"];
    void creerTable3D(hote.current, theme, slogan).then((t) => {
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

  // Remarque « nouveau sabot » : bruit de mélange.
  useEffect(() => {
    if (etat?.remarque?.includes("mélange")) sons.melange();
  }, [etat?.remarque]);

  // Fin de donne : célébration ou déception, puis mise à jour des gains de saison.
  useEffect(() => {
    if (!toutPose || !moiJoueur || moiJoueur.mains.length === 0 || !moiJoueur.mains.every((m) => m.issue)) return;
    const signature = moiJoueur.mains.map((m) => m.cartes.map((c) => c.r + c.c).join("")).join("|");
    if (celebree.current === signature) return;
    celebree.current = signature;
    const totalMise = moiJoueur.mains.reduce((a, m) => a + m.mise, 0);
    const rendu = moiJoueur.mains.reduce((a, m) => a + (m.rendu ?? 0), 0);
    const net = rendu - totalMise;
    const siege = document.querySelector(`[data-siege="${moiJoueur.id}"] .plaque`);
    const t = setTimeout(() => {
      if (net > 0) {
        for (let i = 0; i < Math.min(6, 2 + Math.round(net / 500)); i++) void volerJeton(siege, "#solde-total", { valeur: 500, delai: i * 70, duree: 620 });
        const bj = moiJoueur.mains.some((m) => m.issue === "blackjack");
        celebrer(net, totalMise, siege, bj ? "Blackjack" : undefined);
      } else if (net < 0) {
        sons.perte();
        secouer(siege);
        void volerJeton(siege, ".zone-croupier", { valeur: 100, duree: 420 });
      } else sons.egalite();
      void rafraichir();
    }, 350);
    return () => clearTimeout(t);
  }, [moiJoueur, rafraichir, toutPose]);

  // Tant que des cartes sont en vol, les actions attendent (comme au casino).
  const distribution = !toutPose;

  const enMises = etat?.phase === "attente" || etat?.phase === "mises";
  const monTour = !!etat && etat.tour?.joueurId === moi && etat.phase === "jeu" && !distribution;
  const maMain: BjMain | null = monTour && moiJoueur ? moiJoueur.mains[etat!.tour!.main] : null;

  // Raccourcis clavier.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (monTour && maMain) {
        const a: Record<string, BjAction> = { t: "tirer", r: "rester", d: "doubler", s: "separer" };
        if (a[k]) {
          e.preventDefault();
          envoyer({ t: "action", action: a[k] });
        }
      } else if (enMises && (k === " " || k === "enter")) {
        const b = document.querySelector<HTMLButtonElement>("#bj-distribuer");
        if (b && !b.disabled) {
          e.preventDefault();
          b.click();
        }
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [monTour, maMain, enMises, envoyer]);

  if (!etat) {
    return (
      <div className="conteneur" style={{ padding: "60px 20px", textAlign: "center" }}>
        <p className="italique accent" style={{ fontSize: 20 }}>{statut === "perdu" ? "Connexion perdue. Reconnexion…" : "Le croupier vous installe…"}</p>
      </div>
    );
  }

  const { min, max } = etat.limites;
  const miseServeur = moiJoueur?.mise ?? 0;
  const disponible = (moiJoueur?.solde ?? 0) + miseServeur;
  const nb = etat.joueurs.length;
  const ordreCroupier = nb; // le croupier reçoit sa carte après les joueurs, à chaque tour
  const resultatMoi = toutPose && moiJoueur && moiJoueur.mains.length > 0 && moiJoueur.mains.every((m) => m.issue) ? moiJoueur.mains : null;
  const net = resultatMoi ? resultatMoi.reduce((a, m) => a + (m.rendu ?? 0) - m.mise, 0) : 0;
  const message = resultatMoi
    ? resultatMoi.some((m) => m.issue === "blackjack")
      ? { texte: "Blackjack !", classe: "gain" }
      : net > 0
        ? { texte: `Gagné · +${formatJetons(net)}`, classe: "gain" }
        : net < 0
          ? { texte: resultatMoi.every((m) => m.issue === "bust") ? "Bust" : "Perdu", classe: "perte" }
          : { texte: "Égalité", classe: "" }
    : null;

  const ajouter = (v: number, depuis: Element | null) => {
    if (!enMises || !moiJoueur) return;
    const nouvelle = Math.min(max, disponible, mise + v);
    if (nouvelle === mise) {
      notifier(mise >= max ? `Mise maximum : ${formatJetons(max)}.` : "Solde insuffisant.", true);
      return;
    }
    sons.jeton();
    void volerJeton(depuis, `[data-siege="${moiJoueur.id}"] .siege-pile`, { valeur: v, duree: 360 });
    setMise(nouvelle);
  };
  const fixer = (m: number) => {
    sons.jeton();
    setMise(Math.max(0, Math.min(max, disponible, Math.floor(m))));
  };
  const distribuer = () => {
    if (mise < min) return;
    precedente.current = mise;
    if (miseServeur !== mise) envoyer({ t: "miser", montant: mise });
    if (etat.solo) envoyer({ t: "distribuer" });
  };
  const action = (a: BjAction) => envoyer({ t: "action", action: a });

  const places = etat.solo ? [PLACE_SOLO] : etroit ? PLACES_ROOM_MOBILE : PLACES_ROOM;

  return (
    <div className="ecran-jeu">
      <div className="conteneur">
        <BarreRoom
          titre={etat.solo ? "Blackjack · table privée" : "Blackjack"}
          code={etat.code}
          detail={`Mise ${formatJetons(min)} à ${formatJetons(max)}${etat.spectateurs ? ` · ${etat.spectateurs} spectateur${etat.spectateurs > 1 ? "s" : ""}` : ""}`}
          statut={statut}
        />
        <div ref={hote} className={`table-bj${etat.solo ? " solo" : ""}`}>
          <div className="ancre-sabot" aria-hidden="true" />
          <div className="ancre-defausse" aria-hidden="true" />
          <div className="zone-croupier">
            <div className="rang-cartes">
              {etat.croupier.map((c, i) => (
                <AncreCarte key={`${etat.donne}-c-${i}`} carte={c} ordre={i * (nb + 1) + ordreCroupier} />
              ))}
            </div>
            <div className="etiquette-table">
              Croupier
              {(() => {
                const t = totalAffiche(etat.croupier.filter((c, i) => posee(cleCarteCroupier(etat.donne, i, c))));
                return t ? ` · ${t}` : "";
              })()}
            </div>
          </div>
          {message && (
            <div key={message.texte} className={`message-table ${message.classe}`} aria-live="polite">
              {message.texte}
            </div>
          )}
          {etat.joueurs.map((j) => (
            <Siege
              key={j.id}
              j={j}
              etat={etat}
              moi={moi}
              rang={[...etat.joueurs].sort((a, b) => a.place - b.place).findIndex((x) => x.id === j.id)}
              nbJoueurs={nb}
              pos={places[etat.solo ? 0 : j.place] ?? PLACE_SOLO}
              miseLocale={j.id === moi ? mise : 0}
              posee={posee}
              toutPose={toutPose}
              reaction={reactions.find((r) => r.joueurId === j.id)}
            />
          ))}
          {!etat.solo && moiJoueur && <BoutonReactions reagir={reagir} className="reactions-table" />}
        </div>
        <div className="remarque" aria-live="polite">{etat.remarque ?? ""}</div>

        {!moiJoueur ? (
          <p className="muet" style={{ textAlign: "center", padding: 16 }}>La table est complète (5 joueurs) : vous regardez la partie.</p>
        ) : monTour && maMain ? (
          <div className="panneau-jeu">
            <div className="rangee" style={{ gap: 10 }}>
              <span style={{ fontWeight: 700 }}>À vous{moiJoueur.mains.length > 1 ? ` · main ${etat.tour!.main + 1}` : ""}</span>
              <Compteur secondes={secondes} total={20} />
            </div>
            <div className="actions">
              <button type="button" className="btn" disabled={!peutSeparer(maMain.cartes, maMain.separee) || moiJoueur.mains.length > 1 || moiJoueur.solde < maMain.mise} onClick={() => action("separer")}>
                Séparer <kbd>S</kbd>
              </button>
              <button type="button" className="btn" disabled={!peutDoubler(maMain.cartes) || moiJoueur.solde < maMain.mise} onClick={() => action("doubler")}>
                Doubler <kbd>D</kbd>
              </button>
              <button type="button" className="btn btn-contour" onClick={() => action("rester")}>
                Rester <kbd>R</kbd>
              </button>
              <button type="button" className="btn btn-principal respire" onClick={() => action("tirer")}>
                Tirer <kbd>T</kbd>
              </button>
            </div>
          </div>
        ) : enMises ? (
          <div className="panneau-jeu">
            <div className="pile" style={{ gap: 12 }}>
              <div className="surtitre">Votre mise · cliquez sur les jetons</div>
              <div className="jetons-choix" role="group" aria-label="Ajouter des jetons à la mise">
                {VALEURS_JETONS.filter((v) => v <= max).map((v) => (
                  <Jeton key={v} valeur={v} aria-pressed={jeton === v} onClick={(e) => { setJeton(v); ajouter(v, e.currentTarget); }} />
                ))}
              </div>
              <div className="rangee" style={{ gap: 8 }}>
                <span className="mise-affichee">
                  <span className="surtitre">Mise</span> <strong className="num accent">{formatJetons(mise)}</strong>
                </span>
                <button type="button" className="btn btn-petit" disabled={!mise} onClick={() => { fixer(0); if (miseServeur > 0) envoyer({ t: "miser", montant: 0 }); }}>Effacer</button>
                <button type="button" className="btn btn-petit" disabled={mise < 2 * min} onClick={() => fixer(mise / 2)}>½</button>
                <button type="button" className="btn btn-petit" disabled={!mise || mise * 2 > Math.min(max, disponible)} onClick={() => fixer(mise * 2)}>×2</button>
                <button type="button" className="btn btn-petit" disabled={!precedente.current || precedente.current > disponible} onClick={() => fixer(precedente.current)}>
                  Précédente{precedente.current ? ` (${formatJetons(precedente.current)})` : ""}
                </button>
                {etat.phase === "mises" && !etat.solo && <Compteur secondes={secondes} total={12} />}
              </div>
            </div>
            <div className="pile" style={{ gap: 6, alignItems: "stretch", minWidth: 220 }}>
              {!etat.solo && miseServeur > 0 && miseServeur === mise ? (
                <span className="muet" style={{ fontSize: 14 }}>Mise posée. La donne part dès que tout le monde a misé.</span>
              ) : (
                <button id="bj-distribuer" type="button" className="btn btn-principal btn-geant respire" disabled={mise < min} onClick={distribuer}>
                  {etat.solo ? "Distribuer" : "Poser la mise"}
                </button>
              )}
              <span className="muet" style={{ fontSize: 12, textAlign: "center" }}>
                {mise > 0 && mise < min ? `Minimum ${formatJetons(min)}` : <>Espace pour {etat.solo ? "distribuer" : "valider"}</>}
              </span>
            </div>
          </div>
        ) : (
          <div className="panneau-jeu" style={{ justifyContent: "center" }}>
            <span className="muet">
              {distribution && etat.phase === "jeu"
                ? "Le croupier distribue…"
                : etat.phase === "croupier" ? "Le croupier joue…" : etat.tour ? `Au tour de ${etat.joueurs.find((j) => j.id === etat.tour?.joueurId)?.pseudo ?? "…"}` : "…"}
            </span>
            {etat.tour && <Compteur secondes={secondes} total={20} />}
          </div>
        )}
      </div>
    </div>
  );
}
