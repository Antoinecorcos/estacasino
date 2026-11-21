import { describe, expect, it } from "vitest";
import { increment, jeuCompte, jourDuCalendrier, MODELES, validerParams } from "./evenements";

describe("événements", () => {
  it("les modèles proposés sont valides", () => {
    for (const m of MODELES) expect(validerParams(m.type, m.params), m.nom).toBeNull();
  });
  it("refuse les réglages incohérents", () => {
    expect(validerParams("boost", { multDefis: 1, multBonus: 1 })).not.toBeNull();
    expect(validerParams("boost", { multDefis: 9, multBonus: 1 })).not.toBeNull();
    expect(validerParams("objectif", { mesure: "gains", jeu: "tous", cible: 10, recompense: 10 })).not.toBeNull();
    expect(validerParams("classement", { mesure: "gains", jeu: "machine", recompenses: [] })).not.toBeNull();
    expect(validerParams("calendrier", { recompenses: [100, -5] })).not.toBeNull();
  });
  it("compte les parties selon le jeu et la mesure", () => {
    expect(jeuCompte("tous", "poker")).toBe(true);
    expect(jeuCompte("machine", "blackjack")).toBe(false);
    expect(increment("parties", 500, -500)).toBe(1);
    expect(increment("mises", 500, -500)).toBe(500);
    expect(increment("gains", 500, 1200)).toBe(1200);
  });
  it("numérote les jours du calendrier, passage d'un mois à l'autre compris", () => {
    expect(jourDuCalendrier("2026-12-01", "2026-12-01")).toBe(0);
    expect(jourDuCalendrier("2026-12-01", "2026-12-24")).toBe(23);
    expect(jourDuCalendrier("2026-11-30", "2026-12-01")).toBe(1);
    expect(jourDuCalendrier("2027-03-28", "2027-03-29")).toBe(1); // changement d'heure
  });
});
