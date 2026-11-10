import {
  BANDES_BASE,
  BANDES_LIBRES,
  type Case,
  type GainVoie,
  type Grille,
  type Jackpot,
  JACKPOTS,
  type Libres,
  MULTIPLICATEUR_MAX,
  NOMS_JACKPOTS,
  palierGain,
  type Pieces,
  type Position,
  RANGEES,
  type ResultatMachine,
  type ResultatTour,
  ROULEAUX,
  type Symbole,
  tirerPiece,
  TITRES_PALIERS,
} from "../../shared/machine";
import { formatJetons } from "../../shared/regles";
import { mouvementReduit } from "../fx/effets";
import { sonsMachine as S } from "../fx/sons";
import { type Cache, cleImage, creerCache, texteSurPiece } from "./symboles";

// Moteur de la machine « Les Années folles » : deux canvas (les rouleaux, et une couche d'effets
// par-dessus toute la machine) et une mise en scène pour chaque résultat, du plus petit gain au jackpot.
// Le résultat arrive tout fait du serveur ; ici, on ne fait que le raconter.

export type Mode = "base" | "libres" | "pieces";

export interface Ecouteurs {
  /** Compteur « Gain » du lancer en cours (cumul, fonctions comprises). */
  gain(montant: number): void;
  mode(m: Mode): void;
  libres(e: { restants: number; joues: number; multiplicateur: number; total: number } | null): void;
  relances(n: number | null): void;
  jackpot(j: Jackpot): void;
}

export interface Hote {
  cabinet: HTMLElement;
  rouleaux: HTMLCanvasElement;
  fx: HTMLCanvasElement;
  scene: HTMLElement; // calque pour les annonces (gros gains, intros)
}

const NOMS: Record<Symbole, string> = {
  pique: "Pique", coeur: "Cœur", carreau: "Carreau", trefle: "Trèfle", perles: "Perles", chapeau: "Haut-de-forme",
  cocktail: "Cocktail", diamant: "Diamant", wild: "Wild", bonus: "Bonus", piece: "Pièce",
};

const VITESSE_MAX = 0.03; // cases par milliseconde
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const PAILLETTES = ["#fff6d2", "#f6dc82", "#ffd36a", "#ffffff", "#e6b34a"];

interface Rouleau {
  cases: Case[]; // [au-dessus, rangée 0, 1, 2, en dessous]
  decalage: number;
  vitesse: number;
  etat: "arret" | "tourne" | "atterrit";
  aVenir: Case[];
  arretDemande: boolean;
  bande: Symbole[];
  curseur: number;
  t0: number;
  d0: number;
  dureeAtterrissage: number;
  surArret?: () => void;
  anticipe: number; // horodatage de début d'anticipation (0 = non)
}

interface AnimCase {
  gagne: number; // horodatage du début de surbrillance (0 = non)
  saut: number; // petit bond à l'arrivée d'un BONUS ou d'une pièce
  eclair: number; // flash blanc (verrouillage d'une pièce)
}

type Particule =
  | { t: "piece"; x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; vie: number; max: number; g: number }
  | { t: "etincelle"; x: number; y: number; vx: number; vy: number; r: number; vie: number; max: number; c: string; g: number }
  | { t: "anneau"; x: number; y: number; r: number; vr: number; vie: number; max: number; c: string }
  | { t: "texte"; x: number; y: number; vy: number; texte: string; taille: number; vie: number; max: number }
  | { t: "feu"; x: number; y: number; vx: number; vy: number; vie: number; c: string };

export class Machine {
  private rouleaux: Rouleau[] = [];
  private anims: AnimCase[][] = [];
  private cache: Cache | null = null;
  private particules: Particule[] = [];
  private raf = 0;
  private dernier = 0;
  private detruit = false;
  private observateur: ResizeObserver;
  private geo = { w: 0, h: 0, cw: 0, ch: 0, gx: 0, gy: 0, gap: 0, dpr: 1 };
  private geoFx = { w: 0, h: 0, dpr: 1 };
  private lignes: { positions: Position[]; debut: number }[] = [];
  private sombre = 0; // 0..1 : assombrit les cases non gagnantes
  private sombreCible = 0;
  private rayons = 0; // 0..1 : soleil tournant derrière les gros gains
  private rayonsCible = 0;
  private fontaine: { fin: number; debit: number; pluie: boolean } | null = null;
  private attentes = new Set<() => void>();
  private rapide = false;
  private turbo = false;
  private mise = 10;
  private libres = false;
  private verrou: (Case | null)[][] | null = null; // Pluie d'or
  private tourneCase: boolean[][] = [];
  private dernierRoulement = 0;
  private dernierCliquetis = 0;
  private reduit = mouvementReduit();
  private scintillement = 0;

  constructor(private hote: Hote, private ecouteurs: Ecouteurs) {
    const h = Math.floor(Math.random() * 60);
    for (let r = 0; r < ROULEAUX; r++) {
      const bande = BANDES_BASE[r];
      const curseur = (h * (r + 3)) % bande.length;
      const cases = Array.from({ length: RANGEES + 2 }, (_, k) => this.caseDe(bande[(curseur + k) % bande.length]));
      this.rouleaux.push({
        cases, decalage: 0, vitesse: 0, etat: "arret", aVenir: [], arretDemande: false, bande, curseur: curseur - 1,
        t0: 0, d0: 0, dureeAtterrissage: 300, anticipe: 0,
      });
      this.anims.push(Array.from({ length: RANGEES }, () => ({ gagne: 0, saut: 0, eclair: 0 })));
      this.tourneCase.push(Array.from({ length: RANGEES }, () => false));
    }
    this.observateur = new ResizeObserver(() => this.dimensionner());
    this.observateur.observe(hote.rouleaux);
    this.observateur.observe(hote.cabinet);
    this.dimensionner();
    void document.fonts?.load('italic 600 40px "Fraunces"').then(() => {
      this.cache = null;
      this.dimensionner();
    });
    this.raf = requestAnimationFrame((t) => this.boucle(t));
  }

  detruire(): void {
    this.detruit = true;
    cancelAnimationFrame(this.raf);
    this.observateur.disconnect();
    this.sauter();
  }

