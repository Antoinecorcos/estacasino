import type { Case, Jackpot, Symbole } from "../../shared/machine";

// Symboles « Années folles » dessinés en vectoriel sur canvas, puis mis en cache à la bonne taille
// (une version nette et une version floutée pour les rouleaux en mouvement).

type Ctx = CanvasRenderingContext2D;

const OR = ["#fff6d2", "#f3d58a", "#c99a3e", "#8a6420", "#f6dc82"];
const POLICE = '"Fraunces", Georgia, serif';
/** Taille du dessin en cours : le flou des ombres ne suit pas la mise à l'échelle du contexte. */
let E = 100;

function degradeOr(c: Ctx, y0: number, y1: number): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, OR[0]);
  g.addColorStop(0.3, OR[1]);
  g.addColorStop(0.55, OR[2]);
  g.addColorStop(0.8, OR[3]);
  g.addColorStop(1, OR[4]);
  return g;
}

function reflet(c: Ctx, chemin: () => void, intensite = 0.45): void {
  c.save();
  chemin();
  c.clip();
  const g = c.createLinearGradient(-0.5, -0.5, 0.3, 0.2);
  g.addColorStop(0, `rgba(255,255,255,${intensite})`);
  g.addColorStop(0.45, "rgba(255,255,255,0.05)");
  g.addColorStop(0.5, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(-1, -1, 2, 2);
  c.restore();
}

// ───────── Couleurs (pique, cœur, carreau, trèfle) en pierres précieuses ─────────

function cheminCoeur(c: Ctx) {
  c.beginPath();
  c.moveTo(0, 0.4);
  c.bezierCurveTo(-0.16, 0.26, -0.48, 0.06, -0.48, -0.15);
  c.bezierCurveTo(-0.48, -0.38, -0.2, -0.47, 0, -0.26);
  c.bezierCurveTo(0.2, -0.47, 0.48, -0.38, 0.48, -0.15);
  c.bezierCurveTo(0.48, 0.06, 0.16, 0.26, 0, 0.4);
  c.closePath();
}
function cheminPique(c: Ctx) {
  c.beginPath();
  c.moveTo(0, -0.44);
  c.bezierCurveTo(-0.16, -0.28, -0.48, -0.08, -0.48, 0.1);
  c.bezierCurveTo(-0.48, 0.3, -0.22, 0.36, -0.06, 0.2);
  c.lineTo(-0.16, 0.44);
  c.lineTo(0.16, 0.44);
  c.lineTo(0.06, 0.2);
  c.bezierCurveTo(0.22, 0.36, 0.48, 0.3, 0.48, 0.1);
  c.bezierCurveTo(0.48, -0.08, 0.16, -0.28, 0, -0.44);
  c.closePath();
}
function cheminCarreau(c: Ctx) {
  c.beginPath();
  c.moveTo(0, -0.46);
  c.quadraticCurveTo(0.13, -0.14, 0.37, 0);
  c.quadraticCurveTo(0.13, 0.14, 0, 0.46);
  c.quadraticCurveTo(-0.13, 0.14, -0.37, 0);
  c.quadraticCurveTo(-0.13, -0.14, 0, -0.46);
  c.closePath();
}
function cheminTrefle(c: Ctx) {
  c.beginPath();
  c.arc(0, -0.2, 0.18, 0, Math.PI * 2);
  c.moveTo(-0.02, 0.06);
  c.arc(-0.2, 0.06, 0.18, 0, Math.PI * 2);
  c.moveTo(0.38, 0.06);
  c.arc(0.2, 0.06, 0.18, 0, Math.PI * 2);
  c.moveTo(0, 0);
  c.lineTo(-0.14, 0.44);
  c.lineTo(0.14, 0.44);
  c.closePath();
}

const COULEURS_GEMMES: Record<string, [string, string, string]> = {
  pique: ["#7ff0c0", "#1f9a6c", "#0b3d2b"],
  coeur: ["#ff9aa2", "#d23345", "#5a0d18"],
  carreau: ["#a9cdff", "#3a73da", "#0f2557"],
  trefle: ["#e2b8ff", "#8c4fd0", "#341556"],
};

function gemme(c: Ctx, s: keyof typeof COULEURS_GEMMES, chemin: (c: Ctx) => void) {
  const [clair, moyen, sombre] = COULEURS_GEMMES[s];
  // Éventail Art déco discret derrière la couleur.
  c.save();
  c.globalAlpha = 0.22;
  c.strokeStyle = moyen;
  c.lineWidth = 0.012;
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + ((i + 0.5) / 8) * Math.PI;
    c.beginPath();
    c.moveTo(0, 0.32);
    c.lineTo(Math.cos(a) * 0.5, 0.32 + Math.sin(a) * 0.5);
    c.stroke();
  }
  c.restore();
  c.save();
  c.shadowColor = moyen;
  c.shadowBlur = 0.12 * E;
  chemin(c);
  const g = c.createRadialGradient(-0.12, -0.18, 0.02, 0, 0, 0.55);
  g.addColorStop(0, clair);
  g.addColorStop(0.45, moyen);
  g.addColorStop(1, sombre);
  c.fillStyle = g;
  c.fill();
  c.restore();
  chemin(c);
  c.lineWidth = 0.045;
  c.strokeStyle = degradeOr(c, -0.45, 0.45);
  c.stroke();
  reflet(c, () => chemin(c));
}

