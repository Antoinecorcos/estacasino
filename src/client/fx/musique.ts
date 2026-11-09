import { useSyncExternalStore } from "react";

// Musique d'ambiance : un petit trio de jazz lounge joué en direct avec la Web Audio API
// (piano électrique, contrebasse, balais), sur une grille d'accords qui tourne en boucle.
// Coupée par défaut ; le choix est mémorisé dans le navigateur.

const CLE = "esta-musique";
const TEMPO = 76; // noires par minute
const NOIRE = 60 / TEMPO;
const SWING = 0.62; // la croche « en l'air » arrive à 62 % de la noire

// Grille de 8 mesures (notes MIDI). Basse : fondamentale, quinte, et la tierce pour la marche.
const GRILLE: { nom: string; piano: number[]; fond: number; quinte: number; tierce: number }[] = [
  { nom: "Dm9", piano: [53, 57, 60, 64], fond: 38, quinte: 45, tierce: 41 },
  { nom: "G13", piano: [53, 59, 64, 67], fond: 43, quinte: 50, tierce: 47 },
  { nom: "Cmaj9", piano: [52, 55, 59, 62], fond: 36, quinte: 43, tierce: 40 },
  { nom: "A7b9", piano: [55, 58, 61, 64], fond: 45, quinte: 52, tierce: 49 },
  { nom: "Fmaj9", piano: [52, 55, 57, 60], fond: 41, quinte: 48, tierce: 45 },
  { nom: "Em7", piano: [50, 55, 59, 62], fond: 40, quinte: 47, tierce: 43 },
  { nom: "A7b9", piano: [55, 58, 61, 64], fond: 45, quinte: 52, tierce: 49 },
  { nom: "Dm9-G13", piano: [53, 57, 60, 64], fond: 38, quinte: 45, tierce: 43 },
];
const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let actif = lire();
const abonnes = new Set<() => void>();
let ctx: AudioContext | null = null;
let maitre: GainNode | null = null;
let bruit: AudioBuffer | null = null;
let minuteur: ReturnType<typeof setInterval> | null = null;
let prochainTemps = 0;
let pas = 0; // croche courante (8 par mesure)

function lire(): boolean {
  try {
    return localStorage.getItem(CLE) === "1";
  } catch {
    return false;
  }
}

export function useMusiqueActive(): boolean {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => actif,
  );
}

export function basculerMusique(): void {
  actif = !actif;
  try {
    localStorage.setItem(CLE, actif ? "1" : "0");
  } catch {
    /* préférence non mémorisée */
  }
  abonnes.forEach((f) => f());
  if (actif) demarrer();
  else arreter();
}

/** À appeler après une interaction (les navigateurs bloquent le son avant le premier clic). */
export function reprendreMusique(): void {
  if (actif && !minuteur) demarrer();
}

function demarrer(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 3;
      maitre = ctx.createGain();
      maitre.gain.value = 0;
      maitre.connect(comp).connect(ctx.destination);
      bruit = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = bruit.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    void ctx.resume();
    const t = ctx.currentTime;
    maitre!.gain.cancelScheduledValues(t);
    maitre!.gain.setValueAtTime(maitre!.gain.value, t);
    maitre!.gain.linearRampToValueAtTime(0.16, t + 2.5);
    if (!minuteur) {
      prochainTemps = t + 0.1;
      pas = 0;
      minuteur = setInterval(planifier, 90);
    }
  } catch {
    /* Web Audio indisponible */
  }
}

function arreter(): void {
  if (!ctx || !maitre) return;
  const t = ctx.currentTime;
  maitre.gain.cancelScheduledValues(t);
  maitre.gain.setValueAtTime(maitre.gain.value, t);
  maitre.gain.linearRampToValueAtTime(0, t + 1.2);
  setTimeout(() => {
    if (actif) return;
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
    void ctx?.suspend();
  }, 1400);
}

/** Programme les notes des 300 prochaines millisecondes (technique de l'horloge anticipée). */
function planifier(): void {
  if (!ctx) return;
  while (prochainTemps < ctx.currentTime + 0.3) {
    jouerPas(pas, prochainTemps);
    // Croches swing : longue puis courte.
    prochainTemps += pas % 2 === 0 ? NOIRE * SWING : NOIRE * (1 - SWING);
    pas = (pas + 1) % (8 * GRILLE.length);
  }
}

function jouerPas(p: number, t: number): void {
  const mesure = Math.floor(p / 8);
  const croche = p % 8;
  const temps = croche / 2; // 0, 0.5, 1…
  const accord = GRILLE[mesure];
  const suivant = GRILLE[(mesure + 1) % GRILLE.length];

  // Contrebasse : une note par temps (fondamentale, quinte, tierce, puis approche chromatique de l'accord suivant).
  if (croche % 2 === 0) {
    const n = [accord.fond, accord.quinte, accord.tierce, suivant.fond + (Math.random() < 0.5 ? 1 : -1)][temps];
    basse(freq(n), t);
  }
  // Piano électrique : accords sur le 1, anticipation sur le « et » du 2, parfois sur le 3.
  if (croche === 0 && Math.random() < 0.75) piano(accord.piano, t, 0.9);
  if (croche === 3 && Math.random() < 0.6) piano(accord.piano, t, 0.55);
  if (croche === 4 && Math.random() < 0.25) piano(accord.piano, t, 0.45);
  // Petite phrase mélodique de temps en temps, dans l'aigu.
  if (croche === 5 && Math.random() < 0.18) {
    const notes = accord.piano.map((n) => n + 12);
    for (let i = 0; i < 3; i++) piano([notes[Math.floor(Math.random() * notes.length)]], t + i * NOIRE * 0.5, 0.35);
  }
  // Balais : frottement continu, et coup plus marqué sur le 2 et le 4.
  balai(t, croche % 4 === 2 ? 0.05 : 0.018, croche % 4 === 2 ? 0.16 : 0.07);
}

function piano(notes: number[], t: number, force: number): void {
  if (!ctx || !maitre) return;
  const filtre = ctx.createBiquadFilter();
  filtre.type = "lowpass";
  filtre.frequency.value = 2400;
  filtre.connect(maitre);
  for (const n of notes) {
    const f = freq(n);
    for (const [mult, vol, duree] of [[1, 0.05, 2.4], [2, 0.012, 0.7], [3.01, 0.004, 0.25]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * mult;
      o.detune.value = (Math.random() - 0.5) * 6;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * force, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
      o.connect(g).connect(filtre);
      o.start(t);
      o.stop(t + duree + 0.05);
    }
  }
}

function basse(f: number, t: number): void {
  if (!ctx || !maitre) return;
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  const filtre = ctx.createBiquadFilter();
  o.type = "sine";
  o2.type = "triangle";
  o.frequency.value = f;
  o2.frequency.value = f;
  filtre.type = "lowpass";
  filtre.frequency.value = 520;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + NOIRE * 0.95);
  o.connect(filtre);
  o2.connect(filtre);
  filtre.connect(g).connect(maitre);
  for (const x of [o, o2]) {
    x.start(t);
    x.stop(t + NOIRE);
  }
}

function balai(t: number, volume: number, duree: number): void {
  if (!ctx || !maitre || !bruit) return;
  const s = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  s.buffer = bruit;
  f.type = "bandpass";
  f.frequency.value = 4200;
  f.Q.value = 0.7;
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  s.connect(f).connect(g).connect(maitre);
  s.start(t, Math.random() * 0.3, duree);
}
