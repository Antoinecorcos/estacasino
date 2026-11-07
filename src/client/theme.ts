import { useEffect } from "react";
import { trouverTheme } from "../shared/themes";

/** Applique un thème de table à toute l'interface (variables CSS du feutre et de l'accent). */
export function appliquerTheme(id: string | null | undefined): void {
  const t = trouverTheme(id);
  const s = document.documentElement.style;
  s.setProperty("--feutre", t.feutre);
  s.setProperty("--accent", t.accent);
  s.setProperty("--accent-clair", t.accentClair);
}

/** Dans une room, on affiche le thème de l'hôte ; en quittant, on revient au sien. */
export function useThemeRoom(themeRoom: string | null | undefined, themePerso: string | undefined): void {
  useEffect(() => {
    appliquerTheme(themeRoom ?? themePerso);
    return () => appliquerTheme(themePerso);
  }, [themeRoom, themePerso]);
}