  // ───────── Géométrie ─────────

  private dimensionner(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.hote.rouleaux.getBoundingClientRect();
    if (r.width < 10) return;
    const w = r.width;
    const h = r.height;
    this.hote.rouleaux.width = Math.round(w * dpr);
    this.hote.rouleaux.height = Math.round(h * dpr);
    const gap = Math.max(4, w * 0.012);
    const cw = (w - gap * (ROULEAUX + 1)) / ROULEAUX;
    const ch = (h - gap * 2) / RANGEES;
    const taille = Math.min(cw, ch) * 0.86 * dpr;
    if (!this.cache || Math.abs(this.cache.taille - taille) > 2) this.cache = creerCache(taille);
    this.geo = { w, h, cw, ch, gx: gap, gy: gap, gap, dpr };
    const f = this.hote.cabinet.getBoundingClientRect();
    this.hote.fx.width = Math.round(f.width * dpr);
    this.hote.fx.height = Math.round(f.height * dpr);
    this.geoFx = { w: f.width, h: f.height, dpr };
  }

  /** Centre d'une case, dans le repère du calque d'effets (toute la machine). */
  private centreFx(r: number, rang: number): { x: number; y: number } {
    const a = this.hote.rouleaux.getBoundingClientRect();
    const b = this.hote.cabinet.getBoundingClientRect();
    const { cw, ch, gx, gy, gap } = this.geo;
    return { x: a.left - b.left + gx + r * (cw + gap) + cw / 2, y: a.top - b.top + gy + rang * ch + ch / 2 };
  }

  private centreGrilleFx(): { x: number; y: number } {
    return this.centreFx(2, 1);
  }

  // ───────── Attentes que l'on peut écourter (clic = accélérer) ─────────

  private attendre(ms: number): Promise<void> {
    if (this.rapide || this.detruit) ms = Math.min(ms, 60);
    return new Promise((ok) => {
      const fin = () => {
        clearTimeout(id);
        this.attentes.delete(fin);
        ok();
      };
      const id = setTimeout(fin, ms);
      this.attentes.add(fin);
    });
  }

  /** Accélère la séquence en cours : arrêt immédiat des rouleaux, compteurs à leur valeur finale. */
  sauter(): void {
    this.rapide = true;
    for (const f of [...this.attentes]) f();
  }

  /** Attend un clic (ou un délai) pour les annonces : « Toucher pour continuer ». */
  private attendreClic(ms: number): Promise<void> {
    return new Promise((ok) => {
      const fin = () => {
        this.hote.scene.removeEventListener("pointerdown", fin);
        this.attentes.delete(fin);
        clearTimeout(id);
        ok();
      };
      const id = setTimeout(fin, this.rapide ? Math.min(ms, 600) : ms);
      this.hote.scene.addEventListener("pointerdown", fin);
      this.attentes.add(fin);
    });
  }

  // ───────── Rouleaux ─────────

  private caseDe(s: Symbole): Case {
    return s === "piece" ? tirerPiece(Math.random) : { s };
  }

  private suivante(rl: Rouleau): Case {
    if (rl.aVenir.length) return rl.aVenir.shift()!;
    rl.curseur = (rl.curseur - 1 + rl.bande.length) % rl.bande.length;
    return this.caseDe(rl.bande[rl.curseur]);
  }

  /** Lance les rouleaux (avant même la réponse du serveur : la machine réagit tout de suite au clic). */
  lancer({ libres = false, turbo = false, mise = this.mise } = {}): void {
    this.rapide = false;
    this.turbo = turbo;
    this.mise = mise;
    this.libres = libres;
    this.effacerGains();
    S.depart();
    const bandes = libres ? BANDES_LIBRES : BANDES_BASE;
    this.rouleaux.forEach((rl, r) => {
      rl.bande = bandes[r];
      rl.curseur = Math.floor(Math.random() * rl.bande.length);
      rl.etat = "tourne";
      rl.vitesse = -0.0045; // petit recul avant de partir, comme un vrai rouleau
      rl.aVenir = [];
      rl.arretDemande = false;
      rl.anticipe = 0;
    });
  }

  /** Erreur réseau : les rouleaux s'arrêtent sur ce qu'ils montrent. */
  annuler(): void {
    this.rouleaux.forEach((rl) => {
      rl.arretDemande = true;
      rl.aVenir = [this.suivante(rl)];
    });
  }

  private effacerGains(): void {
    for (const col of this.anims) for (const a of col) a.gagne = 0;
    this.lignes = [];
    this.sombreCible = 0;
  }

  private compter(grille: Grille, s: Symbole, jusqua: number): number {
    let n = 0;
    for (let r = 0; r < jusqua; r++) n += grille[r].filter((c) => c.s === s).length;
    return n;
  }

  /** Arrête les rouleaux un par un sur la grille finale, avec anticipation quand une fonction est proche. */
  async arreter(grille: Grille, debut: number): Promise<void> {
    const minimum = this.turbo ? 260 : 620;
    await this.attendre(Math.max(0, minimum - (performance.now() - debut)));
    const atterrissages: Promise<void>[] = [];
    for (let r = 0; r < ROULEAUX; r++) {
      const rl = this.rouleaux[r];
      const bonus = this.compter(grille, "bonus", r);
      const pieces = this.compter(grille, "piece", r);
      const anticipe = !this.rapide && r >= 2 && (bonus >= 2 || (pieces >= 4 && pieces + 3 * (ROULEAUX - r) >= 6));
      if (anticipe) {
        rl.anticipe = performance.now();
        const duree = this.turbo ? 1000 : 1600;
        S.anticipation(duree / 1000);
        await this.attendre(duree);
      } else if (r > 0) {
        await this.attendre(this.turbo ? 70 : 190);
      }
      rl.aVenir = [grille[r][2], grille[r][1], grille[r][0], this.caseDe(rl.bande[Math.floor(Math.random() * rl.bande.length)])];
      rl.arretDemande = true;
      rl.dureeAtterrissage = this.rapide || this.turbo ? 200 : 320;
      atterrissages.push(
        new Promise<void>((ok) => {
          rl.surArret = () => {
            rl.anticipe = 0;
            S.arret(r);
            // Arrivée d'un BONUS ou d'une pièce : petit bond, éclat et son.
            grille[r].forEach((c, rang) => {
              if (c.s === "bonus") {
                this.anims[r][rang].saut = performance.now();
                S.bonus(this.compter(grille, "bonus", r + 1));
                this.eclat(r, rang, 18, "#ff9be8");
              } else if (c.s === "piece") {
                this.anims[r][rang].saut = performance.now();
                S.piece();
                this.eclat(r, rang, 10);
              } else if (c.s === "wild") {
                this.anims[r][rang].saut = performance.now();
              }
            });
            ok();
          };
        }),
      );
    }
    await Promise.all(atterrissages);
  }

