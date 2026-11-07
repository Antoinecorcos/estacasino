import { describe, expect, it } from "vitest";
import { estBlackjack, peutSeparer, reglerMain, valeurMain } from "./blackjack";
import { type Carte, nouveauSabot } from "./cartes";
import { definitionMise, miseGagnante, rendreMise } from "./roulette";
import { validerAvatar, AVATARS_DEPART } from "./avatar";
import { PRODUITS } from "./boutique";

const m = (...rs: string[]): Carte[] => rs.map((r) => ({ r: r as Carte["r"], c: "S" }));

describe("blackjack", () => {
  it("compte les As souples", () => {
    expect(valeurMain(m("A", "6"))).toEqual({ total: 17, souple: true });
    expect(valeurMain(m("A", "6", "9"))).toEqual({ total: 16, souple: false });
    expect(valeurMain(m("A", "A", "9"))).toEqual({ total: 21, souple: true });
  });
  it("reconnaît le blackjack, mais pas après séparation", () => {
    expect(estBlackjack(m("A", "K"), false)).toBe(true);
    expect(estBlackjack(m("A", "K"), true)).toBe(false);
    expect(estBlackjack(m("7", "7", "7"), false)).toBe(false);
  });
  it("paie le blackjack 3 pour 2", () => {
    expect(reglerMain(m("A", "Q"), 100, false, m("10", "8"))).toEqual({ issue: "blackjack", rendu: 250 });
  });
  it("gère égalités, bust et croupier qui saute", () => {
    expect(reglerMain(m("10", "8"), 100, false, m("9", "9")).rendu).toBe(100);
    expect(reglerMain(m("10", "8", "5"), 100, false, m("10", "6", "10")).issue).toBe("bust");
    expect(reglerMain(m("10", "2"), 100, false, m("10", "6", "10"))).toEqual({ issue: "gagne", rendu: 200 });
    expect(reglerMain(m("A", "K"), 100, false, m("A", "Q")).issue).toBe("egalite");
    expect(reglerMain(m("10", "10"), 100, false, m("A", "Q")).rendu).toBe(0);
  });
  it("autorise la séparation une seule fois, sur deux cartes de même valeur", () => {
    expect(peutSeparer(m("K", "10"), false)).toBe(true);
    expect(peutSeparer(m("8", "8"), true)).toBe(false);
    expect(peutSeparer(m("8", "9"), false)).toBe(false);
  });
  it("construit un sabot de 6 jeux complet", () => {
    let i = 0;
    const sabot = nouveauSabot(6, (n) => (i++ * 7919) % n);
    expect(sabot).toHaveLength(312);
    expect(sabot.filter((c) => c.r === "A" && c.c === "H")).toHaveLength(6);
  });
});

describe("roulette", () => {
  it("valide les mises", () => {
    expect(definitionMise("plein:0")?.paiement).toBe(35);
    expect(definitionMise("plein:37")).toBeNull();
    expect(definitionMise("plein:07")).toBeNull();
    expect(definitionMise("douzaine:4")).toBeNull();
    expect(definitionMise("rouge:1")).toBeNull();
  });
  it("calcule gains et pertes", () => {
    expect(rendreMise("plein:17", 100, 17)).toBe(3600);
    expect(rendreMise("rouge", 100, 1)).toBe(200);
    expect(rendreMise("rouge", 100, 0)).toBe(0);
    expect(rendreMise("douzaine:3", 100, 36)).toBe(300);
    expect(miseGagnante("colonne:1", 34)).toBe(true);
    expect(miseGagnante("manque", 0)).toBe(false);
  });
});

describe("avatars et boutique", () => {
  it("refuse une pièce payante non possédée", () => {
    const config = { ...AVATARS_DEPART[0].config, tenue: "smoking" };
    expect(validerAvatar(config, () => false)).toBeNull();
    expect(validerAvatar(config, (cle) => cle === "tenue:smoking")).not.toBeNull();
  });
  it("les avatars de départ sont gratuits", () => {
    for (const a of AVATARS_DEPART) expect(validerAvatar(a.config, () => false)).not.toBeNull();
  });
  it("chaque produit ne débloque que des pièces payantes et l'aperçu est valide une fois acheté", () => {
    for (const p of PRODUITS) {
      expect(p.pieces.length).toBeGreaterThan(0);
      if (p.type === "theme") expect(p.pieces).toEqual([`theme:${p.theme}`]);
      else expect(validerAvatar(p.apercu, (cle) => p.pieces.includes(cle))).not.toBeNull();
    }
  });
});
