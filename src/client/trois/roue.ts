import { ORDRE_ROUE, ROUGES } from "../../shared/roulette";
import type { Theme } from "../../shared/themes";
import { sons } from "../fx/sons";

// Roue de roulette animée. Le numéro est TOUJOURS tiré par le serveur : l'animation ne fait
// que conduire la bille jusqu'à la case annoncée.
// Rendu en 3D avec three.js (chargé à la demande), ou en 2D sur un canvas si la 3D est indisponible.

export interface Roue {
  /** Lance la bille vers le numéro donné ; la promesse se résout quand elle s'arrête. */
  lancer(numero: number, dureeMs: number): Promise<void>;
  /** Place directement la bille sur un numéro (ou la retire), sans animation. */
  poser(numero: number | null): void;
  surbrillance(numero: number | null): void;
  theme(t: Theme): void;
  detruire(): void;
}

const N = ORDRE_ROUE.length;
const PAS = (Math.PI * 2) / N;
const couleurCase = (n: number) => (n === 0 ? "#1F7A52" : ROUGES.has(n) ? "#B8433B" : "#141618");
const boisDe = (t: Theme) => (t.id === "onyx" ? "#161616" : "#5A3519");

interface Trace {
  a: number;
  r: number;
}
type Dessin = (theta: number, billeA: number | null, billeR: number, trace: Trace[] | null, hi: number | null) => void;

/** Moteur commun : rotation du plateau, trajectoire de la bille, boucle d'affichage. */
function moteur(dessiner: Dessin, liberer: () => void): Roue {
  let ang = 0;
  let billeIdx: number | null = null;
  let hi: number | null = null;
  let lancee = false;
  let fini = false;
  let raf = 0;

  const repos = () => {
    if (fini) return;
    if (!lancee) {
      ang += 0.003;
      dessiner(ang, billeIdx === null ? null : ang + billeIdx * PAS - Math.PI / 2, 120, null, hi);
    }
    raf = requestAnimationFrame(repos);
  };
  raf = requestAnimationFrame(repos);

  return {
    lancer(numero, dureeMs) {
      const idx = ORDRE_ROUE.indexOf(numero);
      hi = null;
      if (dureeMs < 900 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        billeIdx = idx;
        return Promise.resolve();
      }
      lancee = true;
      sons.bille();
      return new Promise((fin) => {
        const T = dureeMs;
        const t0 = performance.now();
        const th0 = ang;
        const A = Math.PI * 2 * 1.1; // tours du plateau pendant le lancer
        const K = Math.PI * 2 * (4.5 + Math.random() * 1.5); // tours de la bille, sur toute la durée
        const cible = idx * PAS - Math.PI / 2;
        const REBONDS = 5.5;
        const CHUTE = 0.66; // la bille quitte la piste aux deux tiers du lancer
        const trace: Trace[] = [];
        let rebond = -1;
        const image = (now: number) => {
          if (fini) return fin();
          const s = Math.min(1, (now - t0) / T);
          const e = 1 - Math.pow(1 - s, 3);
          const th = th0 + A * (2 * s - s * s);
          const phi = cible + (1 - e) * K;
          let r = 163 - 5 * Math.min(1, s / CHUTE);
          if (s > CHUTE) {
            const u = (s - CHUTE) / (1 - CHUTE);
            r = 120 + 38 * Math.pow(1 - u, 2.2) * Math.abs(Math.cos(u * Math.PI * REBONDS));
            const h = Math.floor(u * REBONDS + 0.5);
            if (h !== rebond) {
              rebond = h;
              if (s < 0.97) sons.tic();
            }
          }
          trace.push({ a: th + phi, r });
          if (trace.length > 12) trace.shift();
          dessiner(th, th + phi, r, s < CHUTE + 0.1 ? trace : null, null);
          if (s < 1) requestAnimationFrame(image);
          else {
            ang = th0 + A;
            billeIdx = idx;
            lancee = false;
            fin();
          }
        };
        requestAnimationFrame(image);
      });
    },
    poser(numero) {
      billeIdx = numero === null ? null : ORDRE_ROUE.indexOf(numero);
    },
    surbrillance(numero) {
      hi = numero === null ? null : ORDRE_ROUE.indexOf(numero);
    },
    theme() {
      /* remplacé par chaque rendu */
    },
    detruire() {
      fini = true;
      cancelAnimationFrame(raf);
      liberer();
    },
  };
}

