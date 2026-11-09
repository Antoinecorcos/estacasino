import { describe, expect, it } from "vitest";
import type { Carte } from "./cartes";
import { calculerPots, libelleProvisoire, meilleureMain, partagerPots } from "./poker";

const c = (txt: string): Carte[] =>
  txt.split(" ").map((t) => ({ r: t.slice(0, -1) as Carte["r"], c: t.slice(-1) as Carte["c"] }));

describe("évaluation des mains", () => {
  it("reconnaît chaque catégorie avec un libellé français", () => {
    expect(meilleureMain(c("AH KH QH JH 10H 2C 3D")).libelle).toBe("Quinte flush royale");
    expect(meilleureMain(c("9S 8S 7S 6S 5S AD AC")).libelle).toBe("Quinte flush au 9");
    expect(meilleureMain(c("8C 8D 8H 8S KD 2C 3D")).libelle).toBe("Carré de 8");
    expect(meilleureMain(c("KC KD KH 7S 7D 2C 3D")).libelle).toBe("Full aux rois par les 7");
    expect(meilleureMain(c("AH 9H 7H 4H 2H KC QD")).libelle).toBe("Couleur à cœur");
    expect(meilleureMain(c("AH 2C 7D 4S 9H KC KD")).libelle).toBe("Paire de rois");
    expect(meilleureMain(c("AH 2C 3D 4S 5H 9C JD")).libelle).toBe("Quinte au 5");
    expect(meilleureMain(c("10H JC QD KS AH 2C 2D")).libelle).toBe("Quinte à l'as");
    expect(meilleureMain(c("QC QD QH 7S 4D 2C 3D")).libelle).toBe("Brelan de dames");
    expect(meilleureMain(c("JC JD 7H 7S 4D 2C 3D")).libelle).toBe("Deux paires, valets et 7");
    expect(meilleureMain(c("AC AD 9H 7S 4D 2C 3D")).libelle).toBe("Paire d'as");
    expect(meilleureMain(c("KC JD 9H 7S 4D 2C 3H")).libelle).toBe("Hauteur roi");
  });
  it("compare les mains et départage par les cartes hautes", () => {
    const board = "2C 7D 9H JS KD";
    const a = meilleureMain(c(`AH AS ${board}`));
    const b = meilleureMain(c(`KH QS ${board}`));
    const d = meilleureMain(c(`AD 3C ${board}`));
    const e = meilleureMain(c(`AC 4C ${board}`));
    expect(a.score).toBeGreaterThan(b.score);
    expect(d.score).toBe(e.score); // même main (A K J 9 7) : partage
    expect(meilleureMain(c("6H 5H 4H 3H 2H AS AD")).score).toBeGreaterThan(meilleureMain(c("AH 2C 3D 4S 5H KC 9D")).score);
  });
  it("donne un libellé provisoire avant la rivière", () => {
    expect(libelleProvisoire(c("AH AS"))).toBe("Paire d'as");
    expect(libelleProvisoire(c("AH KS"))).toBe("Hauteur as");
    expect(libelleProvisoire(c("7H 7S 7D 2C"))).toBe("Brelan de 7");
  });
});

describe("pots", () => {
  it("crée des pots annexes quand un joueur est à tapis", () => {
    const pots = calculerPots([
      { id: "a", engage: 100, couche: false }, // tapis court
      { id: "b", engage: 300, couche: false },
      { id: "c", engage: 300, couche: false },
      { id: "d", engage: 50, couche: true },
    ]);
    expect(pots).toEqual([
      { montant: 350, eligibles: ["a", "b", "c"] },
      { montant: 400, eligibles: ["b", "c"] },
    ]);
  });
  it("partage les pots et donne le jeton indivisible au premier après le bouton", () => {
    const pots = [{ montant: 301, eligibles: ["a", "b", "c"] }];
    const gains = partagerPots(pots, new Map([["a", 10], ["b", 10], ["c", 5]]), ["b", "c", "a"]);
    expect(gains.get("b")).toBe(151);
    expect(gains.get("a")).toBe(150);
    expect(gains.get("c")).toBeUndefined();
  });
  it("le tapis court gagne le pot principal, le suivant gagne l'annexe", () => {
    const pots = calculerPots([
      { id: "a", engage: 100, couche: false },
      { id: "b", engage: 300, couche: false },
      { id: "c", engage: 300, couche: false },
    ]);
    const gains = partagerPots(pots, new Map([["a", 30], ["b", 20], ["c", 10]]), ["a", "b", "c"]);
    expect(gains.get("a")).toBe(300);
    expect(gains.get("b")).toBe(400);
  });
});