// ───────── Symboles forts ─────────

function perles(c: Ctx) {
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = Math.PI * (0.08 + 0.84 * t);
    const x = Math.cos(a) * -0.4;
    const y = -0.32 + Math.sin(a) * 0.5 - 0.06;
    const r = 0.055 + Math.sin(t * Math.PI) * 0.018;
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.6, "#e9e2d6");
    g.addColorStop(1, "#8f8778");
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  // Pendentif : un rubis serti d'or.
  c.save();
  c.translate(0, 0.27);
  c.fillStyle = degradeOr(c, -0.12, 0.05);
  c.beginPath();
  c.ellipse(0, -0.08, 0.06, 0.04, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.moveTo(0, -0.06);
  c.bezierCurveTo(0.14, 0.0, 0.1, 0.14, 0, 0.18);
  c.bezierCurveTo(-0.1, 0.14, -0.14, 0.0, 0, -0.06);
  const r = c.createRadialGradient(-0.03, 0.03, 0.01, 0, 0.06, 0.16);
  r.addColorStop(0, "#ffb3b8");
  r.addColorStop(0.5, "#d0202f");
  r.addColorStop(1, "#4d0610");
  c.fillStyle = r;
  c.shadowColor = "#ff3344";
  c.shadowBlur = 0.1 * E;
  c.fill();
  c.shadowBlur = 0 * E;
  c.lineWidth = 0.02;
  c.strokeStyle = degradeOr(c, -0.06, 0.18);
  c.stroke();
  c.restore();
}

function chapeau(c: Ctx) {
  c.save();
  c.rotate(-0.12);
  // Bord
  c.beginPath();
  c.ellipse(0, 0.26, 0.44, 0.1, 0, 0, Math.PI * 2);
  let g = c.createLinearGradient(0, 0.16, 0, 0.36);
  g.addColorStop(0, "#3a3d44");
  g.addColorStop(1, "#08090b");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.025;
  c.strokeStyle = degradeOr(c, 0.16, 0.36);
  c.stroke();
  // Haut de forme
  c.beginPath();
  c.moveTo(-0.26, 0.24);
  c.lineTo(-0.22, -0.36);
  c.quadraticCurveTo(0, -0.42, 0.22, -0.36);
  c.lineTo(0.26, 0.24);
  c.quadraticCurveTo(0, 0.3, -0.26, 0.24);
  g = c.createLinearGradient(-0.26, 0, 0.26, 0);
  g.addColorStop(0, "#050506");
  g.addColorStop(0.35, "#4b4f58");
  g.addColorStop(0.5, "#1c1e22");
  g.addColorStop(1, "#050506");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.02;
  c.strokeStyle = "rgba(246,220,130,0.6)";
  c.stroke();
  // Ruban doré
  c.beginPath();
  c.moveTo(-0.245, 0.06);
  c.lineTo(0.245, 0.06);
  c.lineTo(0.255, 0.18);
  c.quadraticCurveTo(0, 0.23, -0.255, 0.18);
  c.closePath();
  c.fillStyle = degradeOr(c, 0.06, 0.2);
  c.fill();
  // Plume
  c.beginPath();
  c.moveTo(0.2, 0.1);
  c.bezierCurveTo(0.38, -0.05, 0.42, -0.3, 0.32, -0.46);
  c.bezierCurveTo(0.28, -0.3, 0.26, -0.1, 0.2, 0.1);
  c.fillStyle = "#c23a4a";
  c.fill();
  c.restore();
}

