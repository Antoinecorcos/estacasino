import { formatJetons } from "../../shared/regles";
import { BadgeChampion } from "../pages/Classement";
import { Lien } from "../router";
import { useSession } from "../session";

// Carte « Palmarès » du lobby : pendant les 7 jours qui suivent la fin d'une saison récompensée.
const NOMS: Record<string, string> = { general: "Classement général", blackjack: "Blackjack", roulette: "Roulette", poker: "Poker", machine: "Machine à sous" };

export function PalmaresLobby() {
  const { moi } = useSession();
  const p = moi?.palmares;
  if (!p?.champions.length) return null;
  const moiChampion = p.champions.some((c) => c.pseudo === moi?.pseudo);
  return (
    <section className="carte-ui palmares" aria-label={`Palmarès de la ${p.saison}`}>
      <div className="rangee" style={{ justifyContent: "space-between", gap: 8 }}>
        <h3>Palmarès de la {p.saison}</h3>
        <Lien href="/classement" style={{ fontSize: 13 }}>Classement de la nouvelle saison</Lien>
      </div>
      {moiChampion && <p className="accent" style={{ margin: 0, fontWeight: 700 }}>Bravo, vous êtes au palmarès ! Votre badge vous suit toute la saison.</p>}
      {p.champions.map((c) => (
        <div key={c.titre} className={`palmares-champion${c.titre === "general" ? " general" : ""}${c.pseudo === moi?.pseudo ? " moi" : ""}`}>
          <span className="muet" style={{ minWidth: 0 }}>{NOMS[c.titre] ?? c.titre}</span>
          <span className="rangee" style={{ gap: 8, flexWrap: "nowrap" }}>
            <strong>{c.pseudo}</strong>
            <BadgeChampion titre={c.titre} saison={p.saison} />
            {c.jetons > 0 && <span className="accent num">+{formatJetons(c.jetons)}</span>}
          </span>
        </div>
      ))}
    </section>
  );
}
