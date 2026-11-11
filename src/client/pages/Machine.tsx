import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trouverLigue } from "../../shared/ligues";
import {
  GAINS,
  GAINS_BONUS,
  type Jackpot,
  JACKPOTS,
  MISES_MACHINE,
  MULTIPLICATEUR_MAX,
  NOMS_JACKPOTS,
  type ResultatMachine,
  SYMBOLES_PAYANTS,
  TOURS_GRATUITS,
} from "../../shared/machine";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { useAnnonceDefi } from "../components/Defis";
import { Machine, type Mode } from "../machine/moteur";
import { formatCourt, imageSymbole } from "../machine/symboles";
import { useSession } from "../session";
import { BarreRoom } from "./Room";

interface Reponse {
  resultat: ResultatMachine;
  soldeApresMise: number;
  solde: number;
  defis: { titre: string; recompense: number }[];
  forfait: boolean;
}

const CLE_MISE = "esta-machine-mise";
const CLE_TURBO = "esta-machine-turbo";
const lire = (cle: string) => {
  try {
    return localStorage.getItem(cle);
  } catch {
    return null;
  }
};
const ecrire = (cle: string, v: string) => {
  try {
    localStorage.setItem(cle, v);
  } catch {
    /* stockage indisponible */
  }
};

const ORDRE_JACKPOTS: Jackpot[] = ["grand", "majeur", "mineur", "mini"];
const CHOIX_AUTO = [10, 25, 50, 100];