// ───────────── Rendu 2D (secours) ─────────────

function roue2D(hote: HTMLElement, theme: Theme): Roue {
  const toile = document.createElement("canvas");
  toile.className = "roue-toile";
  toile.setAttribute("role", "img");
  toile.setAttribute("aria-label", "Roue de la roulette");
  hote.append(toile);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  toile.width = 380 * dpr;
  toile.height = 380 * dpr;
  const c = toile.getContext("2d")!;
  let t = theme;
  const TAU = Math.PI * 2;
  const dessiner: Dessin = (theta, billeA, billeR, trace, hi) => {
    const cx = 190;
    const cy = 190;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, 380, 380);
    let g = c.createLinearGradient(0, 0, 380, 380);
    g.addColorStop(0, "#7a4a22");
    g.addColorStop(0.5, boisDe(t));
    g.addColorStop(1, "#6b3f1c");
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 186, 0, TAU);
    c.fill();
    c.strokeStyle = t.accent;
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#16191c";
    c.beginPath();
    c.arc(cx, cy, 177, 0, TAU);
    c.fill();
    for (let i = 0; i < N; i++) {
      const n = ORDRE_ROUE[i];
      const a = theta + i * PAS - Math.PI / 2;
      c.beginPath();
      c.arc(cx, cy, 148, a - PAS / 2, a + PAS / 2);
      c.arc(cx, cy, 104, a + PAS / 2, a - PAS / 2, true);
      c.closePath();
      c.fillStyle = couleurCase(n);
      c.fill();
      c.strokeStyle = t.accent;
      c.globalAlpha = 0.55;
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = 1;
      c.save();
      c.translate(cx, cy);
      c.rotate(a + Math.PI / 2);
      c.fillStyle = "#fff";
      c.font = "700 11px Manrope, Arial, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(n), 0, -137);
      c.restore();
    }
    if (hi !== null) {
      const a = theta + hi * PAS - Math.PI / 2;
      c.beginPath();
      c.arc(cx, cy, 150, a - PAS / 2, a + PAS / 2);
      c.arc(cx, cy, 104, a + PAS / 2, a - PAS / 2, true);
      c.closePath();
      c.fillStyle = `rgba(255,230,150,${0.42 + 0.28 * Math.sin(performance.now() / 220)})`;
      c.fill();
    }
    g = c.createRadialGradient(cx, cy, 10, cx, cy, 104);
    g.addColorStop(0, t.feutreCentre);
    g.addColorStop(1, t.feutreBord);
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 103, 0, TAU);
    c.fill();
    c.save();
    c.translate(cx, cy);
    c.rotate(theta);
    c.strokeStyle = t.accent;
    c.lineWidth = 5;
    c.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      c.rotate(Math.PI / 2);
      c.beginPath();
      c.moveTo(0, 16);
      c.lineTo(0, 80);
      c.stroke();
      c.fillStyle = t.accent;
      c.beginPath();
      c.arc(0, 84, 6, 0, TAU);
      c.fill();
    }
    c.restore();
    c.fillStyle = t.accent;
    c.beginPath();
    c.arc(cx, cy, 24, 0, TAU);
    c.fill();
    trace?.forEach((p, i) => {
      c.fillStyle = `rgba(255,255,255,${0.04 + i * 0.028})`;
      c.beginPath();
      c.arc(cx + p.r * Math.cos(p.a), cy + p.r * Math.sin(p.a), 1.6 + i * 0.34, 0, TAU);
      c.fill();
    });
    if (billeA !== null) {
      const x = cx + billeR * Math.cos(billeA);
      const y = cy + billeR * Math.sin(billeA);
      c.save();
      c.shadowColor = "rgba(0,0,0,.8)";
      c.shadowBlur = 6;
      c.shadowOffsetY = 2;
      const gb = c.createRadialGradient(x - 2, y - 2, 1, x, y, 6);
      gb.addColorStop(0, "#fff");
      gb.addColorStop(1, "#bfc6d6");
      c.fillStyle = gb;
      c.beginPath();
      c.arc(x, y, 5.5, 0, TAU);
      c.fill();
      c.restore();
    }
  };
  const r = moteur(dessiner, () => toile.remove());
  r.theme = (nt) => {
    t = nt;
  };
  return r;
}