  private majRouleau(rl: Rouleau, dt: number, t: number): void {
    if (rl.etat === "tourne") {
      rl.vitesse = Math.min(VITESSE_MAX * (this.turbo ? 1.25 : 1), rl.vitesse + dt * 0.00032);
      rl.decalage += rl.vitesse * dt;
      while (rl.decalage >= 1) {
        rl.decalage -= 1;
        rl.cases.pop();
        const derniere = rl.arretDemande && rl.aVenir.length === 1;
        rl.cases.unshift(this.suivante(rl));
        if (derniere) {
          rl.etat = "atterrit";
          rl.t0 = t;
          rl.d0 = rl.decalage;
          rl.surArret?.();
          rl.surArret = undefined;
          break;
        }
      }
      if (rl.decalage < 0 && rl.vitesse > 0) rl.decalage = Math.max(rl.decalage, -0.2);
    } else if (rl.etat === "atterrit") {
      const p = Math.min(1, (t - rl.t0) / rl.dureeAtterrissage);
      const crete = 0.2;
      if (p < 0.35) rl.decalage = rl.d0 + (crete - rl.d0) * easeOut(p / 0.35);
      else rl.decalage = crete * (1 - easeOutBack((p - 0.35) / 0.65));
      if (p >= 1) {
        rl.decalage = 0;
        rl.vitesse = 0;
        rl.etat = "arret";
        rl.arretDemande = false;
      }
    }
  }

  // ───────── Effets ─────────

  private eclat(r: number, rang: number, n = 14, couleur?: string): void {
    const { x, y } = this.centreFx(r, rang);
    this.etincelles(x, y, this.reduit ? 3 : n, couleur);
    this.particules.push({ t: "anneau", x, y, r: 6, vr: 0.22, vie: 0, max: 420, c: couleur ?? "#f6dc82" });
  }