export function PageMachine() {
  const { moi, majSolde, notifier, rafraichir } = useSession();
  const annoncerDefi = useAnnonceDefi();
  const cabinet = useRef<HTMLDivElement>(null);
  const toileRouleaux = useRef<HTMLCanvasElement>(null);
  const toileFx = useRef<HTMLCanvasElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const moteur = useRef<Machine | null>(null);

  const miseMax = moi ? trouverLigue(moi.ligue.id).miseMaxRoom : 5_000;
  const mises = useMemo(() => MISES_MACHINE.filter((m) => m <= miseMax), [miseMax]);
  const [mise, setMise] = useState(() => {
    const m = Number(lire(CLE_MISE));
    return (MISES_MACHINE as readonly number[]).includes(m) ? m : 100;
  });
  const miseEffective = Math.min(mise, mises[mises.length - 1]);
  const [turbo, setTurbo] = useState(() => lire(CLE_TURBO) === "1");
  const [enCours, setEnCours] = useState(false);
  const [gain, setGain] = useState(0);
  const [mode, setMode] = useState<Mode>("base");
  const [libres, setLibres] = useState<{ restants: number; joues: number; multiplicateur: number; total: number } | null>(null);
  const [relances, setRelances] = useState<number | null>(null);
  const [jackpotFlash, setJackpotFlash] = useState<{ j: Jackpot; n: number } | null>(null);
  const [auto, setAuto] = useState(0);
  const [menuAuto, setMenuAuto] = useState(false);
  const [infos, setInfos] = useState(false);

  const enCoursRef = useRef(false);
  const autoRef = useRef(0);
  const soldeRef = useRef(moi?.solde ?? 0);
  soldeRef.current = moi?.solde ?? 0;

  useEffect(() => {
    if (!cabinet.current || !toileRouleaux.current || !toileFx.current || !scene.current) return;
    const m = new Machine(
      { cabinet: cabinet.current, rouleaux: toileRouleaux.current, fx: toileFx.current, scene: scene.current },
      {
        gain: setGain,
        mode: setMode,
        libres: setLibres,
        relances: setRelances,
        jackpot: (j) => setJackpotFlash((x) => ({ j, n: (x?.n ?? 0) + 1 })),
      },
    );
    moteur.current = m;
    return () => {
      m.detruire();
      moteur.current = null;
    };
  }, []);

  const arreterAuto = () => {
    autoRef.current = 0;
    setAuto(0);
  };

  const tourner = useCallback(async () => {
    const m = moteur.current;
    if (!m) return;
    if (enCoursRef.current) {
      m.sauter();
      return;
    }
    if (soldeRef.current < miseEffective) {
      arreterAuto();
      notifier("Solde insuffisant pour cette mise. Baissez la mise, ou passez par le lobby (bonus, filet de sécurité).", true);
      return;
    }
    enCoursRef.current = true;
    setEnCours(true);
    setGain(0);
    setMenuAuto(false);
    const debut = performance.now();
    m.lancer({ turbo, mise: miseEffective });
    majSolde(soldeRef.current - miseEffective);
    let rep: Reponse;
    try {
      rep = await api<Reponse>("/machine/tourner", { corps: { mise: miseEffective } });
    } catch (e) {
      m.annuler();
      notifier((e as Error).message, true);
      arreterAuto();
      await rafraichir();
      enCoursRef.current = false;
      setEnCours(false);
      return;
    }
    majSolde(rep.soldeApresMise);
    await m.raconter(rep.resultat, debut, autoRef.current > 0);
    majSolde(rep.solde);
    void rafraichir(); // « Gains de saison » de l'en-tête
    for (const d of rep.defis) annoncerDefi(d.titre, d.recompense);
    if (rep.forfait) notifier("Forfait saison : 2 000 jetons crédités sur votre solde.");
    enCoursRef.current = false;
    setEnCours(false);
    if (autoRef.current > 0) {
      autoRef.current--;
      setAuto(autoRef.current);
      if (autoRef.current > 0) setTimeout(() => tournerRef.current(), turbo ? 150 : 500);
    }
  }, [turbo, miseEffective, majSolde, notifier, rafraichir, annoncerDefi]);
  const tournerRef = useRef(tourner);
  tournerRef.current = tourner;

  // Barre d'espace : lancer, ou accélérer l'animation en cours.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      if (e.code !== "Space" || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(cible.tagName) || infos) return;
      e.preventDefault();
      void tournerRef.current();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [infos]);

  const changerMise = (sens: 1 | -1) => {
    const i = Math.max(0, mises.indexOf(miseEffective as (typeof mises)[number]));
    const n = mises[Math.max(0, Math.min(mises.length - 1, i + sens))];
    setMise(n);
    ecrire(CLE_MISE, String(n));
  };

  const lancerAuto = (n: number) => {
    setMenuAuto(false);
    autoRef.current = n;
    setAuto(n);
    if (!enCoursRef.current) void tournerRef.current();
  };

  const bandeau =
    mode === "libres" && libres ? (
      <>
        <span>Tours gratuits</span>
        <b className="num">{libres.restants}</b>
        <span>restant{libres.restants > 1 ? "s" : ""}</span>
        <span key={libres.multiplicateur} className="mas-multi">×{libres.multiplicateur}</span>
        <span className="num">{formatJetons(libres.total)}</span>
      </>
    ) : mode === "pieces" ? (
      <>
        <span>Pluie d'or · relances</span>
        <span className="mas-lampes" aria-label={`${relances ?? 0} relances`}>
          {[0, 1, 2].map((i) => <i key={`${i}-${relances}`} className={relances !== null && i < relances ? "allumee" : ""} />)}
        </span>
      </>
    ) : (
      <>
        <span className="long">243 voies</span>
        <span className="sep long">◆</span>
        <span>3 BONUS = tours gratuits</span>
        <span className="sep">◆</span>
        <span>6 pièces = Pluie d'or</span>
      </>
    );

  return (
    <div className="ecran-jeu ecran-machine">
      <BarreRoom titre="Les Années folles" code={null} detail="Machine à sous · 243 voies" statut="ouvert" />
      <div ref={cabinet} className={`mas-cabinet mode-${mode}`}>
        <div className="mas-lumieres" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 4) * 0.18}s` }} />)}
        </div>
        <div className="mas-fronton">
          <div className="mas-nom">
            <span className="mas-eventail" aria-hidden="true" />
            Les Années folles
            <span className="mas-eventail" aria-hidden="true" />
          </div>
          <div className="mas-jackpots">
            {ORDRE_JACKPOTS.map((j) => (
              <div key={`${j}-${jackpotFlash?.j === j ? jackpotFlash.n : 0}`} className={`mas-jackpot-plaque j-${j}${jackpotFlash?.j === j ? " flash" : ""}`}>
                <span>{NOMS_JACKPOTS[j]}</span>
                <b className="num">{formatCourt(JACKPOTS[j] * miseEffective)}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="mas-bandeau">{bandeau}</div>
        <div className="mas-fenetre">
          <canvas ref={toileRouleaux} className="mas-rouleaux" aria-label="Rouleaux de la machine à sous" role="img" />
        </div>
        <div className="mas-pied">
          <div className="mas-compteur solde"><span>Solde</span><b className="num">{formatJetons(moi?.solde ?? 0)}</b></div>
          <div className={`mas-compteur gain${gain > 0 ? " gagne" : ""}`}><span>Gain</span><b className="num">{formatJetons(gain)}</b></div>
          <div className="mas-commandes">
            <div className="mas-auto">
              <button
                type="button" className={`mas-btn${auto ? " actif" : ""}`} aria-expanded={menuAuto}
                onClick={() => (auto ? arreterAuto() : setMenuAuto((x) => !x))}
              >
                {auto ? <>Stop <small className="num">{auto}</small></> : "Auto"}
              </button>
              {menuAuto && (
                <div className="mas-menu-auto" role="menu">
                  {CHOIX_AUTO.map((n) => (
                    <button key={n} type="button" role="menuitem" onClick={() => lancerAuto(n)}>{n} lancers</button>
                  ))}
                </div>
              )}
            </div>
            <div className="mas-mise">
              <button type="button" className="mas-btn rond" aria-label="Baisser la mise" disabled={enCours || miseEffective <= mises[0]} onClick={() => changerMise(-1)}>−</button>
              <div className="mas-mise-valeur"><span>Mise</span><b className="num">{formatJetons(miseEffective)}</b></div>
              <button type="button" className="mas-btn rond" aria-label="Augmenter la mise" disabled={enCours || miseEffective >= mises[mises.length - 1]} onClick={() => changerMise(1)}>+</button>
            </div>
            <button type="button" className={`mas-lancer${enCours ? " tourne" : ""}`} aria-label={enCours ? "Accélérer" : "Lancer"} onClick={() => void tourner()}>
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path d="M24 8a16 16 0 1 1-15.2 11" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
                <path d="M5 10l4 10 9-5z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button" className={`mas-btn mas-turbo${turbo ? " actif" : ""}`} aria-pressed={turbo} aria-label="Turbo" title="Turbo : animations plus rapides"
              onClick={() => setTurbo((t) => { ecrire(CLE_TURBO, t ? "0" : "1"); return !t; })}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" /></svg>
              <span className="mas-texte">Turbo</span>
            </button>
            <button type="button" className="mas-btn rond" aria-label="Règles et table des gains" onClick={() => setInfos(true)}>i</button>
          </div>
        </div>
        <canvas ref={toileFx} className="mas-fx" aria-hidden="true" />
        <div ref={scene} className="mas-scene" aria-live="polite" />
      </div>
      {infos && <TableDesGains mise={miseEffective} fermer={() => setInfos(false)} />}
    </div>
  );
}

function TableDesGains({ mise, fermer }: { mise: number; fermer: () => void }) {
  const images = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of [...SYMBOLES_PAYANTS, "wild", "bonus"] as const) m.set(s, imageSymbole({ s }, 96));
    m.set("piece", imageSymbole({ s: "piece", v: 5 }, 96));
    for (const j of ["mini", "mineur", "majeur"] as const) m.set(j, imageSymbole({ s: "piece", v: JACKPOTS[j], j }, 96));
    return m;
  }, []);
  useEffect(() => {
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [fermer]);
  return (
    <div className="mas-modale" role="dialog" aria-modal="true" aria-labelledby="titre-gains" onClick={fermer}>
      <div className="carte-ui mas-modale-corps" onClick={(e) => e.stopPropagation()}>
        <div className="rangee" style={{ justifyContent: "space-between" }}>
          <h2 id="titre-gains" style={{ fontSize: 28 }}>Table des gains</h2>
          <button type="button" className="btn btn-petit" onClick={fermer}>Fermer</button>
        </div>
        <p className="muet" style={{ fontSize: 14 }}>
          Montants pour une mise de <b>{formatJetons(mise)}</b>, par voie. 243 voies : les gains se lisent de gauche à droite sur des
          rouleaux voisins, n'importe quelle rangée. Plusieurs symboles sur un même rouleau multiplient les voies.
        </p>
        <div className="mas-gains">
          {SYMBOLES_PAYANTS.map((s) => (
            <div key={s} className="mas-gain">
              <img src={images.get(s)} alt="" width={56} height={56} />
              <div className="num">
                {[5, 4, 3].map((n) => (
                  <div key={n}><span className="muet">{n}×</span> {formatJetons(Math.floor((GAINS[s][n - 3] * mise) / 100))}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mas-regle">
          <img src={images.get("wild")} alt="" width={56} height={56} />
          <p><b>Wild</b> (rouleaux 2, 3 et 4) : remplace tous les symboles, sauf BONUS et pièces.</p>
        </div>
        <div className="mas-regle">
          <img src={images.get("bonus")} alt="" width={56} height={56} />
          <p>
            <b>BONUS</b> n'importe où : 3, 4 ou 5 donnent {TOURS_GRATUITS[3]}, {TOURS_GRATUITS[4]} ou {TOURS_GRATUITS[5]} tours gratuits
            et {GAINS_BONUS[3]}, {GAINS_BONUS[4]} ou {GAINS_BONUS[5]} fois la mise. Pendant les tours gratuits, le multiplicateur monte
            de 1 à chaque tour gagnant, jusqu'à ×{MULTIPLICATEUR_MAX}. 3 BONUS de plus : +5 tours.
          </p>
        </div>
        <div className="mas-regle">
          <div className="rangee" style={{ gap: 4, flexWrap: "nowrap" }}>
            <img src={images.get("piece")} alt="" width={44} height={44} />
            <img src={images.get("mini")} alt="" width={44} height={44} />
            <img src={images.get("majeur")} alt="" width={44} height={44} />
          </div>
          <p>
            <b>Pluie d'or</b> : 6 pièces ou plus. Elles restent en place et vous avez 3 relances ; chaque nouvelle pièce les remet à 3.
            À la fin, toutes les pièces sont payées. Jackpots : Mini {JACKPOTS.mini}×, Mineur {JACKPOTS.mineur}×, Majeur {JACKPOTS.majeur}×
            la mise, et <b>Grand {JACKPOTS.grand}×</b> si les 15 cases sont remplies.
          </p>
        </div>
        <p className="muet" style={{ fontSize: 13 }}>
          Taux de redistribution théorique : environ 97 %. Gain maximum : 5 000 fois la mise par lancer. Tous les tirages sont faits sur
          nos serveurs. Jetons fictifs, sans aucune valeur monétaire. Raccourci : barre d'espace pour lancer ou accélérer.
        </p>
      </div>
    </div>
  );
}
