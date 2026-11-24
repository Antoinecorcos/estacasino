import { describe, expect, it } from "vitest";
import { coteDe, gainPotentiel, sommeProbabilites, validerRencontre } from "./paris";

const base = { sport: "Football", competition: "Ligue 1", equipe1: "Paris", equipe2: "Marseille", debut: Date.now() + 3_600_000, cote1: 1.85, coteN: 3.4, cote2: 4.2 };

describe("paris sportifs", () => {
  it("calcule le gain (mise comprise), arrondi au jeton inférieur", () => {
    expect(gainPotentiel(500, 1.85)).toBe(925);
    expect(gainPotentiel(100, 1.01)).toBe(101);
    expect(gainPotentiel(333, 2.5)).toBe(832);
    expect(gainPotentiel(10, 1.15)).toBe(11); // 11,499… → 11
  });
  it("donne la cote du choix, sans nul quand il n'y en a pas", () => {
    expect(coteDe(base, "N")).toBe(3.4);
    expect(coteDe({ ...base, coteN: null }, "N")).toBeNull();
  });
  it("valide la saisie d'une rencontre", () => {
    expect(validerRencontre(base)).toBeNull();
    expect(validerRencontre({ ...base, coteN: null })).toBeNull();
    expect(validerRencontre({ ...base, cote1: 1 })).not.toBeNull();
    expect(validerRencontre({ ...base, equipe2: "paris" })).not.toBeNull();
    expect(validerRencontre({ ...base, sport: "Pétanque" })).not.toBeNull();
  });
  it("mesure la marge implicite des cotes", () => {
    expect(sommeProbabilites({ cote1: 2, coteN: null, cote2: 2 })).toBeCloseTo(1);
    expect(sommeProbabilites(base)).toBeGreaterThan(1);
  });
});
