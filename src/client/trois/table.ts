import type * as TT from "three";
import { RANG_AFFICHE, SYMBOLES, type Couleur, type Rang } from "../../shared/cartes";
import type { Theme } from "../../shared/themes";
import { sons } from "../fx/sons";

// Table de blackjack en 3D posée sous la mise en page HTML.
// Repères dans le HTML (rendus invisibles en mode 3D) :
//   .ancre-carte  data-r / data-c (absents = carte cachée), data-ordre (ordre de distribution)
//   .ancre-sabot  .ancre-defausse
//   [data-pile]   data-montant : pile de jetons
// Sans WebGL, la classe « table-3d » n'est pas posée et les cartes HTML restent visibles.

export interface Table3D {
  sync(): void;
  theme(t: Theme): void;
  detruire(): void;
}

type Three = typeof TT;
const PAUSE_DONNE = 520; // écart entre deux cartes distribuées d'un coup (ms)
const DUREE_VOL = 650; // trajet du sabot à la place

interface Tween {
  de: TT.Vector3;
  vers: TT.Vector3;
  t0: number;
  duree: number;
  arc: number;
  vrille: number;
  disparait?: boolean;
}
interface CarteMesh {
  ancre: Element;
  ext: TT.Group;
  flip: TT.Group;
  face: TT.MeshStandardMaterial;
  cle: string | null;
  phi: number;
  phiCible: number;
  tw: Tween;
  lacet: number;
  sonJoue: boolean;
  base?: number;
}
interface Pile {
  g: TT.Group;
  montant: number;
  t0: number;
}

function rectArrondi(T: Three, w: number, d: number, r: number): TT.Shape {
  const s = new T.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Demi-lune : bord droit côté croupier (loin), arrondi côté joueurs (près). */
function demiLune(T: Three, demiLargeur: number, profondeur: number, plat: number): TT.Shape {
  const s = new T.Shape();
  s.moveTo(-demiLargeur, plat);
  s.lineTo(demiLargeur, plat);
  s.absellipse(0, plat, demiLargeur, profondeur, 0, Math.PI, true, 0);
  return s;
}

function uvNormalises(g: TT.BufferGeometry): TT.BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
  return g;
}