function cocktail(c: Ctx) {
  // Coupe
  c.save();
  c.beginPath();
  c.moveTo(-0.38, -0.34);
  c.lineTo(0.38, -0.34);
  c.lineTo(0, 0.08);
  c.closePath();
  c.fillStyle = "rgba(220,240,255,0.12)";
  c.fill();
  // Liquide
  c.save();
  c.clip();
  const g = c.createLinearGradient(0, -0.24, 0, 0.08);
  g.addColorStop(0, "#ffe7a3");
  g.addColorStop(0.5, "#f0a83a");
  g.addColorStop(1, "#b5541a");
  c.fillStyle = g;
  c.fillRect(-0.5, -0.24, 1, 0.4);
  c.fillStyle = "rgba(255,255,255,0.5)";
  c.fillRect(-0.5, -0.245, 1, 0.02);
  c.restore();
  c.lineWidth = 0.03;
  c.strokeStyle = "#e8f4ff";
  c.lineJoin = "round";
  c.stroke();
  // Pied
  c.beginPath();
  c.moveTo(0, 0.08);
  c.lineTo(0, 0.36);
  c.stroke();
  c.beginPath();
  c.ellipse(0, 0.38, 0.17, 0.045, 0, 0, Math.PI * 2);
  c.fillStyle = "rgba(220,240,255,0.25)";
  c.fill();
  c.stroke();
  // Olive et pique
  c.strokeStyle = degradeOr(c, -0.45, 0);
  c.lineWidth = 0.025;
  c.beginPath();
  c.moveTo(-0.22, -0.46);
  c.lineTo(0.12, -0.08);
  c.stroke();
  const o = c.createRadialGradient(-0.07, -0.25, 0.01, -0.05, -0.22, 0.1);
  o.addColorStop(0, "#d6f08a");
  o.addColorStop(0.6, "#6f9a2a");
  o.addColorStop(1, "#2f4a10");
  c.fillStyle = o;
  c.beginPath();
  c.ellipse(-0.05, -0.22, 0.085, 0.07, 0.8, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#c8323a";
  c.beginPath();
  c.arc(-0.02, -0.24, 0.025, 0, Math.PI * 2);
  c.fill();
  // Reflet sur la coupe
  c.strokeStyle = "rgba(255,255,255,0.7)";
  c.lineWidth = 0.02;
  c.beginPath();
  c.moveTo(-0.28, -0.3);
  c.lineTo(-0.1, -0.1);
  c.stroke();
  c.restore();
}

function diamant(c: Ctx) {
  const haut = -0.3;
  const ceinture = -0.08;
  const pts = {
    t1: [-0.2, haut], t2: [0.2, haut],
    g1: [-0.44, ceinture], g2: [-0.15, ceinture], g3: [0.15, ceinture], g4: [0.44, ceinture],
    p: [0, 0.44],
  } as const;
  const facette = (points: readonly (readonly [number, number])[], couleur: string) => {
    c.beginPath();
    c.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath();
    c.fillStyle = couleur;
    c.fill();
  };
  c.save();
  c.shadowColor = "#7fd8ff";
  c.shadowBlur = 0.16 * E;
  facette([pts.t1, pts.t2, pts.g4, pts.p, pts.g1], "#5cc4f0");
  c.restore();
  facette([pts.t1, pts.t2, pts.g3, pts.g2], "#e9fbff");
  facette([pts.t1, pts.g2, pts.g1], "#a8e6ff");
  facette([pts.t2, pts.g4, pts.g3], "#7fd2f7");
  facette([pts.g1, pts.g2, pts.p], "#3f9fdc");
  facette([pts.g2, pts.g3, pts.p], "#b9ecff");
  facette([pts.g3, pts.g4, pts.p], "#2a78c0");
  c.strokeStyle = "rgba(255,255,255,0.85)";
  c.lineWidth = 0.014;
  c.beginPath();
  c.moveTo(pts.t1[0], pts.t1[1]);
  c.lineTo(pts.t2[0], pts.t2[1]);
  c.lineTo(pts.g4[0], pts.g4[1]);
  c.lineTo(pts.p[0], pts.p[1]);
  c.lineTo(pts.g1[0], pts.g1[1]);
  c.closePath();
  c.moveTo(pts.g1[0], pts.g1[1]);
  c.lineTo(pts.g4[0], pts.g4[1]);
  c.moveTo(pts.g2[0], pts.g2[1]);
  c.lineTo(pts.p[0], pts.p[1]);
  c.lineTo(pts.g3[0], pts.g3[1]);
  c.moveTo(pts.t1[0], pts.t1[1]);
  c.lineTo(pts.g2[0], pts.g2[1]);
  c.moveTo(pts.t2[0], pts.t2[1]);
  c.lineTo(pts.g3[0], pts.g3[1]);
  c.stroke();
  etoile(c, 0.22, -0.32, 0.09);
}

function etoile(c: Ctx, x: number, y: number, r: number) {
  c.save();
  c.fillStyle = "#ffffff";
  c.shadowColor = "#ffffff";
  c.shadowBlur = 0.06 * E;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? r * 0.2 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
  c.restore();
}

function rayons(c: Ctx, n: number, r0: number, r1: number, couleur: string, largeur: number) {
  c.save();
  c.strokeStyle = couleur;
  c.lineWidth = largeur;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    c.stroke();
  }
  c.restore();
}

