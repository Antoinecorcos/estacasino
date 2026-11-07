import type { CSSProperties } from "react";
import type { Theme } from "../../shared/themes";

/** Vignette d'un thème de table : un bout de feutre, deux cartes et un jeton. */
export function ApercuTheme({ theme }: { theme: Theme }) {
  const style = {
    "--f": theme.feutre,
    "--a": theme.accent,
    background: `radial-gradient(ellipse at 50% 20%, ${theme.feutreCentre}, ${theme.feutre} 60%, ${theme.feutreBord})`,
    borderColor: theme.bois,
  } as CSSProperties;
  return (
    <div className="apercu-theme" style={style} role="img" aria-label={`Table au thème ${theme.nom}`}>
      <span className="mini-carte">A♠&#xFE0E;</span>
      <span className="mini-carte mini-dos" />
      <span className="mini-jeton" />
    </div>
  );
}