function webgl(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const VALEURS_JETONS = [5000, 1000, 500, 100, 50, 10];

export async function creerTable3D(hote: HTMLElement, themeDepart: Theme, libelles: [string, string]): Promise<Table3D | null> {
  if (!webgl() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  let T: Three;
  try {
    T = await import("three");
  } catch {
    return null;
  }
  await document.fonts?.ready;
  let theme = themeDepart;
  const mobile = window.matchMedia("(pointer: coarse)").matches || innerWidth < 700;

  const toile = document.createElement("canvas");
  toile.className = "table-toile";
  toile.setAttribute("aria-hidden", "true");
  let rendu: TT.WebGLRenderer;
  try {
    rendu = new T.WebGLRenderer({ canvas: toile, antialias: true, alpha: true });
  } catch {
    return null;
  }
  hote.prepend(toile);
  hote.classList.add("table-3d");
  rendu.setPixelRatio(Math.min(mobile ? 1.25 : 1.75, window.devicePixelRatio || 1));
  rendu.shadowMap.enabled = true;
  rendu.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(26, 1, 0.1, 60);
  const D = 12;
  const INCLINAISON = (32 * Math.PI) / 180;
  cam.position.set(0, D * Math.cos(INCLINAISON), D * Math.sin(INCLINAISON));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  scene.add(new T.HemisphereLight(0xfff6e6, 0x1a2030, 1.55));
  const spot = new T.SpotLight(0xfff2dc, 2.5, 0, 0.75, 0.7, 0);
  spot.position.set(1, 11, 3);
  spot.castShadow = true;
  spot.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  spot.shadow.bias = -0.0004;
  scene.add(spot);

  const texture = (w: number, h: number, dessin: (x: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    dessin(c.getContext("2d")!, w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  // ───── Cartes ─────
  const geoCarte = uvNormalises(new T.ShapeGeometry(rectArrondi(T, 1, 1.42, 0.09), 6));
  const faces = new Map<string, TT.CanvasTexture>();
  const faceTex = (r: Rang, c: Couleur) => {
    const cle = r + c;
    let t = faces.get(cle);
    if (t) return t;
    t = texture(256, 364, (x, w, h) => {
      const rouge = c === "H" || c === "D";
      const col = rouge ? "#B8433B" : "#15181A";
      const rang = RANG_AFFICHE[r];
      const sym = SYMBOLES[c] + "︎";
      x.fillStyle = "#F7F3EA";
      x.fillRect(0, 0, w, h);
      x.fillStyle = col;
      x.textAlign = "center";
      x.textBaseline = "middle";
      const coin = () => {
        x.font = "700 66px Fraunces, Georgia, serif";
        x.fillText(rang, 44, 52);
        x.font = "48px Georgia, serif";
        x.fillText(sym, 44, 106);
      };
      coin();
      x.save();
      x.translate(w, h);
      x.rotate(Math.PI);
      coin();
      x.restore();
      if (r === "J" || r === "Q" || r === "K") {
        x.strokeStyle = theme.accent;
        x.lineWidth = 5;
        x.strokeRect(72, 64, 112, 236);
        x.font = "italic 600 96px Fraunces, Georgia, serif";
        x.fillText(rang, 128, 160);
        x.font = "60px Georgia, serif";
        x.fillText(sym, 128, 240);
      } else {
        x.font = `${r === "A" ? 150 : 112}px Georgia, serif`;
        x.fillText(sym, 128, 190);
      }
    });
    faces.set(cle, t);
    return t;
  };
  const dosTex = () =>
    texture(256, 364, (x, w, h) => {
      x.fillStyle = "#F2EDE4";
      x.fillRect(0, 0, w, h);
      x.fillStyle = theme.dos;
      x.fillRect(14, 14, w - 28, h - 28);
      x.strokeStyle = theme.accent;
      x.lineWidth = 4;
      x.strokeRect(28, 28, w - 56, h - 56);
      x.globalAlpha = 0.18;
      x.lineWidth = 2;
      for (let i = -h; i < w; i += 18) {
        x.beginPath();
        x.moveTo(i, 28);
        x.lineTo(i + h, h);
        x.stroke();
      }
      x.globalAlpha = 1;
      x.fillStyle = theme.accent;
      x.font = "italic 600 110px Fraunces, Georgia, serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText("e", w / 2, h / 2 - 8);
    });
  const matDos = new T.MeshStandardMaterial({ map: dosTex(), roughness: 0.5 });

  // ───── Jetons ─────
  const geoJeton = new T.CylinderGeometry(1, 1, 0.32, 28);
  const matsJeton = new Map<number, TT.Material[]>();
  const couleurJeton = (v: number) =>
    v >= 5000 ? ["#0B0D0E", theme.accent] : v >= 1000 ? [theme.feutre, "#F2EDE4"] : v >= 500 ? [theme.accent, "#0B0D0E"] : v >= 100 ? ["#F2EDE4", "#0B0D0E"] : v >= 50 ? ["#C56B4C", "#F2EDE4"] : ["#8C96A0", "#F2EDE4"];
  const matJeton = (v: number) => {
    let m = matsJeton.get(v);
    if (m) return m;
    const [fond, trait] = couleurJeton(v);
    const cote = texture(128, 16, (x, w, h) => {
      x.fillStyle = fond;
      x.fillRect(0, 0, w, h);
      x.fillStyle = trait;
      for (let i = 0; i < 8; i++) x.fillRect(i * 16, 0, 7, h);
    });
    const dessus = texture(128, 128, (x, w) => {
      x.fillStyle = fond;
      x.fillRect(0, 0, w, w);
      x.strokeStyle = trait;
      x.lineWidth = 12;
      x.setLineDash([18, 14]);
      x.beginPath();
      x.arc(64, 64, 56, 0, 7);
      x.stroke();
      x.setLineDash([]);
      x.lineWidth = 3;
      x.beginPath();
      x.arc(64, 64, 34, 0, 7);
      x.stroke();
    });
    m = [new T.MeshStandardMaterial({ map: cote, roughness: 0.45 }), new T.MeshStandardMaterial({ map: dessus, roughness: 0.4 }), new T.MeshStandardMaterial({ color: fond })];
    matsJeton.set(v, m);
    return m;
  };

  // ───── Projection écran → plan de la table ─────
  let W = 0;
  let H = 0;
  let mpp = 0.01; // unités du monde par pixel (au centre)
  const versTable = (cx: number, cy: number, y0 = 0) => {
    const b = toile.getBoundingClientRect();
    const v = new T.Vector3(((cx - b.left) / b.width) * 2 - 1, -((cy - b.top) / b.height) * 2 + 1, 0.5).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    const t = (y0 - cam.position.y) / dir.y;
    return cam.position.clone().add(dir.multiplyScalar(t));
  };
  const centreDe = (e: Element | null) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return b.width ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
  };

  // ───── La table ─────
  let groupeTable: TT.Group | null = null;
  const construire = () => {
    if (groupeTable) {
      scene.remove(groupeTable);
      groupeTable.traverse((o) => {
        const m = o as TT.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    }
    groupeTable = new T.Group();
    scene.add(groupeTable);
    const b = toile.getBoundingClientRect();
    const loin = versTable(b.left + b.width / 2, b.top + b.height * 0.02);
    const pres = versTable(b.left + b.width / 2, b.bottom - b.height * 0.03);
    const cote = versTable(b.left + b.width * 0.015, b.top + b.height * 0.02);
    const demiL = Math.abs(cote.x);
    const prof = pres.z - loin.z;
    const plat = -loin.z; // y de la forme = -z du monde
    const rebord = Math.min(demiL, prof) * 0.05;

    const bois = new T.Mesh(
      new T.ExtrudeGeometry(demiLune(T, demiL, prof, plat), { depth: 0.35, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 48 }),
      new T.MeshStandardMaterial({ color: theme.bois, roughness: 0.34 }),
    );
    bois.rotation.x = -Math.PI / 2;
    // Le dessus du bois (0,35 + biseau 0,06) reste sous le feutre : pas de chevauchement.
    bois.position.y = -0.47;
    bois.receiveShadow = true;
    groupeTable.add(bois);

    const fl = demiL - rebord;
    const fp = prof - rebord * 1.6;
    const fplat = plat - rebord * 0.6;
    const cw = 1024;
    const ch = Math.round((1024 * fp) / (2 * fl));
    // Position des textes du feutre : calée sur l'écran (entre le croupier et les joueurs).
    const fraction = (yEcran: number) => {
      const z = versTable(b.left + b.width / 2, b.top + b.height * yEcran).z;
      return Math.min(0.95, Math.max(0.05, (z - (-fplat)) / fp));
    };
    const yTexte1 = fraction(0.35) * ch;
    const yTexte2 = fraction(0.39) * ch;
    const texFeutre = texture(cw, ch, (x) => {
      const g = x.createRadialGradient(cw / 2, ch * 0.35, 20, cw / 2, ch * 0.4, cw * 0.62);
      g.addColorStop(0, theme.feutreCentre);
      g.addColorStop(0.62, theme.feutre);
      g.addColorStop(1, theme.feutreBord);
      x.fillStyle = g;
      x.fillRect(0, 0, cw, ch);
      x.globalAlpha = 0.05;
      x.fillStyle = "#000";
      for (let i = 0; i < 9000; i++) x.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
      x.globalAlpha = 0.42;
      x.strokeStyle = theme.accent;
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(cw / 2, 0, (cw / 2) * 0.8, ch * 0.74, 0, 0, Math.PI);
      x.stroke();
      x.globalAlpha = 0.55;
      x.fillStyle = theme.accent;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.font = `italic 600 ${Math.round(cw * 0.034)}px Fraunces, Georgia, serif`;
      x.fillText(libelles[0], cw / 2, yTexte1);
      x.globalAlpha = 0.4;
      x.font = `700 ${Math.round(cw * 0.016)}px Manrope, Arial, sans-serif`;
      x.fillText(libelles[1].toUpperCase().split("").join(" "), cw / 2, yTexte2);
      x.globalAlpha = 1;
    });
    const feutre = new T.Mesh(uvNormalises(new T.ShapeGeometry(demiLune(T, fl, fp, fplat), 48)), new T.MeshStandardMaterial({ map: texFeutre, roughness: 0.95 }));
    feutre.rotation.x = -Math.PI / 2;
    feutre.position.y = 0.04;
    feutre.receiveShadow = true;
    groupeTable.add(feutre);
    const filet = new T.Mesh(
      new T.ShapeGeometry(demiLune(T, fl + rebord * 0.25, fp + rebord * 0.35, fplat + rebord * 0.12), 48),
      new T.MeshStandardMaterial({ color: theme.accent, roughness: 0.3, metalness: 0.7 }),
    );
    filet.rotation.x = -Math.PI / 2;
    filet.position.y = 0.03;
    groupeTable.add(filet);

    const ancreSabot = hote.querySelector(".ancre-sabot") as HTMLElement | null;
    const cs = centreDe(ancreSabot);
    if (ancreSabot && cs) {
      const p = versTable(cs.x, cs.y);
      const t = ancreSabot.offsetWidth * mpp;
      const faces6 = [0, 1, 2, 3, 4, 5].map((i) =>
        i === 2
          ? matDos
          : i === 4
            ? new T.MeshStandardMaterial({ color: "#0B0D0E", roughness: 0.4 })
            : new T.MeshStandardMaterial({ color: "#1C1F22", roughness: 0.35, metalness: 0.3 }),
      );
      const sabot = new T.Mesh(new T.BoxGeometry(t * 1.1, t * 0.75, t * 1.65), faces6);
      sabot.position.set(p.x, t * 0.4 + 0.04, p.z);
      sabot.rotation.y = -0.25;
      sabot.castShadow = true;
      groupeTable.add(sabot);
    }
  };

  // ───── Synchronisation avec le HTML ─────
  const cartes = new Map<Element, CarteMesh>();
  const partantes = new Set<CarteMesh>();
  const piles = new Map<Element, Pile>();
  let sale = true;

  const nouvelleCarte = (ancre: HTMLElement, cible: TT.Vector3, echelle: number, delai: number, now: number): CarteMesh => {
    const ext = new T.Group();
    const flip = new T.Group();
    const inner = new T.Group();
    const face = new T.MeshStandardMaterial({ roughness: 0.6, color: 0xe8e4dc });
    const recto = new T.Mesh(geoCarte, face);
    const verso = new T.Mesh(geoCarte, matDos);
    verso.rotation.y = Math.PI;
    recto.position.z = 0.001;
    recto.castShadow = true;
    inner.add(recto, verso);
    inner.rotation.x = -Math.PI / 2;
    flip.add(inner);
    ext.add(flip);
    scene.add(ext);
    const cs = centreDe(hote.querySelector(".ancre-sabot"));
    const de = cs ? versTable(cs.x, cs.y, 0.3) : cible.clone();
    ext.position.copy(de);
    ext.scale.setScalar(echelle);
    ext.visible = delai <= 0;
    flip.rotation.z = Math.PI;
    return {
      ancre, ext, flip, face, cle: null, phi: Math.PI, phiCible: Math.PI, lacet: (Math.random() - 0.5) * 0.06, sonJoue: false,
      tw: { de, vers: cible, t0: now + delai, duree: cs ? DUREE_VOL : 1, arc: cs ? 0.75 : 0, vrille: cs ? 1.4 : 0 },
    };
  };

  const sync = () => {
    if (!W) return;
    const now = performance.now();
    const ancres = [...hote.querySelectorAll<HTMLElement>(".ancre-carte")].filter((a) => a.offsetParent);
    const nouvelles = ancres.filter((a) => !cartes.has(a)).sort((a, b) => Number(a.dataset.ordre ?? 0) - Number(b.dataset.ordre ?? 0));
    const delais = new Map(nouvelles.map((a, i) => [a, nouvelles.length > 1 ? i * PAUSE_DONNE : 0]));

    for (const a of ancres) {
      const c = centreDe(a)!;
      const p = versTable(c.x, c.y);
      const idx = a.parentElement ? [...a.parentElement.children].indexOf(a) : 0;
      const leve = a.classList.contains("surbrillance");
      const cible = new T.Vector3(p.x, 0.055 + idx * 0.012 + (leve ? 0.18 : 0), p.z);
      const echelle = a.offsetWidth * mpp;
      let m = cartes.get(a);
      if (!m) {
        m = nouvelleCarte(a, cible, echelle, delais.get(a) ?? 0, now);
        cartes.set(a, m);
      } else if (m.tw.vers.distanceTo(cible) > 0.002) {
        m.tw = { de: m.ext.position.clone(), vers: cible, t0: Math.max(now, m.tw.t0 + m.tw.duree), duree: 240, arc: leve ? 0.12 : 0.05, vrille: 0 };
      }
      m.ext.scale.setScalar(echelle);
      const r = a.dataset.r as Rang | undefined;
      const cc = a.dataset.c as Couleur | undefined;
      const cle = r && cc ? r + cc : null;
      if (cle && cle !== m.cle) {
        m.face.map = faceTex(r!, cc!);
        m.face.needsUpdate = true;
        if (m.cle === null && m.phi > 1 && m.tw.t0 + m.tw.duree < now) sons.retourne();
        m.cle = cle;
      }
      m.phiCible = cle ? 0 : Math.PI;
      m.face.emissive.setScalar(leve ? 0.18 : 0);
      sale = true;
    }
    // Cartes ramassées : elles glissent vers la défausse.
    const cd = centreDe(hote.querySelector(".ancre-defausse"));
    const defausse = cd ? versTable(cd.x, cd.y, 0.25) : new T.Vector3(-3, 0.3, -2);
    let k = 0;
    for (const [a, m] of cartes) {
      if (a.isConnected && (a as HTMLElement).offsetParent) continue;
      cartes.delete(a);
      m.tw = { de: m.ext.position.clone(), vers: defausse, t0: now + k++ * 60, duree: 480, arc: 0.35, vrille: -0.8, disparait: true };
      partantes.add(m);
    }
    if (k) sons.carte();

    // Piles de jetons
    const vues = new Set<Element>();
    hote.querySelectorAll<HTMLElement>("[data-pile]").forEach((e) => {
      const montant = Number(e.dataset.montant ?? 0);
      const c = centreDe(e);
      if (!c || !(montant > 0)) return;
      vues.add(e);
      let pile = piles.get(e);
      if (!pile) {
        pile = { g: new T.Group(), montant: -1, t0: now };
        scene.add(pile.g);
        piles.set(e, pile);
      }
      const p = versTable(c.x, c.y);
      const r = 15 * mpp;
      pile.g.position.set(p.x, 0.04, p.z);
      if (pile.montant !== montant) {
        pile.montant = montant;
        pile.t0 = now;
        pile.g.clear();
        let reste = montant;
        let n = 0;
        for (const v of VALEURS_JETONS) {
          while (reste >= v && n < 16) {
            const j = new T.Mesh(geoJeton, matJeton(v));
            j.scale.set(r, r, r);
            j.position.y = r * 0.16 + n * r * 0.33;
            j.rotation.y = n * 0.7;
            j.castShadow = true;
            j.receiveShadow = true;
            pile.g.add(j);
            reste -= v;
            n++;
          }
        }
      }
      sale = true;
    });
    for (const [e, pile] of piles) {
      if (vues.has(e)) continue;
      scene.remove(pile.g);
      piles.delete(e);
      sale = true;
    }
  };

  // ───── Animation ─────
  let dernier = performance.now();
  let fini = false;
  const tick = (now: number) => {
    if (fini) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - dernier) / 1000);
    dernier = now;
    let occupe = false;
    const animer = (m: CarteMesh) => {
      const tw = m.tw;
      if (now < tw.t0) {
        occupe = true;
        return;
      }
      if (!m.ext.visible) m.ext.visible = true;
      if (!m.sonJoue && tw.arc > 0.5) {
        m.sonJoue = true;
        sons.carte();
      }
      const s = Math.max(0, Math.min(1, (now - tw.t0) / tw.duree));
      const e = 1 - Math.pow(1 - s, 3);
      if (s < 1) occupe = true;
      m.ext.position.lerpVectors(tw.de, tw.vers, e);
      m.ext.position.y += tw.arc * Math.sin(Math.PI * s);
      m.ext.rotation.y = m.lacet + tw.vrille * (1 - e);
      // La carte se retourne une fois posée (ou presque).
      const cible = s > 0.8 ? m.phiCible : Math.PI;
      if (Math.abs(cible - m.phi) > 0.004) {
        m.phi += (cible - m.phi) * Math.min(1, dt / 0.13);
        occupe = true;
      } else m.phi = cible;
      m.flip.rotation.z = m.phi;
      m.ext.position.y += Math.abs(Math.sin(m.phi)) * m.ext.scale.x * 0.5;
      if (tw.disparait) {
        m.base ??= m.ext.scale.x;
        m.ext.scale.setScalar(m.base * (1 - e * 0.45));
        if (s >= 1) {
          scene.remove(m.ext);
          m.face.dispose();
          partantes.delete(m);
        }
      }
    };
    cartes.forEach(animer);
    partantes.forEach(animer);
    piles.forEach((p) => {
      const s = Math.min(1, (now - p.t0) / 280);
      p.g.position.y = 0.04 + 0.5 * (1 - s) * (1 - s);
      if (s < 1) occupe = true;
    });
    if (occupe || sale) {
      rendu.render(scene, cam);
      sale = false;
    }
  };
  requestAnimationFrame(tick);

  const ajuster = () => {
    const b = toile.getBoundingClientRect();
    if (!b.width || !b.height) return;
    if (b.width === W && b.height === H && groupeTable) return;
    W = b.width;
    H = b.height;
    rendu.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    mpp = (2 * D * Math.tan((cam.fov * Math.PI) / 360)) / H;
    construire();
    sync();
    sale = true;
  };
  const obs = new ResizeObserver(ajuster);
  obs.observe(hote);
  ajuster();

  const perte = (ev: Event) => {
    ev.preventDefault();
    hote.classList.remove("table-3d");
  };
  toile.addEventListener("webglcontextlost", perte);

  return {
    sync,
    theme(t) {
      if (t.id === theme.id) return;
      theme = t;
      faces.forEach((f) => f.dispose());
      faces.clear();
      matsJeton.clear();
      matDos.map?.dispose();
      matDos.map = dosTex();
      matDos.needsUpdate = true;
      cartes.forEach((m) => (m.cle = null));
      piles.forEach((p) => (p.montant = -1));
      construire();
      sync();
    },
    detruire() {
      fini = true;
      obs.disconnect();
      rendu.dispose();
      toile.remove();
      hote.classList.remove("table-3d");
    },
  };
}