function plaqueTexte(c: Ctx, texte: string, tailleRel: number, yRel = 0, contour = "#2a1606") {
  c.save();
  // Texte dessiné à l'échelle réelle : les polices de moins d'un pixel sont mal rendues.
  c.scale(1 / E, 1 / E);
  const taille = tailleRel * E;
  const y = yRel * E;
  c.font = `italic 600 ${taille}px ${POLICE}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = taille * 0.16;
  c.strokeStyle = contour;
  c.strokeText(texte, 0, y);
  c.fillStyle = degradeOr(c, y - taille / 2, y + taille / 2);
  c.fillText(texte, 0, y);
  c.restore();
}

function wild(c: Ctx) {
  rayons(c, 24, 0.12, 0.5, "rgba(246,220,130,0.35)", 0.02);
  const forme = () => {
    c.beginPath();
    c.moveTo(-0.44, -0.2);
    c.lineTo(-0.3, -0.3);
    c.lineTo(0.3, -0.3);
    c.lineTo(0.44, -0.2);
    c.lineTo(0.44, 0.2);
    c.lineTo(0.3, 0.3);
    c.lineTo(-0.3, 0.3);
    c.lineTo(-0.44, 0.2);
    c.closePath();
  };
  c.save();
  c.shadowColor = "#f3c55a";
  c.shadowBlur = 0.14 * E;
  forme();
  const g = c.createLinearGradient(0, -0.3, 0, 0.3);
  g.addColorStop(0, "#5a0f1c");
  g.addColorStop(1, "#1e0308");
  c.fillStyle = g;
  c.fill();
  c.restore();
  forme();
  c.lineWidth = 0.045;
  c.strokeStyle = degradeOr(c, -0.3, 0.3);
  c.stroke();
  // Filets Art déco
  c.strokeStyle = "rgba(246,220,130,0.55)";
  c.lineWidth = 0.01;
  c.strokeRect(-0.36, -0.22, 0.72, 0.44);
  plaqueTexte(c, "WILD", 0.27, 0.01);
  reflet(c, forme, 0.25);
}

function bonus(c: Ctx) {
  rayons(c, 32, 0.3, 0.5, "rgba(255,190,240,0.4)", 0.018);
  c.save();
  c.shadowColor = "#ff6fd8";
  c.shadowBlur = 0.16 * E;
  c.beginPath();
  c.arc(0, 0, 0.36, 0, Math.PI * 2);
  c.fillStyle = degradeOr(c, -0.36, 0.36);
  c.fill();
  c.restore();
  c.beginPath();
  c.arc(0, 0, 0.3, 0, Math.PI * 2);
  const g = c.createRadialGradient(0, -0.1, 0.02, 0, 0, 0.32);
  g.addColorStop(0, "#c04fb0");
  g.addColorStop(0.6, "#5b1460");
  g.addColorStop(1, "#22052a");
  c.fillStyle = g;
  c.fill();
  // Soleil levant Art déco
  c.save();
  c.beginPath();
  c.arc(0, 0, 0.3, 0, Math.PI * 2);
  c.clip();
  c.strokeStyle = "rgba(255,225,150,0.6)";
  c.lineWidth = 0.014;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    c.beginPath();
    c.moveTo(0, 0.12);
    c.lineTo(Math.cos(a) * 0.4, 0.12 + Math.sin(a) * 0.4);
    c.stroke();
  }
  c.beginPath();
  c.arc(0, 0.12, 0.1, Math.PI, 0);
  c.fillStyle = degradeOr(c, 0.02, 0.12);
  c.fill();
  c.restore();
  plaqueTexte(c, "BONUS", 0.15, 0.2, "#3a0a3a");
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    c.fillStyle = "#fff3c4";
    c.beginPath();
    c.arc(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0.012, 0, Math.PI * 2);
    c.fill();
  }
}

const FACES_JACKPOT: Record<Jackpot, [string, string]> = {
  mini: ["#3fbf8a", "#0d4a33"],
  mineur: ["#4b8df0", "#102f6a"],
  majeur: ["#e0454f", "#5a0b14"],
  grand: ["#c04fb0", "#3a0a3a"],
};

/** Pièce sans inscription (la valeur est écrite par-dessus au rendu). */
function piece(c: Ctx, jackpot?: Jackpot) {
  c.save();
  c.shadowColor = jackpot ? FACES_JACKPOT[jackpot][0] : "#ffd36a";
  c.shadowBlur = 0.14 * E;
  c.beginPath();
  c.arc(0, 0, 0.42, 0, Math.PI * 2);
  c.fillStyle = degradeOr(c, -0.42, 0.42);
  c.fill();
  c.restore();
  // Tranche crantée
  c.strokeStyle = "rgba(90,60,10,0.5)";
  c.lineWidth = 0.012;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    c.beginPath();
    c.moveTo(Math.cos(a) * 0.37, Math.sin(a) * 0.37);
    c.lineTo(Math.cos(a) * 0.415, Math.sin(a) * 0.415);
    c.stroke();
  }
  c.beginPath();
  c.arc(0, 0, 0.35, 0, Math.PI * 2);
  if (jackpot) {
    const [clair, sombre] = FACES_JACKPOT[jackpot];
    const g = c.createRadialGradient(0, -0.12, 0.02, 0, 0, 0.36);
    g.addColorStop(0, clair);
    g.addColorStop(1, sombre);
    c.fillStyle = g;
  } else {
    const g = c.createRadialGradient(-0.1, -0.12, 0.02, 0, 0, 0.36);
    g.addColorStop(0, "#ffe79a");
    g.addColorStop(0.7, "#d39c34");
    g.addColorStop(1, "#9a6a18");
    c.fillStyle = g;
  }
  c.fill();
  c.lineWidth = 0.02;
  c.strokeStyle = "rgba(255,246,210,0.8)";
  c.stroke();
  // Couronne de laurier stylisée
  c.strokeStyle = jackpot ? "rgba(255,240,200,0.45)" : "rgba(120,80,15,0.45)";
  c.lineWidth = 0.012;
  c.beginPath();
  c.arc(0, 0, 0.29, Math.PI * 0.15, Math.PI * 0.85);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, 0.29, Math.PI * 1.15, Math.PI * 1.85);
  c.stroke();
  reflet(c, () => {
    c.beginPath();
    c.arc(0, 0, 0.42, 0, Math.PI * 2);
  }, 0.4);
}

const DESSINS: Record<Exclude<Symbole, "piece">, (c: Ctx) => void> = {
  pique: (c) => gemme(c, "pique", cheminPique),
  coeur: (c) => gemme(c, "coeur", cheminCoeur),
  carreau: (c) => gemme(c, "carreau", cheminCarreau),
  trefle: (c) => gemme(c, "trefle", cheminTrefle),
  perles,
  chapeau,
  cocktail,
  diamant,
  wild,
  bonus,
};

/** Clé de cache : le symbole, ou la pièce et son jackpot. */
export const cleImage = (k: Case) => (k.s === "piece" ? `piece:${k.j ?? ""}` : k.s);

function dessiner(cle: string, taille: number): HTMLCanvasElement {
  const toile = document.createElement("canvas");
  toile.width = toile.height = Math.ceil(taille);
  const c = toile.getContext("2d")!;
  E = taille;
  c.translate(taille / 2, taille / 2);
  c.scale(taille, taille);
  if (cle.startsWith("piece:")) piece(c, (cle.slice(6) || undefined) as Jackpot | undefined);
  else DESSINS[cle as Exclude<Symbole, "piece">](c);
  return toile;
}

/** Version floutée verticalement (rouleau lancé). */
function flouter(net: HTMLCanvasElement): HTMLCanvasElement {
  const t = document.createElement("canvas");
  t.width = net.width;
  t.height = net.height;
  const c = t.getContext("2d")!;
  const pas = 7;
  for (let i = 0; i < pas; i++) {
    c.globalAlpha = 0.22;
    c.drawImage(net, 0, ((i - pas / 2) * net.height) / 22);
  }
  return t;
}

export interface Cache {
  taille: number;
  net: Map<string, HTMLCanvasElement>;
  flou: Map<string, HTMLCanvasElement>;
}

const CLES = [...Object.keys(DESSINS), "piece:", "piece:mini", "piece:mineur", "piece:majeur", "piece:grand"];

export function creerCache(taille: number): Cache {
  const net = new Map<string, HTMLCanvasElement>();
  const flou = new Map<string, HTMLCanvasElement>();
  for (const k of CLES) {
    const n = dessiner(k, taille);
    net.set(k, n);
    flou.set(k, flouter(n));
  }
  return { taille, net, flou };
}

/** Petite image d'un symbole (table des gains). */
export function imageSymbole(k: Case, taille = 96): string {
  return dessiner(cleImage(k), taille).toDataURL();
}

export function formatCourt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("fr-FR")} k`;
  if (n >= 1_000) return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`;
  return n.toLocaleString("fr-FR");
}

/** Inscription d'une pièce : son montant en jetons, ou le nom du jackpot. */
export function texteSurPiece(c: Ctx, k: Case, mise: number, x: number, y: number, taille: number) {
  const libelle = k.j ? { mini: "MINI", mineur: "MINEUR", majeur: "MAJEUR", grand: "GRAND" }[k.j] : formatCourt((k.v ?? 0) * mise);
  const t = taille * (k.j ? (libelle.length > 4 ? 0.13 : 0.16) : libelle.length > 4 ? 0.15 : 0.19);
  c.save();
  c.font = `600 ${t}px ${POLICE}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineJoin = "round";
  c.lineWidth = t * 0.22;
  c.strokeStyle = k.j ? "rgba(20,5,5,0.85)" : "rgba(70,40,5,0.9)";
  c.strokeText(libelle, x, y + t * 0.05);
  c.fillStyle = k.j ? "#fff6d2" : "#fffbe8";
  c.fillText(libelle, x, y + t * 0.05);
  c.restore();
}
