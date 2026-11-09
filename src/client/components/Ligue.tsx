import { trouverLigue } from "../../shared/ligues";

/** Écusson de ligue : petit blason coloré et nom. */
export function BadgeLigue({ id, compact }: { id: string; compact?: boolean }) {
  const l = trouverLigue(id);
  return (
    <span className={`badge-ligue${compact ? " compact" : ""}`} style={{ color: l.couleur, borderColor: l.couleur }} title={`Ligue ${l.nom}`}>
      <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <path d="M6 0.6 11.2 2.6V6.8C11.2 10 8.9 12.4 6 13.4 3.1 12.4 0.8 10 0.8 6.8V2.6Z" fill="currentColor" />
        {(l.id === "diamant" || l.id === "legende") && <path d="M6 3.8 8.2 6.4 6 9.6 3.8 6.4Z" fill="#0B0D0E" opacity="0.55" />}
      </svg>
      {compact ? <span className="visuellement-cache">Ligue {l.nom}</span> : l.nom}
    </span>
  );
}
