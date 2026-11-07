import type { ConfigAvatar } from "./avatar";
import { THEMES } from "./themes";

// Boutique : uniquement des cosmétiques. Prix en centimes, TVA INCLUSE (TTC).
// Côté Stripe, les prix sont créés avec tax_behavior = "inclusive" :
// le prix affiché est exactement le prix payé, et Stripe Tax calcule la TVA contenue dedans.
// Aucun produit ne donne de jetons, ni directement ni indirectement.

export type TypeProduit = "accessoire" | "avatar" | "pack" | "theme";

export interface Produit {
  id: string;
  type: TypeProduit;
  nom: string;
  description: string;
  prixCentimes: number; // TTC
  pieces: string[]; // pièces débloquées, ex. "tenue:smoking" ou "theme:minuit"
  apercu: ConfigAvatar; // avatar utilisé pour la vignette
  /** Pour un thème de table : son identifiant (la vignette montre une table). */
  theme?: string;
}

const base: ConfigAvatar = { peau: "p2", couleurCheveux: "brun", cheveux: "court", tenue: "col_roule", accessoire: "aucun", fond: "ardoise" };

const accessoire = (id: string, nom: string, description: string, apercu: Partial<ConfigAvatar>): Produit => ({
  id: `acc_${id}`,
  type: "accessoire",
  nom,
  description,
  prixCentimes: 199,
  pieces: [`accessoire:${id}`],
  apercu: { ...base, ...apercu, accessoire: id },
});

export const AVATARS_PREMIUM: Produit[] = [
  {
    id: "av_magnat",
    type: "avatar",
    nom: "Le Magnat",
    description: "Smoking noir, cheveux gominés, fond de velours. Il ne demande jamais le prix.",
    prixCentimes: 299,
    pieces: ["tenue:smoking", "cheveux:gomina", "fond:velours"],
    apercu: { peau: "p3", couleurCheveux: "noir", cheveux: "gomina", tenue: "smoking", accessoire: "aucun", fond: "velours" },
  },
  {
    id: "av_diva",
    type: "avatar",
    nom: "La Diva",
    description: "Robe du soir, ondulations des années 30, fond bleu nuit.",
    prixCentimes: 299,
    pieces: ["tenue:robe_soiree", "cheveux:ondule", "fond:nuit"],
    apercu: { peau: "p1", couleurCheveux: "roux", cheveux: "ondule", tenue: "robe_soiree", accessoire: "aucun", fond: "nuit" },
  },
  {
    id: "av_croupier",
    type: "avatar",
    nom: "Le Croupier de minuit",
    description: "Gilet vert feutre, raie impeccable, fond minuit. Il a tout vu.",
    prixCentimes: 299,
    pieces: ["tenue:gilet_croupier", "cheveux:raie", "fond:minuit"],
    apercu: { peau: "p5", couleurCheveux: "argent", cheveux: "raie", tenue: "gilet_croupier", accessoire: "aucun", fond: "minuit" },
  },
  {
    id: "av_heritiere",
    type: "avatar",
    nom: "L'Héritière",
    description: "Veste de velours, frange de soie, fond laiton. L'argent n'a pas d'odeur ; ici, il n'existe pas.",
    prixCentimes: 299,
    pieces: ["tenue:veste_velours", "cheveux:frange", "fond:laiton"],
    apercu: { peau: "p6", couleurCheveux: "noir", cheveux: "frange", tenue: "veste_velours", accessoire: "aucun", fond: "laiton" },
  },
];

export const PRODUITS: Produit[] = [
  ...AVATARS_PREMIUM,
  {
    id: "pack_salon",
    type: "pack",
    nom: "Collection Salon privé",
    description: "Les 4 avatars premium : Le Magnat, La Diva, Le Croupier de minuit et L'Héritière.",
    prixCentimes: 899,
    pieces: AVATARS_PREMIUM.flatMap((x) => x.pieces),
    apercu: AVATARS_PREMIUM[0].apercu,
  },
  accessoire("fedora", "Fedora", "Feutre noir, ruban laiton. Pour les entrées remarquées.", { cheveux: "court" }),
  accessoire("lunettes_nuit", "Lunettes de nuit", "Personne ne lira votre jeu.", { peau: "p4", cheveux: "rase" }),
  accessoire("monocle", "Monocle", "Monture laiton et chaînette. Indispensable pour examiner une carte.", { peau: "p1", couleurCheveux: "argent" }),
  accessoire("collier_perles", "Collier de perles", "Un rang de perles nacrées.", { peau: "p3", cheveux: "chignon", couleurCheveux: "chatain", tenue: "chemise" }),
  accessoire("casquette", "Casquette en tweed", "Gavroche, mais chic.", { peau: "p2", couleurCheveux: "roux" }),
  accessoire("creoles", "Créoles en laiton", "Elles captent toute la lumière de la salle.", { peau: "p6", cheveux: "boucles", couleurCheveux: "noir" }),
  ...THEMES.filter((t) => !t.gratuit).map(
    (t): Produit => ({
      id: `theme_${t.id}`,
      type: "theme",
      nom: t.nom,
      description: `${t.description} Vos amis le voient dans les rooms que vous ouvrez.`,
      prixCentimes: 299,
      pieces: [`theme:${t.id}`],
      apercu: base,
      theme: t.id,
    }),
  ),
];


export function trouverProduit(id: string): Produit | undefined {
  return PRODUITS.find((x) => x.id === id);
}
