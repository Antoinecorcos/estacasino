import { useEffect, useRef, useState } from "react";
import { REACTIONS } from "../../shared/protocole";
import type { Reaction } from "../useRoom";

/** Petit bouton discret qui ouvre les réactions rapides (fermé par défaut, pour ne pas charger l'écran). */
export function BoutonReactions({ reagir, className }: { reagir: (r: number) => void; className?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOuvert(false);
    };
    window.addEventListener("pointerdown", fermer);
    return () => window.removeEventListener("pointerdown", fermer);
  }, [ouvert]);
  return (
    <div ref={ref} className={`reactions ${className ?? ""}`}>
      <button type="button" className="bouton-icone bouton-reactions" aria-expanded={ouvert} aria-label="Réagir" title="Réagir" onClick={() => setOuvert((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </svg>
      </button>
      {ouvert && (
        <div className="menu-reactions" role="menu">
          {REACTIONS.map((texte, i) => (
            <button
              key={texte}
              type="button"
              role="menuitem"
              onClick={() => {
                reagir(i);
                setOuvert(false);
              }}
            >
              {texte}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bulle d'une réaction (au-dessus d'un joueur, ou dans la pile de la roulette). */
export function BulleReaction({ reaction, avecPseudo }: { reaction: Reaction; avecPseudo?: boolean }) {
  return (
    <span key={reaction.id} className="bulle-reaction" role="status">
      {avecPseudo && <b>{reaction.pseudo} · </b>}
      {REACTIONS[reaction.r]}
    </span>
  );
}
