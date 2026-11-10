import { useSyncExternalStore } from "react";

// Sons synthétisés avec la Web Audio API : aucun fichier à charger.
// Le choix « son coupé / activé » est mémorisé dans le navigateur.

const CLE = "esta-son";
let actif = lireActif();
const abonnes = new Set<() => void>();
let ctx: AudioContext | null = null;
let bruit: AudioBuffer | null = null;

function lireActif(): boolean {
  try {
    return localStorage.getItem(CLE) !== "0";
  } catch {
    return true;
  }
}

export function sonActif(): boolean {
  return actif;
}

export function basculerSon(): void {
  actif = !actif;
  try {
    localStorage.setItem(CLE, actif ? "1" : "0");
  } catch {
    /* stockage indisponible : le choix vaut pour cette visite */
  }
  abonnes.forEach((f) => f());
  if (actif) sons.jeton();
}

export function useSonActif(): boolean {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => actif,
  );
}

function audio(): AudioContext | null {
  if (!actif) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function note(freq: number, duree = 0.08, type: OscillatorType = "sine", volume = 0.05, decalage = 0): void {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  const t = a.currentTime + decalage;
  o.type = type;
  o.frequency.value = freq;
  o.connect(g).connect(a.destination);
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.start(t);
  o.stop(t + duree);
}

function souffle(duree: number, volume: number, freq: number, decalage = 0, q = 1): void {
  const a = audio();
  if (!a) return;
  if (!bruit) {
    bruit = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const d = bruit.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  const t = a.currentTime + decalage;
  s.buffer = bruit;
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  s.connect(f).connect(g).connect(a.destination);
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  s.start(t, Math.random() * 0.3, duree);
}

/** Note dont la hauteur glisse de f0 à f1 (montées d'anticipation, fanfares). */
function glisse(f0: number, f1: number, duree: number, type: OscillatorType = "sawtooth", volume = 0.03, decalage = 0): void {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  const t = a.currentTime + decalage;
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + duree);
  f.type = "lowpass";
  f.frequency.value = 2400;
  o.connect(f).connect(g).connect(a.destination);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.08, duree / 3));
  g.gain.setValueAtTime(volume, t + duree * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.start(t);
  o.stop(t + duree + 0.02);
}

const GAMME = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];

/** Sons de la machine à sous. */
export const sonsMachine = {
  depart: () => {
    souffle(0.18, 0.12, 700, 0, 0.6);
    note(196, 0.12, "triangle", 0.05);
  },
  /** Bruit de fond des rouleaux qui tournent (appelé à intervalles réguliers). */
  roulement: () => souffle(0.05, 0.035, 1500 + Math.random() * 400, 0, 1.5),
  arret: (i: number) => {
    note(110 + i * 6, 0.09, "triangle", 0.09);
    souffle(0.05, 0.14, 2600, 0, 1.2);
  },
  bonus: (n: number) => {
    const base = 659 * 2 ** (n / 6);
    note(base, 0.35, "sine", 0.07);
    note(base * 1.5, 0.35, "sine", 0.05, 0.06);
    note(base * 2, 0.5, "triangle", 0.03, 0.12);
  },
  piece: () => {
    note(1975, 0.18, "sine", 0.05);
    note(2637, 0.28, "sine", 0.04, 0.05);
  },
  anticipation: (duree: number) => {
    glisse(180, 720, duree, "sawtooth", 0.022);
    glisse(270, 1080, duree, "square", 0.008);
  },
  cliquetis: () => {
    const f = 2400 + Math.random() * 1600;
    note(f, 0.04, "triangle", 0.025);
    note(f * 1.34, 0.05, "sine", 0.015, 0.02);
  },
  /** Petite mélodie de gain, plus riche selon le palier (0 à 5). */
  gain: (palier: number) => {
    const n = 3 + palier * 2;
    for (let i = 0; i < n; i++) note(GAMME[Math.min(GAMME.length - 1, i + palier)], 0.16 + palier * 0.02, i % 2 ? "triangle" : "sine", 0.05, i * 0.07);
    if (palier >= 2) [1047, 1319, 1568, 2093].forEach((f, i) => note(f, 0.6, "sine", 0.035, n * 0.07 + i * 0.03));
  },
  ligne: (i: number) => note(GAMME[Math.min(GAMME.length - 1, 2 + i)], 0.12, "sine", 0.04),
  multiplicateur: (m: number) => {
    glisse(300, 600 + m * 90, 0.35, "square", 0.02);
    note(880 + m * 60, 0.3, "sine", 0.06, 0.3);
  },
  fanfare: () => {
    const accords = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175, 1568]];
    accords.forEach((acc, i) => acc.forEach((f) => note(f, i === 3 ? 1.1 : 0.22, "triangle", 0.035, i * 0.18)));
    accords.forEach((acc, i) => acc.forEach((f) => note(f / 2, i === 3 ? 1.1 : 0.22, "sawtooth", 0.012, i * 0.18)));
  },
  palier: () => {
    glisse(400, 1600, 0.4, "sawtooth", 0.025);
    [1047, 1319, 1568, 2093].forEach((f, i) => note(f, 0.5, "sine", 0.05, 0.35 + i * 0.05));
    souffle(0.6, 0.12, 5000, 0.35, 0.5);
  },
  verrou: () => {
    note(392, 0.08, "square", 0.03);
    note(784, 0.18, "triangle", 0.05, 0.05);
  },
  relances: () => [1319, 1568, 1976].forEach((f, i) => note(f, 0.14, "sine", 0.045, i * 0.06)),
  jackpot: () => {
    for (let i = 0; i < 12; i++) note(GAMME[i % GAMME.length], 0.14, i % 2 ? "square" : "triangle", 0.03, i * 0.06);
    [523, 659, 784, 1047].forEach((f) => note(f, 1.4, "triangle", 0.035, 0.75));
    souffle(1, 0.1, 6000, 0.7, 0.5);
  },
  fin: () => [1568, 1319, 1047].forEach((f, i) => note(f, 0.2, "sine", 0.04, i * 0.08)),
};

export const sons = {
  jeton: () => {
    note(2500, 0.03, "triangle", 0.04);
    note(3200, 0.03, "triangle", 0.03, 0.028);
  },
  carte: () => souffle(0.08, 0.16, 2300, 0, 0.7),
  retourne: () => souffle(0.06, 0.1, 3400, 0, 0.8),
  tic: () => souffle(0.025, 0.14, 4200, 0, 2),
  melange: () => {
    for (let i = 0; i < 7; i++) souffle(0.05, 0.09, 1800 + i * 200, i * 0.055, 0.7);
  },
  bille: () => souffle(0.5, 0.08, 900, 0, 0.4),
  gain: (palier = 0) => {
    [523, 659, 784, 1047].forEach((f, i) => note(f, 0.18, "sine", 0.06, i * 0.09));
    if (palier >= 1) [1319, 1568].forEach((f, i) => note(f, 0.24, "triangle", 0.05, 0.36 + i * 0.1));
    if (palier >= 2) [1047, 1319, 1568, 2093].forEach((f, i) => note(f, 0.4, "sine", 0.05, 0.6 + i * 0.08));
  },
  perte: () => {
    note(220, 0.2, "triangle", 0.05);
    note(165, 0.34, "triangle", 0.05, 0.14);
  },
  egalite: () => note(440, 0.16, "sine", 0.04),
};
