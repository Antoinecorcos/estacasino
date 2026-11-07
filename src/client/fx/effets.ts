import { formatJetons } from "../../shared/regles";
import { sons } from "./sons";

// Effets visuels : jetons qui volent, montants qui s'envolent, pièces, bannière de gros gain.
// Tout est désactivé si la personne a demandé à réduire les animations.

export const mouvementReduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Cible = string | Element | null | undefined;

export function centre(c: Cible): { x: number; y: number } | null {
  const e = typeof c === "string" ? document.querySelector(c) : c;
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return b.width || b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
}

/** Couleur d'un jeton selon sa valeur (mêmes teintes que les jetons de l'interface). */
export function couleurJeton(v: number): string {
  if (v >= 5000) return "#0B0D0E";
  if (v >= 1000) return getComputedStyle(document.documentElement).getPropertyValue("--feutre").trim() || "#0F3D31";
  if (v >= 500) return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#C9A45C";
  if (v >= 100) return "#F2EDE4";
  if (v >= 50) return "#C56B4C";
  return "#8C96A0";
}

/** Un jeton vole d'un élément à un autre en décrivant un arc. */
export function volerJeton(de: Cible, vers: Cible, { valeur = 100, delai = 0, duree = 480 } = {}): Promise<void> {
  const a = centre(de);
  const b = centre(vers);
  if (!a || !b || mouvementReduit()) return Promise.resolve();
  const d = document.createElement("div");
  d.className = "fjeton";
  d.style.setProperty("--c", couleurJeton(valeur));
  document.body.append(d);
  const lever = Math.min(90, 30 + Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
  const P = (x: number, y: number, s = 1) => `translate(${x - 12}px, ${y - 12}px) scale(${s})`;
  d.animate(
    [{ transform: P(a.x, a.y, 0.75) }, { transform: P((a.x + b.x) / 2, (a.y + b.y) / 2 - lever, 1.15), offset: 0.5 }, { transform: P(b.x, b.y, 0.9) }],
    { duration: duree, delay: delai, easing: "cubic-bezier(.3,.1,.3,1)", fill: "both" },
  );
  return new Promise((r) =>
    setTimeout(() => {
      d.remove();
      sons.tic();
      r();
    }, duree + delai),
  );
}

export function texteFlottant(at: Cible, texte: string, perte = false): void {
  const p = centre(at);
  if (!p) return;
  const d = document.createElement("div");
  d.className = `texte-flottant${perte ? " perte" : ""}`;
  d.textContent = texte;
  d.style.left = `${p.x}px`;
  d.style.top = `${p.y}px`;
  document.body.append(d);
  setTimeout(() => d.remove(), 1400);
}

export function secouer(c: Cible, amplitude = 7): void {
  const e = typeof c === "string" ? document.querySelector(c) : c;
  if (!e || mouvementReduit()) return;
  e.animate([0, -amplitude, amplitude, -amplitude * 0.6, amplitude * 0.5, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 340 });
}

export function rebond(c: Cible): void {
  const e = typeof c === "string" ? document.querySelector(c) : c;
  if (!e || mouvementReduit()) return;
  e.animate([{ transform: "scale(.6)", opacity: 0.4 }, { transform: "scale(1)", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2,1.6,.4,1)" });
}

// ───── Pièces dorées (canvas plein écran) ─────

interface Piece {
  x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; vie: number; c: string;
}
let pieces: Piece[] = [];
let toile: HTMLCanvasElement | null = null;
let enCours = false;

function boucle(): void {
  const c = toile!;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, c.width, c.height);
  pieces = pieces.filter((p) => p.vie > 0 && p.y < innerHeight + 30);
  for (const p of pieces) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.992;
    p.a += p.va;
    p.vie -= 1;
    const w = Math.abs(Math.cos(p.a)) * p.r + 0.8;
    x.globalAlpha = Math.min(1, p.vie / 30);
    x.fillStyle = p.c;
    x.beginPath();
    x.ellipse(p.x, p.y, w, p.r, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "rgba(255,250,215,.7)";
    x.beginPath();
    x.ellipse(p.x - w * 0.2, p.y - p.r * 0.25, w * 0.35, p.r * 0.35, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  if (pieces.length) requestAnimationFrame(boucle);
  else enCours = false;
}

export function pluieDePieces(at: Cible, nombre: number, pluie = false): void {
  if (mouvementReduit()) return;
  if (!toile) {
    toile = document.createElement("canvas");
    toile.className = "fx-toile";
    document.body.append(toile);
  }
  if (toile.width !== innerWidth || toile.height !== innerHeight) {
    toile.width = innerWidth;
    toile.height = innerHeight;
  }
  const o = pluie ? null : centre(at);
  if (!pluie && !o) return;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#C9A45C";
  const couleurs = [accent, "#F6DC82", "#B8902D", "#FFF3C4"];
  for (let i = 0; i < nombre; i++) {
    const an = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 7;
    pieces.push(
      pluie
        ? { x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.7, vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random() * 3, r: 4 + Math.random() * 4, a: Math.random() * 6, va: 0.1 + Math.random() * 0.2, vie: 280, c: couleurs[i % 4] }
        : { x: o!.x, y: o!.y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 4.5, r: 3 + Math.random() * 4, a: Math.random() * 6, va: 0.1 + Math.random() * 0.25, vie: 80 + Math.random() * 40, c: couleurs[i % 4] },
    );
  }
  if (!enCours) {
    enCours = true;
    requestAnimationFrame(boucle);
  }
}

export function banniere(titre: string, sousTitre?: string): void {
  const d = document.createElement("div");
  d.className = "fx-banniere";
  d.setAttribute("role", "status");
  const b = document.createElement("b");
  b.textContent = titre;
  d.append(b);
  if (sousTitre) {
    const s = document.createElement("span");
    s.textContent = sousTitre;
    d.append(s);
  }
  document.body.append(d);
  setTimeout(() => d.remove(), 2800);
}

/** Célèbre un gain : son, montant qui s'envole, pièces ; bannière et pluie pour les gros gains. */
export function celebrer(net: number, mise: number, at: Cible, titre?: string): void {
  const ratio = net / Math.max(mise, 1);
  const palier = ratio >= 20 || net >= 20_000 ? 2 : ratio >= 5 || net >= 5_000 ? 1 : 0;
  sons.gain(palier);
  texteFlottant(at, `+${formatJetons(net)}`);
  pluieDePieces(at, palier === 2 ? 70 : palier === 1 ? 44 : Math.min(26, 10 + Math.round(ratio * 6)));
  if (titre || palier) banniere(titre ?? (palier === 2 ? "Coup de maître" : "Beau coup"), `+${formatJetons(net)} jetons`);
  if (palier) pluieDePieces(null, palier === 2 ? 150 : 60, true);
}
