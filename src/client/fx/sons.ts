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
