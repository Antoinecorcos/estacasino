// Avatars Estacasino : des bustes illustrés, construits à partir de pièces combinables.
// Certaines pièces sont gratuites, les autres s'obtiennent dans la boutique (cosmétiques uniquement).

export type Categorie = "peau" | "couleurCheveux" | "cheveux" | "tenue" | "accessoire" | "fond";

export interface ConfigAvatar {
  peau: string;
  couleurCheveux: string;
  cheveux: string;
  tenue: string;
  accessoire: string;
  fond: string;
}

export interface Piece {
  id: string; // unique dans sa catégorie
  categorie: Categorie;
  nom: string;
  gratuit: boolean;
  couleur?: string; // pour peau, couleurCheveux, fond
}

const p = (categorie: Categorie, id: string, nom: string, gratuit: boolean, couleur?: string): Piece => ({
  categorie, id, nom, gratuit, couleur,
});

export const PIECES: Piece[] = [
  p("peau", "p1", "Porcelaine", true, "#F3D3B8"),
  p("peau", "p2", "Pêche", true, "#E8BF9A"),
  p("peau", "p3", "Miel", true, "#D9A27A"),
  p("peau", "p4", "Cannelle", true, "#B97B54"),
  p("peau", "p5", "Noisette", true, "#8D5B3E"),
  p("peau", "p6", "Ébène", true, "#5E3B27"),

  p("couleurCheveux", "noir", "Noir", true, "#17130F"),
  p("couleurCheveux", "brun", "Brun", true, "#3B2A20"),
  p("couleurCheveux", "chatain", "Châtain", true, "#6B4A2F"),
  p("couleurCheveux", "blond", "Blond", true, "#D6B47A"),
  p("couleurCheveux", "roux", "Roux", true, "#9A4528"),
  p("couleurCheveux", "argent", "Argent", true, "#B9B4AC"),

  p("cheveux", "court", "Court", true),
  p("cheveux", "rase", "Rasé", true),
  p("cheveux", "carre", "Carré", true),
  p("cheveux", "long", "Long", true),
  p("cheveux", "chignon", "Chignon", true),
  p("cheveux", "boucles", "Boucles", true),
  p("cheveux", "gomina", "Gominé", false),
  p("cheveux", "ondule", "Ondulations 1930", false),
  p("cheveux", "raie", "Raie de côté", false),
  p("cheveux", "frange", "Frange de soie", false),

  p("tenue", "col_roule", "Col roulé", true),
  p("tenue", "chemise", "Chemise ouverte", true),
  p("tenue", "smoking", "Smoking", false),
  p("tenue", "robe_soiree", "Robe du soir", false),
  p("tenue", "gilet_croupier", "Gilet de croupier", false),
  p("tenue", "veste_velours", "Veste de velours", false),

  p("accessoire", "aucun", "Aucun", true),
  p("accessoire", "lunettes_rondes", "Lunettes rondes", true),
  p("accessoire", "noeud_papillon", "Nœud papillon", true),
  p("accessoire", "fedora", "Fedora", false),
  p("accessoire", "lunettes_nuit", "Lunettes de nuit", false),
  p("accessoire", "monocle", "Monocle", false),
  p("accessoire", "collier_perles", "Collier de perles", false),
  p("accessoire", "casquette", "Casquette en tweed", false),
  p("accessoire", "creoles", "Créoles en laiton", false),

  p("fond", "ardoise", "Ardoise", true, "#1E2326"),
  p("fond", "feutre", "Feutre", true, "#0F3D31"),
  p("fond", "velours", "Velours", false, "#4A1622"),
  p("fond", "nuit", "Bleu nuit", false, "#14294A"),
  p("fond", "laiton", "Laiton", false, "#8C6E33"),
  p("fond", "minuit", "Minuit", false, "#0A2A22"),
];

export const CATEGORIES: { id: Categorie; nom: string }[] = [
  { id: "peau", nom: "Teint" },
  { id: "cheveux", nom: "Coiffure" },
  { id: "couleurCheveux", nom: "Couleur" },
  { id: "tenue", nom: "Tenue" },
  { id: "accessoire", nom: "Accessoire" },
  { id: "fond", nom: "Fond" },
];

/** Identifiant global d'une pièce, utilisé dans l'inventaire : "tenue:smoking". */
export const cleePiece = (categorie: Categorie, id: string) => `${categorie}:${id}`;

export function trouverPiece(categorie: Categorie, id: string): Piece | undefined {
  return PIECES.find((x) => x.categorie === categorie && x.id === id);
}

export function couleurPiece(categorie: Categorie, id: string, defaut: string): string {
  return trouverPiece(categorie, id)?.couleur ?? defaut;
}

/** Les 3 avatars gratuits proposés à l'inscription. */
export const AVATARS_DEPART: { nom: string; config: ConfigAvatar }[] = [
  { nom: "L'Habitué", config: { peau: "p2", couleurCheveux: "brun", cheveux: "court", tenue: "col_roule", accessoire: "aucun", fond: "ardoise" } },
  { nom: "La Joueuse", config: { peau: "p4", couleurCheveux: "noir", cheveux: "carre", tenue: "chemise", accessoire: "lunettes_rondes", fond: "feutre" } },
  { nom: "Le Dandy", config: { peau: "p5", couleurCheveux: "noir", cheveux: "boucles", tenue: "chemise", accessoire: "noeud_papillon", fond: "ardoise" } },
];

export const AVATAR_DEFAUT: ConfigAvatar = AVATARS_DEPART[0].config;

const CLES: Categorie[] = ["peau", "couleurCheveux", "cheveux", "tenue", "accessoire", "fond"];

/** Vérifie la forme d'une configuration et que chaque pièce est gratuite ou possédée. */
export function validerAvatar(brut: unknown, possede: (cle: string) => boolean): ConfigAvatar | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const config = {} as ConfigAvatar;
  for (const cat of CLES) {
    const v = o[cat];
    if (typeof v !== "string") return null;
    const piece = trouverPiece(cat, v);
    if (!piece) return null;
    if (!piece.gratuit && !possede(cleePiece(cat, v))) return null;
    config[cat] = v;
  }
  return config;
}

export function lireAvatar(json: string): ConfigAvatar {
  try {
    return validerAvatar(JSON.parse(json), () => true) ?? AVATAR_DEFAUT;
  } catch {
    return AVATAR_DEFAUT;
  }
}
