import { useState } from "react";
import { imageSymbole } from "../machine/symboles";

// Petites vignettes des jeux (lobby et page d'accueil).

export function MiniRoue() {
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="56" cy="56" r="54" fill="#1a1d1f" />
      {Array.from({ length: 18 }, (_, i) => {
        const a1 = (i * 20 * Math.PI) / 180;
        const a2 = ((i + 1) * 20 * Math.PI) / 180;
        const p = (a: number, r: number) => `${56 + r * Math.sin(a)} ${56 - r * Math.cos(a)}`;
        return <path key={i} d={`M56 56 L${p(a1, 48)} A48 48 0 0 1 ${p(a2, 48)} Z`} fill={i === 0 ? "#1f7a52" : i % 2 ? "#b8433b" : "#141618"} />;
      })}
      <circle cx="56" cy="56" r="26" fill="#0b0d0e" style={{ stroke: "var(--accent)" }} strokeWidth="2" />
      <circle cx="56" cy="56" r="7" style={{ fill: "var(--accent)" }} />
    </svg>
  );
}

/** Trois symboles de la machine à sous. */
export function MiniMachine() {
  const [images] = useState(() => [imageSymbole({ s: "diamant" }, 120), imageSymbole({ s: "wild" }, 120), imageSymbole({ s: "bonus" }, 120)]);
  return (
    <div className="mini-machine">
      {images.map((src, i) => <img key={i} src={src} alt="" width={64} height={64} />)}
    </div>
  );
}
