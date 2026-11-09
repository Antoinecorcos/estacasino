import { useEffect, useRef, useState } from "react";

// Rythme d'arrivée des cartes (identique à la table 3D) : une carte ne « compte » qu'une fois posée.
const ECART_DONNE_MS = 520;
const POSE_MS = 900; // vol depuis le sabot + retournement
const RETOURNE_MS = 500; // carte cachée du croupier qui se retourne

export interface CarteSuivie {
  cle: string;
  ordre: number;
  revelation: boolean;
}

/** Retourne une fonction « est posée » par clé de carte, et vrai quand toutes les cartes sont posées. */
export function useCartesPosees(cartes: CarteSuivie[]): { posee: (cle: string) => boolean; toutPose: boolean } {
  const poses = useRef(new Map<string, number>());
  const [, rafraichir] = useState(0);
  const now = Date.now();
  const nouvelles = cartes.filter((c) => !poses.current.has(c.cle)).sort((a, b) => a.ordre - b.ordre);
  nouvelles.forEach((c, i) => {
    const delai = c.revelation ? RETOURNE_MS : nouvelles.length > 1 ? i * ECART_DONNE_MS + POSE_MS : POSE_MS;
    poses.current.set(c.cle, now + delai);
  });
  const prochaine = Math.min(...cartes.map((c) => poses.current.get(c.cle)!).filter((t) => t > now));
  useEffect(() => {
    if (!Number.isFinite(prochaine)) return;
    const t = setTimeout(() => rafraichir((x) => x + 1), prochaine - Date.now() + 16);
    return () => clearTimeout(t);
  }, [prochaine]);
  return {
    posee: (cle) => (poses.current.get(cle) ?? Infinity) <= Date.now(),
    toutPose: !Number.isFinite(prochaine),
  };
}

