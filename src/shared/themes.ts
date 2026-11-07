// Thèmes de table : feutre, bois de la table, dos des cartes et couleur d'accent de l'interface.
// « Club » est offert ; les autres sont des cosmétiques de la boutique (aucun effet sur le jeu).

export interface Theme {
  id: string;
  nom: string;
  description: string;
  gratuit: boolean;
  feutre: string; // couleur principale du feutre
  feutreCentre: string; // reflet au centre de la table
  feutreBord: string; // bords assombris
  bois: string; // rebord de la table
  accent: string;
  accentClair: string;
  dos: string; // fond du dos des cartes
}

export const THEMES: Theme[] = [
  {
    id: "club",
    nom: "Club",
    description: "Feutre vert bouteille et laiton : la maison.",
    gratuit: true,
    feutre: "#0F3D31", feutreCentre: "#1A6B52", feutreBord: "#06231B",
    bois: "#2A160C", accent: "#C9A45C", accentClair: "#E6D3A3", dos: "#0F3D31",
  },
  {
    id: "minuit",
    nom: "Minuit",
    description: "Bleu nuit profond et champagne. Pour les fins de partie qui n'en finissent pas.",
    gratuit: false,
    feutre: "#14294A", feutreCentre: "#24497E", feutreBord: "#08142A",
    bois: "#1B1612", accent: "#E6D3A3", accentClair: "#F4EAD0", dos: "#14294A",
  },
  {
    id: "velours",
    nom: "Velours",
    description: "Bordeaux et laiton, comme un salon privé de 1925.",
    gratuit: false,
    feutre: "#4A1622", feutreCentre: "#7A2638", feutreBord: "#250A11",
    bois: "#22110A", accent: "#D4AE62", accentClair: "#EBD3A0", dos: "#4A1622",
  },
  {
    id: "riviera",
    nom: "Riviera",
    description: "Bleu lagon et corail. La Méditerranée, sans le sable dans les cartes.",
    gratuit: false,
    feutre: "#0E4A52", feutreCentre: "#1B7884", feutreBord: "#05262B",
    bois: "#3A2818", accent: "#E8836B", accentClair: "#F5B7A6", dos: "#0E4A52",
  },
  {
    id: "onyx",
    nom: "Onyx",
    description: "Feutre anthracite, laque noire et or. Le thème de ceux qui n'ont rien à prouver.",
    gratuit: false,
    feutre: "#24282B", feutreCentre: "#3C4246", feutreBord: "#101214",
    bois: "#0B0B0C", accent: "#E2BE5E", accentClair: "#F2DC9C", dos: "#1C1F22",
  },
];

export const THEME_DEFAUT = THEMES[0];

export function trouverTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEME_DEFAUT;
}

/** Un thème est accessible s'il est gratuit ou s'il est dans l'inventaire (« theme:<id> »). */
export function themeAccessible(id: string, possede: (cle: string) => boolean): boolean {
  const t = THEMES.find((x) => x.id === id);
  return !!t && (t.gratuit || possede(`theme:${t.id}`));
}
