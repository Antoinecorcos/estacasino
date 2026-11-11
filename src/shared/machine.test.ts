import { describe, expect, it } from "vitest";
import { BANDES_BASE, type Case, evaluerVoies, GAINS, type Grille, jouerTour, RANGEES, ROULEAUX } from "./machine";

/** Générateur déterministe pour des tests reproductibles. */
function graine(n: number) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const g = (lignes: string[][]): Grille => lignes.map((col) => col.map((s) => ({ s }) as Case));

describe("machine à sous", () => {
  it("compte les voies de gauche à droite, wilds compris", () => {
    // 2 diamants sur le rouleau 1, un wild sur le 2, un diamant sur le 3 : 2 × 1 × 1 = 2 voies de 3.
    const grille = g([
      ["diamant", "diamant", "trefle"],
      ["wild", "coeur", "pique"],
      ["carreau", "diamant", "trefle"],
      ["coeur", "pique", "carreau"],
      ["trefle", "trefle", "trefle"],
    ]);
    const gains = evaluerVoies(grille, 100);
    const diamant = gains.find((x) => x.symbole === "diamant")!;
    expect(diamant).toMatchObject({ longueur: 3, voies: 2, montant: GAINS.diamant[0] * 2 });
    // Le trèfle : rouleau 1 (1), wild du rouleau 2 (1), rouleau 3 (1), rouleau 4 : aucun → 3 de long.
    expect(gains.find((x) => x.symbole === "trefle")).toMatchObject({ longueur: 3, voies: 1 });
  });

  it("les bandes respectent leurs règles : un BONUS visible au plus par rouleau, pas de wild aux bords", () => {
    expect(BANDES_BASE).toHaveLength(ROULEAUX);
    for (const [r, bande] of BANDES_BASE.entries()) {
      if (r === 0 || r === 4) expect(bande).not.toContain("wild");
      for (let i = 0; i < bande.length; i++) {
        const vue = Array.from({ length: RANGEES }, (_, k) => bande[(i + k) % bande.length]);
        expect(vue.filter((s) => s === "bonus").length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("redistribue entre 90 et 100 % sur un grand nombre de tours", () => {
    const h = graine(42);
    let mise = 0;
    let gains = 0;
    for (let i = 0; i < 300_000; i++) {
      const r = jouerTour(10, h);
      mise += 10;
      gains += r.total;
      expect(r.total).toBeLessThanOrEqual(10 * 5000);
    }
    const rtp = gains / mise;
    expect(rtp).toBeGreaterThan(0.9);
    expect(rtp).toBeLessThan(1.0);
  }, 30_000);
});
