import { describe, expect, it } from "vitest";
import { choisir, coteEstacasino, heureDeParis, interetDeBase, issueDuMatch, nomEquipe, nosCotes, probabilitesMarche } from "./foot";

describe("paris foot automatiques", () => {
  it("retire la marge du marché et applique nos 95 %", () => {
    // L'exemple du brainstorming : marché 1,65 / 3,90 / 4,80 (≈ 7 % de marge).
    const p = probabilitesMarche([{ home: 1.65, draw: 3.9, away: 4.8 }])!;
    expect(p.p1 + p.pN + p.p2).toBeCloseTo(1);
    expect(nosCotes(p)).toEqual({ cote1: 1.67, coteN: 3.96, cote2: 4.88 }); // arrondi au centième inférieur
  });
  it("fait la moyenne de plusieurs bookmakers et ignore les cotes absurdes", () => {
    const p = probabilitesMarche([{ home: 2, draw: 3.4, away: 3.6 }, { home: 2.1, draw: 3.3, away: 3.5 }, { home: 50, draw: 50, away: 50 }])!;
    expect(p.p1).toBeGreaterThan(0.42);
    expect(p.p1).toBeLessThan(0.48);
    expect(probabilitesMarche([])).toBeNull();
  });
  it("plafonne à 6 et ne descend jamais sous 1,01", () => {
    expect(coteEstacasino(0.05)).toBe(6);
    expect(coteEstacasino(0.99)).toBe(1.01);
  });
  it("garde en moyenne 95 % quand le plafond ne joue pas", () => {
    const p = { p1: 0.45, pN: 0.27, p2: 0.28 };
    const c = nosCotes(p);
    const rendu = p.p1 * c.cote1; // gain moyen pour 1 jeton misé sur « 1 »
    expect(rendu).toBeLessThanOrEqual(0.95);
    expect(rendu).toBeGreaterThan(0.94);
  });
  it("préfère les grosses affiches aux petits matchs", () => {
    const classique = { fixtureId: 1, ligueId: 61, equipe1: "Paris Saint Germain", equipe2: "Marseille", debut: 0, heureParis: 21 };
    const petit = { fixtureId: 2, ligueId: 61, equipe1: "Auxerre", equipe2: "Angers", debut: 0, heureParis: 15 };
    expect(interetDeBase(classique)).toBeGreaterThan(interetDeBase(petit) + 50);
    const retenus = choisir([{ interet: 80, n: "a" }, { interet: 200, n: "b" }, { interet: 40, n: "c" }, { interet: 120, n: "d" }]);
    expect(retenus.map((x) => x.n)).toEqual(["b", "d"]);
    expect(choisir([{ interet: 40 }])).toEqual([]); // jour sans match intéressant : rien
  });
  it("lit l'issue sur 90 minutes, rembourse les matchs reportés", () => {
    expect(issueDuMatch("FT", { home: 2, away: 1 }, { home: 2, away: 1 })).toBe("1");
    expect(issueDuMatch("AET", { home: 1, away: 1 }, { home: 2, away: 1 })).toBe("N"); // prolongation : nul au temps réglementaire
    expect(issueDuMatch("PEN", { home: 0, away: 0 }, { home: 0, away: 0 })).toBe("N");
    expect(issueDuMatch("PST", null, null)).toBe("annuler");
    expect(issueDuMatch("2H", { home: null, away: null }, { home: 1, away: 0 })).toBeNull();
  });
  it("calcule les heures de Paris, été comme hiver", () => {
    expect(new Date(heureDeParis("2026-11-30", 20)).toISOString()).toBe("2026-11-30T19:00:00.000Z");
    expect(new Date(heureDeParis("2027-07-01", 20)).toISOString()).toBe("2027-07-01T18:00:00.000Z");
    expect(new Date(heureDeParis("2026-12-31", 23, 30)).toISOString()).toBe("2026-12-31T22:30:00.000Z");
  });
  it("raccourcit les noms connus", () => {
    expect(nomEquipe("Paris Saint Germain")).toBe("Paris SG");
    expect(nomEquipe("Nantes")).toBe("Nantes");
  });
});