// ───────────── Rendu 3D (three.js) ─────────────

async function roue3D(hote: HTMLElement, theme: Theme): Promise<Roue> {
  const T = await import("three");
  const mobile = window.matchMedia("(pointer: coarse)").matches || innerWidth < 700;
  const W = 420;
  const H = 372;
  const toile = document.createElement("canvas");
  toile.className = "roue-toile";
  toile.setAttribute("role", "img");
  toile.setAttribute("aria-label", "Roue de la roulette");
  const rendu = new T.WebGLRenderer({ canvas: toile, antialias: true, alpha: true });
  rendu.setPixelRatio(Math.min(mobile ? 1.5 : 2, window.devicePixelRatio || 1));
  rendu.setSize(W, H, false);
  rendu.shadowMap.enabled = true;
  rendu.shadowMap.type = T.PCFSoftShadowMap;
  hote.append(toile);

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(36, W / H, 0.1, 30);
  scene.add(new T.HemisphereLight(0xfff4e0, 0x20242f, 1.9));
  const spot = new T.SpotLight(0xfff0d8, 3.6, 0, 0.55, 0.6, 0);
  spot.position.set(1.6, 6.5, 2.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  spot.shadow.bias = -0.0006;
  scene.add(spot);

  const mat = (color: string | number, roughness: number, metalness = 0) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, side: T.DoubleSide });
  const metal = mat(theme.accent, 0.3, 0.65);
  const bois = mat(boisDe(theme), 0.38);
  const tour = (pts: [number, number][], m: InstanceType<typeof T.Material>, seg = 96) => {
    const g = new T.Mesh(new T.LatheGeometry(pts.map(([x, y]) => new T.Vector2(x, y)), seg), m);
    g.receiveShadow = true;
    g.castShadow = true;
    return g;
  };
  // Cuvette fixe : la pente où roule la bille, puis le rebord en bois.
  scene.add(tour([[1.48, 0.055], [1.66, 0.185], [1.7, 0.3]], mat("#1C2024", 0.28, 0.2)));
  scene.add(tour([[1.7, 0.3], [1.78, 0.345], [1.92, 0.31], [1.99, 0.17], [1.99, -0.25]], bois));
  scene.add(tour([[1.73, 0.325], [1.76, 0.345], [1.79, 0.345]], metal));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.2;
    const d = new T.Mesh(new T.OctahedronGeometry(0.04), metal);
    d.position.set(1.57 * Math.cos(a), 0.15, 1.57 * Math.sin(a));
    d.scale.set(1, 0.7, 2);
    d.rotation.y = -a;
    d.castShadow = true;
    scene.add(d);
  }

  // Partie tournante : cases numérotées, séparateurs, cône et croisillon.
  const rotor = new T.Group();
  scene.add(rotor);
  const tc = document.createElement("canvas");
  tc.width = tc.height = 1024;
  const x = tc.getContext("2d")!;
  const u = 512 / 1.48;
  x.translate(512, 512);
  for (let i = 0; i < N; i++) {
    const n = ORDRE_ROUE[i];
    const a = i * PAS - Math.PI / 2;
    x.beginPath();
    x.arc(0, 0, 1.48 * u, a - PAS / 2, a + PAS / 2);
    x.arc(0, 0, 0.92 * u, a + PAS / 2, a - PAS / 2, true);
    x.closePath();
    x.fillStyle = couleurCase(n);
    x.fill();
    x.save();
    x.rotate(a + Math.PI / 2);
    x.fillStyle = "#F2EDE4";
    x.font = "800 46px Manrope, Arial, sans-serif";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(String(n), 0, -1.33 * u);
    x.restore();
  }
  const texture = new T.CanvasTexture(tc);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = rendu.capabilities.getMaxAnisotropy();
  const anneau = new T.Mesh(new T.RingGeometry(0.92, 1.48, 148, 1), new T.MeshStandardMaterial({ map: texture, roughness: 0.32, metalness: 0.05 }));
  anneau.rotation.x = -Math.PI / 2;
  anneau.receiveShadow = true;
  rotor.add(anneau);
  for (let i = 0; i < N; i++) {
    const a = (i + 0.5) * PAS - Math.PI / 2;
    const f = new T.Mesh(new T.BoxGeometry(0.56, 0.075, 0.014), metal);
    f.position.set(1.2 * Math.cos(a), 0.037, 1.2 * Math.sin(a));
    f.rotation.y = -a;
    f.castShadow = true;
    rotor.add(f);
  }
  const cone = mat(theme.feutre, 0.34, 0.3);
  rotor.add(tour([[1.48, 0], [1.48, 0.06]], metal), tour([[0.92, 0], [0.92, 0.075], [0.8, 0.1], [0.4, 0.2], [0.24, 0.24]], cone));
  rotor.add(tour([[0.26, 0.235], [0.13, 0.3], [0.06, 0.5], [0.05, 0.58], [0.095, 0.64], [0.04, 0.74], [0, 0.78]], metal, 48));
  for (let k = 0; k < 4; k++) {
    const g = new T.Group();
    const bras = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.62, 12), metal);
    bras.rotation.z = Math.PI / 2;
    bras.position.set(0.34, 0.42, 0);
    bras.castShadow = true;
    const boule = new T.Mesh(new T.SphereGeometry(0.05, 16, 12), metal);
    boule.position.set(0.65, 0.42, 0);
    boule.castShadow = true;
    g.add(bras, boule);
    g.rotation.y = (k * Math.PI) / 2;
    rotor.add(g);
  }

  const matHi = new T.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false });
  let meshHi: InstanceType<typeof T.Mesh> | null = null;
  let idxHi: number | null = null;
  const bille = new T.Mesh(new T.SphereGeometry(0.058, 24, 18), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0.1 }));
  bille.castShadow = true;
  scene.add(bille);
  const traceM = Array.from({ length: 12 }, (_, i) => {
    const m = new T.Mesh(new T.SphereGeometry(0.012 + i * 0.0028, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04 + i * 0.026, depthWrite: false }));
    m.visible = false;
    scene.add(m);
    return m;
  });
  // Hauteur de la bille : sur la pente, puis petits sauts au-dessus des cases.
  const hauteur = (r: number) => (r > 1.48 ? 0.055 + (r - 1.48) * 0.72 + 0.058 : 0.058 + (r - 1.2) * 0.26);
  let zoom = 0;
  let enLancer = false;

  const dessiner: Dessin = (theta, billeA, billeR, trace, hi) => {
    rotor.rotation.y = -theta;
    if (hi !== idxHi) {
      idxHi = hi;
      if (meshHi) {
        rotor.remove(meshHi);
        meshHi.geometry.dispose();
        meshHi = null;
      }
      if (hi !== null) {
        const a = hi * PAS - Math.PI / 2;
        meshHi = new T.Mesh(new T.RingGeometry(0.92, 1.48, 8, 1, -a - PAS / 2, PAS), matHi);
        meshHi.rotation.x = -Math.PI / 2;
        meshHi.position.y = 0.006;
        rotor.add(meshHi);
      }
    }
    matHi.opacity = 0.32 + 0.24 * Math.sin(performance.now() / 260);
    bille.visible = billeA !== null;
    if (billeA !== null) {
      const r = billeR / 100;
      bille.position.set(r * Math.cos(billeA), hauteur(r), r * Math.sin(billeA));
    }
    enLancer = !!trace || (billeA !== null && billeR > 121);
    traceM.forEach((m, i) => {
      const p = trace?.[i];
      m.visible = !!p;
      if (p) {
        const r = p.r / 100;
        m.position.set(r * Math.cos(p.a), hauteur(r), r * Math.sin(p.a));
      }
    });
    // Pendant le lancer, la caméra se rapproche et s'abaisse légèrement.
    zoom += ((enLancer ? 1 : 0) - zoom) * 0.025;
    cam.position.set(0, 5.7 - 1.05 * zoom, 3.75 - 0.25 * zoom);
    cam.lookAt(0, 0, 0);
    rendu.render(scene, cam);
  };

  const r = moteur(dessiner, () => {
    rendu.dispose();
    texture.dispose();
    toile.remove();
  });
  r.theme = (t) => {
    metal.color.set(t.accent);
    bois.color.set(boisDe(t));
    cone.color.set(t.feutre);
  };
  return r;
}

function webglDisponible(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export async function creerRoue(hote: HTMLElement, theme: Theme): Promise<Roue> {
  if (webglDisponible()) {
    try {
      return await roue3D(hote, theme);
    } catch (e) {
      console.warn("Roue 3D indisponible, passage en 2D", e);
    }
  }
  return roue2D(hote, theme);
}