  private etincelles(x: number, y: number, n: number, couleur?: string): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 0.05 + Math.random() * 0.25;
      this.particules.push({
        t: "etincelle", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, r: 1.5 + Math.random() * 3.5, vie: 0,
        max: 400 + Math.random() * 500, c: couleur && i % 2 ? couleur : PAILLETTES[i % PAILLETTES.length], g: 0.0002,
      });
    }
  }

  private pieces(x: number, y: number, n: number, force = 1): void {
    if (this.reduit) n = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (0.25 + Math.random() * 0.45) * force;
      this.particules.push({
        t: "piece", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 5 + Math.random() * 6, a: Math.random() * 6,
        va: 0.006 + Math.random() * 0.012, vie: 0, max: 1600 + Math.random() * 900, g: 0.0011,
      });
    }
  }

  private texte(x: number, y: number, texte: string, taille = 26): void {
    this.particules.push({ t: "texte", x, y, vy: -0.045, texte, taille, vie: 0, max: 1400 });
  }

  private feuDArtifice(x: number, y: number): void {
    if (this.reduit) return;
    const c = ["#ffd36a", "#ff6fd8", "#7fd8ff", "#ffffff", "#9cff9c"][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2;
      const v = 0.18 + Math.random() * 0.08;
      this.particules.push({ t: "feu", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 1, c });
    }
    S.cliquetis();
  }

  private secouer(force = 1): void {
    if (this.reduit) return;
    this.hote.cabinet.animate(
      [0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: i === 6 ? "none" : `translate(${(Math.random() - 0.5) * 12 * force}px, ${(Math.random() - 0.5) * 8 * force}px)` })),
      { duration: 380, easing: "ease-out" },
    );
  }

  /** Fait défiler un compteur, avec le cliquetis des pièces. */
  private async compteur(de: number, a: number, duree: number, maj: (n: number) => void, surPalier?: (n: number) => void): Promise<void> {
    if (a <= de) {
      maj(a);
      return;
    }
    const debut = performance.now();
    await new Promise<void>((ok) => {
      const pas = () => {
        if (this.detruit) return ok();
        const p = this.rapide ? 1 : Math.min(1, (performance.now() - debut) / duree);
        const n = Math.round(de + (a - de) * (1 - (1 - p) ** 2));
        maj(n);
        surPalier?.(n);
        if (performance.now() - this.dernierCliquetis > 70 && p < 1) {
          this.dernierCliquetis = performance.now();
          S.cliquetis();
        }
        if (p >= 1) ok();
        else requestAnimationFrame(pas);
      };
      pas();
    });
  }

  // ───────── Présentation des gains ─────────

  private surligner(positions: Position[]): void {
    const t = performance.now();
    for (const [r, rang] of positions) this.anims[r][rang].gagne ||= t;
  }

  /** Gains d'un tour (base ou gratuit) : cases qui s'allument, fils d'or, éclats, pièces et compteur. */
  private async montrerGains(tour: ResultatTour, cumulAvant: number, multiplicateur = 1): Promise<void> {
    if (tour.total <= 0) return;
    const palier = palierGain(tour.total, this.mise);
    const rang = ["aucun", "petit", "joli", "gros", "enorme", "epique"].indexOf(palier);
    this.effacerGains();
    this.sombreCible = 0.6;
    const toutes: Position[] = tour.gains.flatMap((g) => g.positions);
    if (tour.bonus.montant > 0) toutes.push(...tour.bonus.positions);
    this.surligner(toutes);
    this.lignes = tour.gains.map((g, i) => ({ positions: g.positions, debut: performance.now() + i * 90 }));
    S.gain(Math.min(5, rang - 1 + (multiplicateur > 1 ? 1 : 0)));
    const vues = new Set<string>();
    for (const [r, rg] of toutes) {
      if (vues.has(`${r}${rg}`)) continue;
      vues.add(`${r}${rg}`);
      this.eclat(r, rg, 8 + rang * 4);
    }
    const c = this.centreGrilleFx();
    this.texte(c.x, c.y, `+${formatJetons(tour.total)}${multiplicateur > 1 ? `  (×${multiplicateur})` : ""}`, 24 + rang * 4);
    this.pieces(c.x, c.y + this.geo.ch, 8 + rang * 10);
    if (rang >= 2) {
      this.fontaine = { fin: performance.now() + 900 + rang * 300, debit: 0.04 + rang * 0.02, pluie: false };
      this.hote.cabinet.classList.add("fete");
      setTimeout(() => this.hote.cabinet.classList.remove("fete"), 1600 + rang * 300);
    }
    const duree = this.turbo ? 450 : [0, 750, 1300, 1600, 1800, 2000][rang];
    await this.compteur(cumulAvant, cumulAvant + tour.total, duree, (n) => this.ecouteurs.gain(n));
    // Plusieurs combinaisons : on les montre une à une (une seule fois, et pas en mode turbo).
    if (tour.gains.length > 1 && !this.turbo && !this.rapide) {
      for (const [i, g] of tour.gains.entries()) {
        await this.montrerUne(g, i);
        if (this.rapide) break;
      }
      this.surligner(toutes);
      this.lignes = tour.gains.map((g) => ({ positions: g.positions, debut: performance.now() - 1000 }));
    } else {
      await this.attendre(this.turbo ? 120 : 380);
    }
  }

  private async montrerUne(g: GainVoie, i: number): Promise<void> {
    this.effacerGains();
    this.sombreCible = 0.7;
    this.surligner(g.positions);
    this.lignes = [{ positions: g.positions, debut: performance.now() }];
    S.ligne(i);
    const derniere = g.positions.reduce((a, p) => (p[0] > a[0] ? p : a), g.positions[0]);
    const c = this.centreFx(derniere[0], derniere[1]);
    this.texte(c.x, c.y - 10, `${g.longueur} × ${NOMS[g.symbole]}${g.voies > 1 ? ` · ${g.voies} voies` : ""} : ${formatJetons(g.montant)}`, 17);
    await this.attendre(720);
  }

  /** Grand spectacle : titre qui grandit avec le montant (gros, énorme, épique), soleil, fontaine, feux. */
  private async grosGain(montant: number, titreForce?: string): Promise<void> {
    const scene = this.hote.scene;
    const bloc = document.createElement("div");
    bloc.className = "mas-annonce mas-gros";
    const titre = document.createElement("div");
    titre.className = "mas-titre";
    const valeur = document.createElement("div");
    valeur.className = "mas-montant";
    const aide = document.createElement("div");
    aide.className = "mas-aide";
    aide.textContent = "Toucher pour passer";
    bloc.append(titre, valeur, aide);
    scene.append(bloc);
    scene.classList.add("active");
    const paliers: [number, string][] = [[0, "gros"], [25 * this.mise, "enorme"], [50 * this.mise, "epique"]];
    let actuel = "";
    const majTitre = (n: number) => {
      const p = titreForce ? "force" : [...paliers].reverse().find(([s]) => n >= s)![1];
      if (p === actuel) return;
      actuel = p;
      titre.textContent = titreForce ?? TITRES_PALIERS[p as "gros"];
      titre.className = `mas-titre p-${p}`;
      void titre.offsetWidth;
      titre.classList.add("entre");
      S.palier();
      this.secouer(p === "epique" ? 1.6 : 1);
      const c = this.centreGrilleFx();
      this.etincelles(c.x, c.y, 60);
      this.feuDArtifice(c.x + (Math.random() - 0.5) * 200, c.y - 40);
    };
    this.rayonsCible = 1;
    this.fontaine = { fin: Infinity, debit: 0.16, pluie: false };
    S.fanfare();
    const ratio = montant / this.mise;
    const duree = this.turbo ? 1800 : ratio >= 50 ? 6500 : ratio >= 25 ? 4800 : 3200;
    const feux = setInterval(() => {
      if (!this.reduit && ratio >= 25) {
        const { w, h } = this.geoFx;
        this.feuDArtifice(w * (0.2 + Math.random() * 0.6), h * (0.15 + Math.random() * 0.35));
      }
    }, 650);
    const passer = () => this.sauter();
    scene.addEventListener("pointerdown", passer);
    const rapideAvant = this.rapide;
    this.rapide = false;
    await this.compteur(0, montant, duree, (n) => (valeur.textContent = formatJetons(n)), majTitre);
    scene.removeEventListener("pointerdown", passer);
    this.rapide = rapideAvant;
    valeur.classList.add("fin");
    this.etincelles(this.geoFx.w / 2, this.geoFx.h / 2, 80);
    await this.attendreClic(2200);
    clearInterval(feux);
    this.fontaine = null;
    this.rayonsCible = 0;
    bloc.classList.add("sort");
    scene.classList.remove("active");
    setTimeout(() => bloc.remove(), 400);
  }

  /** Annonce (tours gratuits, Pluie d'or, fin de fonction). */
  private async annonce(titre: string, sousTitre: string, classe: string, attente: number, auto: boolean): Promise<void> {
    const scene = this.hote.scene;
    const bloc = document.createElement("div");
    bloc.className = `mas-annonce ${classe}`;
    const t = document.createElement("div");
    t.className = "mas-titre entre";
    t.textContent = titre;
    const s = document.createElement("div");
    s.className = "mas-sous-titre";
    s.textContent = sousTitre;
    const aide = document.createElement("div");
    aide.className = "mas-aide";
    aide.textContent = auto ? "" : "Toucher pour continuer";
    bloc.append(t, s, aide);
    scene.append(bloc);
    scene.classList.add("active");
    this.rayonsCible = 0.7;
    await this.attendreClic(auto ? Math.min(attente, 2600) : attente);
    this.rayonsCible = 0;
    bloc.classList.add("sort");
    scene.classList.remove("active");
    setTimeout(() => bloc.remove(), 400);
    await this.attendre(250);
  }

  // ───────── Scénario complet d'un lancer ─────────

  async raconter(res: ResultatMachine, debut: number, auto: boolean): Promise<void> {
    this.mise = res.mise;
    await this.arreter(res.base.grille, debut);
    let cumul = 0;
    await this.montrerGains(res.base, cumul);
    cumul += res.base.total;
    if (res.pieces) cumul = await this.pluieDOr(res.pieces, res.base.grille, cumul, auto);
    if (res.libres) cumul = await this.toursGratuits(res.libres, cumul, auto);
    if (res.plafonne || cumul !== res.total) {
      cumul = res.total;
      this.ecouteurs.gain(cumul);
    }
    const fonction = !!(res.pieces || res.libres);
    if (res.total >= 10 * res.mise) await this.grosGain(res.total);
    else if (fonction) await this.annonce("Bravo !", `${formatJetons(res.total)} jetons gagnés`, "mas-fin", 2600, auto);
    this.rapide = false;
  }

  // ───────── Tours gratuits ─────────

  private async toursGratuits(libres: Libres, cumul: number, auto: boolean): Promise<number> {
    // Les BONUS de la grille s'emballent.
    S.fanfare();
    this.fontaine = { fin: performance.now() + 1800, debit: 0.12, pluie: true };
    await this.attendre(900);
    const premiers = libres.tours.length - libres.tours.reduce((a, t) => a + t.ajoutes, 0);
    await this.annonce("Tours gratuits", `${premiers} tours · le multiplicateur monte à chaque gain, jusqu'à ×${MULTIPLICATEUR_MAX}`, "mas-libres", 4500, auto);
    this.ecouteurs.mode("libres");
    let restants = premiers;
    let multiplicateur = 1;
    let total = 0;
    this.ecouteurs.libres({ restants, joues: 0, multiplicateur, total });
    for (const tour of libres.tours) {
      this.rapide = false;
      restants--;
      this.ecouteurs.libres({ restants, joues: tour.numero, multiplicateur, total });
      const debut = performance.now();
      this.lancer({ libres: true, turbo: this.turbo, mise: this.mise });
      await this.arreter(tour.grille, debut);
      await this.montrerGains(tour, cumul, tour.multiplicateur);
      cumul += tour.total;
      total += tour.total;
      if (tour.ajoutes) {
        restants += tour.ajoutes;
        S.relances();
        const c = this.centreGrilleFx();
        this.texte(c.x, c.y - 40, `+${tour.ajoutes} tours gratuits !`, 34);
        this.etincelles(c.x, c.y, 50, "#ff9be8");
        await this.attendre(900);
      }
      if (tour.total > 0 && multiplicateur < MULTIPLICATEUR_MAX) {
        multiplicateur++;
        S.multiplicateur(multiplicateur);
      }
      this.ecouteurs.libres({ restants, joues: tour.numero, multiplicateur, total });
      await this.attendre(this.turbo ? 120 : 300);
    }
    this.rapide = false;
    this.effacerGains();
    await this.annonce("Tours gratuits terminés", `${formatJetons(total)} jetons gagnés en ${libres.tours.length} tours`, "mas-fin", 3200, auto);
    this.ecouteurs.libres(null);
    this.ecouteurs.mode("base");
    this.libres = false;
    return cumul;
  }

  // ───────── Pluie d'or ─────────

  private async pluieDOr(p: Pieces, grille: Grille, cumul: number, auto: boolean): Promise<number> {
    // Les pièces de la grille sautent une à une.
    for (const d of p.depart) {
      this.anims[d.r][d.rang].saut = performance.now();
      this.anims[d.r][d.rang].gagne = performance.now();
      S.piece();
      this.eclat(d.r, d.rang, 12);
      await this.attendre(140);
    }
    this.sombreCible = 0.6;
    this.fontaine = { fin: performance.now() + 2500, debit: 0.2, pluie: true };
    await this.attendre(500);
    await this.annonce("Pluie d'or", "3 relances : chaque nouvelle pièce les remet à 3. Remplissez la grille pour le jackpot Grand.", "mas-pieces", 5000, auto);
    this.effacerGains();
    this.verrou = grille.map((col) => col.map((c) => (c.s === "piece" ? c : null)));
    this.ecouteurs.mode("pieces");
    this.ecouteurs.relances(3);
    for (const etape of p.etapes) {
      this.rapide = false;
      // Les cases vides tournent…
      const vides: Position[] = [];
      this.verrou.forEach((col, r) => col.forEach((c, rang) => !c && vides.push([r, rang])));
      for (const [r, rang] of vides) this.tourneCase[r][rang] = true;
      S.depart();
      await this.attendre(this.turbo ? 350 : 650);
      // … et s'arrêtent une à une.
      for (const [r, rang] of vides) {
        this.tourneCase[r][rang] = false;
        const nouvelle = etape.nouvelles.find((n) => n.r === r && n.rang === rang);
        if (nouvelle) {
          this.verrou[r][rang] = nouvelle.piece;
          const a = this.anims[r][rang];
          a.saut = a.eclair = performance.now();
          S.verrou();
          S.piece();
          this.eclat(r, rang, 22);
          const c = this.centreFx(r, rang);
          this.pieces(c.x, c.y, 10, 0.7);
          if (nouvelle.piece.j) {
            S.jackpot();
            this.ecouteurs.jackpot(nouvelle.piece.j);
            this.secouer(0.8);
          }
          await this.attendre(this.turbo ? 140 : 320);
        } else {
          S.arret(r);
          await this.attendre(this.turbo ? 25 : 60);
        }
      }
      if (etape.nouvelles.length) S.relances();
      this.ecouteurs.relances(etape.relances);
      await this.attendre(this.turbo ? 200 : 500);
    }
    this.ecouteurs.relances(null);
    // Ramassage : chaque pièce verse sa valeur dans le compteur.
    for (let r = 0; r < ROULEAUX; r++) {
      for (let rang = 0; rang < RANGEES; rang++) {
        const c = this.verrou[r][rang];
        if (!c) continue;
        const valeur = (c.v ?? 0) * this.mise;
        const a = this.anims[r][rang];
        a.gagne = a.saut = performance.now();
        const centre = this.centreFx(r, rang);
        this.texte(centre.x, centre.y, `+${formatJetons(valeur)}`, c.j ? 30 : 20);
        this.etincelles(centre.x, centre.y, 14);
        if (c.j) {
          S.jackpot();
          this.ecouteurs.jackpot(c.j);
          await this.compteur(cumul, cumul + valeur, 900, (n) => this.ecouteurs.gain(n));
          await this.annonce(`Jackpot ${NOMS_JACKPOTS[c.j]}`, `${formatJetons(valeur)} jetons`, `mas-jackpot j-${c.j}`, 2400, true);
        } else {
          await this.compteur(cumul, cumul + valeur, this.turbo ? 120 : 260, (n) => this.ecouteurs.gain(n));
        }
        cumul += valeur;
      }
    }
    if (p.grand) {
      const valeur = JACKPOTS.grand * this.mise;
      this.ecouteurs.jackpot("grand");
      S.jackpot();
      this.fontaine = { fin: performance.now() + 4000, debit: 0.3, pluie: true };
      await this.annonce("Jackpot Grand", `La grille est pleine : ${formatJetons(valeur)} jetons !`, "mas-jackpot j-grand", 4000, true);
      await this.compteur(cumul, cumul + valeur, 1500, (n) => this.ecouteurs.gain(n));
      cumul += valeur;
    }
    await this.attendre(500);
    this.verrou = null;
    this.effacerGains();
    this.ecouteurs.mode("base");
    return cumul;
  }

  // ───────── Rendu ─────────

  private boucle(t: number): void {
    if (this.detruit) return;
    const dt = Math.min(50, this.dernier ? t - this.dernier : 16);
    this.dernier = t;
    let tourne = false;
    for (const rl of this.rouleaux) {
      this.majRouleau(rl, dt, t);
      if (rl.etat === "tourne") tourne = true;
    }
    if (tourne && t - this.dernierRoulement > 90) {
      this.dernierRoulement = t;
      S.roulement();
    }
    this.sombre += (this.sombreCible - this.sombre) * Math.min(1, dt * 0.008);
    this.rayons += (this.rayonsCible - this.rayons) * Math.min(1, dt * 0.004);
    this.dessinerRouleaux(t);
    this.dessinerFx(t, dt);
    this.raf = requestAnimationFrame((x) => this.boucle(x));
  }

  private dessinerRouleaux(t: number): void {
    const toile = this.hote.rouleaux;
    const c = toile.getContext("2d")!;
    const { w, h, cw, ch, gx, gy, gap, dpr } = this.geo;
    if (!this.cache || !w) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    for (let r = 0; r < ROULEAUX; r++) {
      const x = gx + r * (cw + gap);
      const rl = this.rouleaux[r];
      // Fond du rouleau (cylindre)
      const fond = c.createLinearGradient(0, gy, 0, gy + ch * RANGEES);
      const teinte = this.verrou ? ["#0e0a04", "#1f1608", "#0e0a04"] : this.libres ? ["#14060c", "#2c0f1d", "#14060c"] : ["#0b0d0f", "#1b1f23", "#0b0d0f"];
      fond.addColorStop(0, teinte[0]);
      fond.addColorStop(0.5, teinte[1]);
      fond.addColorStop(1, teinte[2]);
      c.fillStyle = fond;
      arrondi(c, x, gy, cw, ch * RANGEES, 10);
      c.fill();

      c.save();
      arrondi(c, x, gy, cw, ch * RANGEES, 10);
      c.clip();

      if (this.verrou) this.dessinerColonnePieces(c, r, x, t);
      else {
        const flou = rl.etat === "tourne" && rl.vitesse > 0.012;
        for (let k = 0; k < rl.cases.length; k++) {
          const rang = k - 1;
          const y = gy + (rang + rl.decalage) * ch;
          if (y > gy + ch * RANGEES || y + ch < gy) continue;
          const anim = rang >= 0 && rang < RANGEES && rl.etat === "arret" ? this.anims[r][rang] : null;
          this.dessinerCase(c, rl.cases[k], x + cw / 2, y + ch / 2, flou, anim, t);
        }
      }
      // Ombres haut et bas : effet de cylindre.
      const o = c.createLinearGradient(0, gy, 0, gy + ch * RANGEES);
      o.addColorStop(0, "rgba(0,0,0,0.6)");
      o.addColorStop(0.14, "rgba(0,0,0,0)");
      o.addColorStop(0.86, "rgba(0,0,0,0)");
      o.addColorStop(1, "rgba(0,0,0,0.6)");
      c.fillStyle = o;
      c.fillRect(x, gy, cw, ch * RANGEES);
      c.restore();

      // Cadre doré de chaque rouleau
      c.lineWidth = 1.5;
      c.strokeStyle = "rgba(201,164,92,0.45)";
      arrondi(c, x, gy, cw, ch * RANGEES, 10);
      c.stroke();

      // Anticipation : cadre de feu qui pulse autour du rouleau.
      if (rl.anticipe) {
        const p = (t - rl.anticipe) / 1000;
        c.save();
        c.shadowColor = "#ffcf5a";
        c.shadowBlur = 18 + Math.sin(p * 18) * 8;
        c.lineWidth = 4;
        const g = c.createLinearGradient(x, gy + ch * 3, x, gy);
        g.addColorStop(0, "#ff4d2e");
        g.addColorStop(0.5, "#ffcf5a");
        g.addColorStop(1, "#fff6d2");
        c.strokeStyle = g;
        arrondi(c, x - 2, gy - 2, cw + 4, ch * RANGEES + 4, 12);
        c.stroke();
        c.restore();
        if (Math.random() < 0.5) {
          const a = this.hote.rouleaux.getBoundingClientRect();
          const b = this.hote.cabinet.getBoundingClientRect();
          this.particules.push({
            t: "etincelle", x: a.left - b.left + x + Math.random() * cw, y: a.top - b.top + gy + ch * RANGEES,
            vx: (Math.random() - 0.5) * 0.04, vy: -0.12 - Math.random() * 0.15, r: 1.5 + Math.random() * 2.5, vie: 0, max: 900, c: Math.random() < 0.5 ? "#ff8a3a" : "#ffe08a", g: 0,
          });
        }
      }
    }

    // Fils d'or entre les cases gagnantes (voies).
    for (const l of this.lignes) this.dessinerFils(c, l.positions, t - l.debut);

    // Cadres des cases gagnantes, par-dessus.
    for (let r = 0; r < ROULEAUX; r++) {
      for (let rang = 0; rang < RANGEES; rang++) {
        const a = this.anims[r][rang];
        if (!a.gagne || t < a.gagne || this.rouleaux[r].etat !== "arret") continue;
        const x = gx + r * (cw + gap);
        const y = gy + rang * ch;
        const p = (t - a.gagne) / 1000;
        c.save();
        c.shadowColor = "#ffd36a";
        c.shadowBlur = 14 + Math.sin(p * 6) * 6;
        c.lineWidth = 3;
        c.strokeStyle = "#f6dc82";
        arrondi(c, x + 3, y + 3, cw - 6, ch - 6, 10);
        c.stroke();
        c.restore();
        // Paillette qui fait le tour du cadre.
        const per = 2 * (cw + ch - 12);
        const d = (p * 260) % per;
        const pos = pointCadre(x + 3, y + 3, cw - 6, ch - 6, d);
        etoileFx(c, pos.x, pos.y, 7, "#ffffff");
        const pos2 = pointCadre(x + 3, y + 3, cw - 6, ch - 6, (d + per / 2) % per);
        etoileFx(c, pos2.x, pos2.y, 5, "#fff3c4");
      }
    }
  }

  private dessinerCase(c: CanvasRenderingContext2D, k: Case, cx: number, cy: number, flou: boolean, anim: AnimCase | null, t: number): void {
    const cache = this.cache!;
    const img = (flou ? cache.flou : cache.net).get(cleImage(k));
    if (!img) return;
    const taille = img.width / this.geo.dpr;
    let echelle = 1;
    let alpha = 1;
    let rot = 0;
    if (anim) {
      if (anim.saut && t - anim.saut < 420) {
        const p = (t - anim.saut) / 420;
        echelle *= 1 + Math.sin(p * Math.PI) * 0.22;
      }
      if (anim.gagne && t >= anim.gagne) {
        const p = (t - anim.gagne) / 1000;
        echelle *= 1.06 + Math.sin(p * 7) * 0.06;
        rot = Math.sin(p * 4) * 0.04;
      } else if (this.sombre > 0.01) {
        alpha = 1 - this.sombre * 0.7;
      }
    }
    c.save();
    c.globalAlpha = alpha;
    c.translate(cx, cy);
    c.rotate(rot);
    c.scale(echelle, echelle);
    c.drawImage(img, -taille / 2, -taille / 2, taille, taille);
    if (k.s === "piece" && !flou) texteSurPiece(c, k, this.mise, 0, 0, taille);
    if (anim?.eclair && t - anim.eclair < 350) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 1 - (t - anim.eclair) / 350;
      c.fillStyle = "#fff6d2";
      c.beginPath();
      c.arc(0, 0, taille * 0.45, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // Reflet qui passe de temps en temps sur les beaux symboles au repos.
    if (anim && !flou && (k.s === "diamant" || k.s === "wild" || k.s === "bonus") && !anim.gagne) {
      const cycle = (t / 1000 + cx * 0.013) % 4;
      if (cycle < 0.6) etoileFx(c, cx + taille * 0.22, cy - taille * 0.25, 9 * Math.sin((cycle / 0.6) * Math.PI), "#ffffff");
    }
  }

  private dessinerColonnePieces(c: CanvasRenderingContext2D, r: number, x: number, t: number): void {
    const { cw, ch, gy } = this.geo;
    for (let rang = 0; rang < RANGEES; rang++) {
      const cx = x + cw / 2;
      const cy = gy + rang * ch + ch / 2;
      const k = this.verrou![r][rang];
      if (k) {
        c.save();
        c.fillStyle = "rgba(255,200,80,0.08)";
        arrondi(c, x + 4, gy + rang * ch + 4, cw - 8, ch - 8, 10);
        c.fill();
        c.restore();
        this.dessinerCase(c, k, cx, cy, false, this.anims[r][rang], t);
      } else if (this.tourneCase[r][rang]) {
        // Case qui tourne : pièces floues qui défilent.
        const phase = Math.floor(t / 70) % 3;
        if (phase !== 2) {
          const img = this.cache!.flou.get("piece:");
          if (img) {
            const s = img.width / this.geo.dpr;
            c.globalAlpha = 0.55;
            c.drawImage(img, cx - s / 2, cy - s / 2 + ((t / 3) % ch) - ch / 2, s, s);
            c.globalAlpha = 1;
          }
        }
      } else {
        c.strokeStyle = "rgba(201,164,92,0.18)";
        c.lineWidth = 1;
        arrondi(c, x + 8, gy + rang * ch + 8, cw - 16, ch - 16, 10);
        c.stroke();
      }
    }
  }

  private dessinerFils(c: CanvasRenderingContext2D, positions: Position[], age: number): void {
    if (age < 0) return;
    const { cw, ch, gx, gy, gap } = this.geo;
    const centre = ([r, rang]: Position) => ({ x: gx + r * (cw + gap) + cw / 2, y: gy + rang * ch + ch / 2 });
    const parRouleau: Position[][] = [];
    for (const p of positions) (parRouleau[p[0]] ??= []).push(p);
    const progression = Math.min(1, age / 380);
    const segments: [{ x: number; y: number }, { x: number; y: number }][] = [];
    for (let r = 0; r < parRouleau.length - 1; r++)
      for (const a of parRouleau[r] ?? []) for (const b of parRouleau[r + 1] ?? []) segments.push([centre(a), centre(b)]);
    const n = parRouleau.length - 1;
    c.save();
    c.lineCap = "round";
    for (const passe of [0, 1]) {
      c.lineWidth = passe ? 2.5 : 9;
      c.strokeStyle = passe ? "#fff6d2" : "rgba(255,200,80,0.28)";
      c.shadowColor = "#ffcf5a";
      c.shadowBlur = passe ? 8 : 0;
      for (const [a, b] of segments) {
        const indice = Math.round(((a.x - gx - cw / 2) / (cw + gap)));
        const debut = indice / n;
        const fin = (indice + 1) / n;
        if (progression <= debut) continue;
        const p = Math.min(1, (progression - debut) / (fin - debut));
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
        c.stroke();
      }
    }
    c.restore();
  }

  private dessinerFx(t: number, dt: number): void {
    const toile = this.hote.fx;
    const c = toile.getContext("2d")!;
    const { w, h, dpr } = this.geoFx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    // Soleil Art déco qui tourne derrière les annonces.
    if (this.rayons > 0.01) {
      c.save();
      c.translate(w / 2, h * 0.45);
      c.rotate(t / 4000);
      c.globalAlpha = this.rayons * 0.3;
      const R = Math.max(w, h);
      for (let i = 0; i < 24; i++) {
        c.rotate((Math.PI * 2) / 24);
        const g = c.createLinearGradient(0, 0, R, 0);
        g.addColorStop(0, "rgba(255,214,110,0.9)");
        g.addColorStop(1, "rgba(255,214,110,0)");
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(R, -R * 0.07);
        c.lineTo(R, R * 0.07);
        c.closePath();
        c.fill();
      }
      c.restore();
    }

    // Fontaine ou pluie de pièces.
    if (this.fontaine) {
      if (t > this.fontaine.fin) this.fontaine = null;
      else {
        const n = this.fontaine.debit * dt * (this.reduit ? 0.15 : 1);
        for (let i = 0; i < n || Math.random() < n - i; i++) {
          if (this.fontaine.pluie)
            this.particules.push({ t: "piece", x: Math.random() * w, y: -20, vx: (Math.random() - 0.5) * 0.06, vy: 0.1 + Math.random() * 0.2, r: 5 + Math.random() * 6, a: Math.random() * 6, va: 0.008 + Math.random() * 0.01, vie: 0, max: 3000, g: 0.0004 });
          else this.pieces(w / 2 + (Math.random() - 0.5) * w * 0.3, h + 10, 1, 1.6 + Math.random() * 0.6);
          if (i > 20) break;
        }
      }
    }

    // Scintillement permanent et discret sur le fronton.
    this.scintillement += dt;
    if (this.scintillement > 400 && !this.reduit) {
      this.scintillement = 0;
      this.particules.push({ t: "etincelle", x: Math.random() * w, y: Math.random() * h * 0.12, vx: 0, vy: 0, r: 2 + Math.random() * 2, vie: 0, max: 700, c: "#fff3c4", g: 0 });
    }

    c.save();
    const vivantes: Particule[] = [];
    for (const p of this.particules) {
      if (p.t === "feu") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.00025 * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.vie -= dt / 1300;
        if (p.vie <= 0) continue;
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = p.vie;
        c.fillStyle = p.c;
        c.beginPath();
        c.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        c.fill();
        vivantes.push(p);
        continue;
      }
      p.vie += dt;
      if (p.vie > p.max) continue;
      const f = 1 - p.vie / p.max;
      if (p.t === "piece") {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.a += p.va * dt;
        if (p.y > h + 40) continue;
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = Math.min(1, f * 3);
        const lw = Math.abs(Math.cos(p.a)) * p.r + 0.6;
        const g = c.createLinearGradient(p.x - lw, p.y - p.r, p.x + lw, p.y + p.r);
        g.addColorStop(0, "#fff3c4");
        g.addColorStop(0.5, "#e2b04a");
        g.addColorStop(1, "#8a6420");
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(p.x, p.y, lw, p.r, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "rgba(90,60,10,0.6)";
        c.lineWidth = 0.8;
        c.stroke();
      } else if (p.t === "etincelle") {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = f;
        etoileFx(c, p.x, p.y, p.r * (0.6 + f), p.c);
      } else if (p.t === "anneau") {
        p.r += p.vr * dt;
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = f * 0.8;
        c.strokeStyle = p.c;
        c.lineWidth = 3 * f + 0.5;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        c.stroke();
      } else if (p.t === "texte") {
        p.y += p.vy * dt;
        const entree = Math.min(1, p.vie / 180);
        c.globalCompositeOperation = "source-over";
        c.globalAlpha = Math.min(1, f * 2.5);
        c.save();
        c.translate(p.x, p.y);
        const e = 0.6 + easeOutBack(entree) * 0.4;
        c.scale(e, e);
        c.font = `italic 600 ${p.taille}px "Fraunces", Georgia, serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineJoin = "round";
        c.lineWidth = p.taille * 0.18;
        c.strokeStyle = "rgba(25,12,2,0.9)";
        c.strokeText(p.texte, 0, 0);
        const g = c.createLinearGradient(0, -p.taille / 2, 0, p.taille / 2);
        g.addColorStop(0, "#fff6d2");
        g.addColorStop(0.5, "#f3c55a");
        g.addColorStop(1, "#c08a2e");
        c.fillStyle = g;
        c.fillText(p.texte, 0, 0);
        c.restore();
      }
      vivantes.push(p);
    }
    c.restore();
    this.particules = vivantes.length > 1500 ? vivantes.slice(-1500) : vivantes;
  }
}

function arrondi(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function etoileFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, couleur: string): void {
  if (r <= 0.2) return;
  c.save();
  c.fillStyle = couleur;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.22 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.restore();
}

/** Point situé à la distance d le long du contour d'un rectangle (sens horaire). */
function pointCadre(x: number, y: number, w: number, h: number, d: number): { x: number; y: number } {
  if (d < w) return { x: x + d, y };
  d -= w;
  if (d < h) return { x: x + w, y: y + d };
  d -= h;
  if (d < w) return { x: x + w - d, y: y + h };
  d -= w;
  return { x, y: y + h - d };
}
