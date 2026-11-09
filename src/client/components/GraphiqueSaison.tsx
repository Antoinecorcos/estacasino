import { useEffect, useRef, useState } from "react";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";

// Historique de la saison : une seule série à la fois (solde OU gains de saison), dans la couleur d'accent.
// Pas de légende (le titre nomme la série), survol avec réticule et infobulle, et vue en tableau.

interface Point {
  t: number;
  solde: number;
  gains: number;
}
type Serie = "solde" | "gains";

const HAUTEUR = 220;
const MARGES = { haut: 14, droite: 14, bas: 26, gauche: 64 };

function graduations(min: number, max: number, n = 4): number[] {
  const etendue = max - min || Math.abs(max) || 1;
  const brut = etendue / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut) ?? brut;
  const debut = Math.floor(min / pas) * pas;
  const valeurs: number[] = [];
  for (let v = debut; v <= max + pas * 0.001; v += pas) valeurs.push(Math.round(v));
  if (valeurs[valeurs.length - 1] < max) valeurs.push(valeurs[valeurs.length - 1] + pas);
  return valeurs;
}

const date = (t: number, heure = false) =>
  new Date(t).toLocaleString("fr-FR", heure ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });

export function GraphiqueSaison() {
  const [points, setPoints] = useState<Point[] | null>(null);
  const [nomSaison, setNomSaison] = useState("");
  const [serie, setSerie] = useState<Serie>("solde");
  const [survol, setSurvol] = useState<number | null>(null);
  const [largeur, setLargeur] = useState(640);
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api<{ saison: { nom: string } | null; points: Point[] }>("/moi/historique").then((r) => {
      setPoints(r.points);
      setNomSaison(r.saison?.nom ?? "");
    });
  }, []);
  useEffect(() => {
    if (!boite.current) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.max(280, e.contentRect.width)));
    obs.observe(boite.current);
    return () => obs.disconnect();
  }, [points !== null]);

  if (!points) return null;
  const titre = serie === "solde" ? "Solde total" : "Gains de la saison";

  const valeurs = points.map((p) => p[serie]);
  let vMin = Math.min(...valeurs, serie === "gains" ? 0 : Infinity);
  let vMax = Math.max(...valeurs, serie === "gains" ? 0 : -Infinity);
  if (vMin === vMax) {
    vMin -= 500;
    vMax += 500;
  }
  const ticks = graduations(vMin, vMax);
  const yMin = Math.min(ticks[0], vMin);
  const yMax = Math.max(ticks[ticks.length - 1], vMax);
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const L = largeur - MARGES.gauche - MARGES.droite;
  const H = HAUTEUR - MARGES.haut - MARGES.bas;
  // L'axe des temps suit l'ordre des mouvements (une partie active ne s'écrase pas entre deux longues pauses).
  const x = (i: number) => MARGES.gauche + (points.length > 1 ? (i / (points.length - 1)) * L : L / 2);
  const y = (v: number) => MARGES.haut + H - ((v - yMin) / (yMax - yMin)) * H;
  const ligne = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[serie]).toFixed(1)}`).join(" ");
  const base = serie === "gains" ? y(0) : MARGES.haut + H;
  const aire = `${ligne} L${x(points.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
  const dernier = points[points.length - 1];
  const p = survol !== null ? points[survol] : null;

  const surMouvement = (e: React.PointerEvent<SVGRectElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
    setSurvol(Math.round(r * (points.length - 1)));
  };

  return (
    <section className="carte-ui" style={{ padding: 24 }} id="saison">
      <div className="pile" style={{ gap: 14 }}>
        <div className="rangee" style={{ justifyContent: "space-between", gap: 12 }}>
          <div className="pile" style={{ gap: 2 }}>
            <div className="surtitre">{nomSaison || "Saison"} · historique</div>
            <h2 style={{ fontSize: 26 }}>{titre}</h2>
          </div>
          <div className="onglets" role="group" aria-label="Série affichée">
            <button type="button" aria-pressed={serie === "solde"} onClick={() => setSerie("solde")}>Solde</button>
            <button type="button" aria-pressed={serie === "gains"} onClick={() => setSerie("gains")}>Gains de saison</button>
          </div>
        </div>

        {points.length < 2 ? (
          <p className="italique accent" style={{ fontSize: 17 }}>Jouez quelques parties : votre courbe s'écrira ici.</p>
        ) : (
          <>
            <div className="chiffre-cle">
              <b className="num">{serie === "gains" && dernier.gains > 0 ? "+" : ""}{formatJetons(dernier[serie])}</b>
              <span className="muet">aujourd'hui, sur {formatJetons(points.length - 1)} mouvements</span>
            </div>
            <div ref={boite} className="graphique" style={{ height: HAUTEUR }}>
              <svg width={largeur} height={HAUTEUR} role="img" aria-label={`${titre} au fil de la saison : de ${formatJetons(points[0][serie])} à ${formatJetons(dernier[serie])} jetons`}>
                <defs>
                  <linearGradient id="aire-saison" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
                    <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {ticks.map((v) => (
                  <g key={v}>
                    <line x1={MARGES.gauche} x2={largeur - MARGES.droite} y1={y(v)} y2={y(v)} className={v === 0 && serie === "gains" ? "axe-zero" : "grille"} />
                    <text x={MARGES.gauche - 10} y={y(v)} className="etiquette-axe" textAnchor="end" dominantBaseline="middle">
                      {formatJetons(v)}
                    </text>
                  </g>
                ))}
                <text x={MARGES.gauche} y={HAUTEUR - 6} className="etiquette-axe">{date(t0, t1 - t0 < 36 * 3600_000)}</text>
                <text x={largeur - MARGES.droite} y={HAUTEUR - 6} className="etiquette-axe" textAnchor="end">{date(t1, t1 - t0 < 36 * 3600_000)}</text>
                <path d={aire} fill="url(#aire-saison)" />
                <path d={ligne} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(points.length - 1)} cy={y(dernier[serie])} r="4" fill="var(--accent)" stroke="var(--ardoise)" strokeWidth="2" />
                {p && survol !== null && (
                  <g pointerEvents="none">
                    <line x1={x(survol)} x2={x(survol)} y1={MARGES.haut} y2={MARGES.haut + H} className="reticule" />
                    <circle cx={x(survol)} cy={y(p[serie])} r="5" fill="var(--accent)" stroke="var(--ardoise)" strokeWidth="2" />
                  </g>
                )}
                <rect
                  x={MARGES.gauche}
                  y={0}
                  width={L}
                  height={HAUTEUR}
                  fill="transparent"
                  onPointerMove={surMouvement}
                  onPointerDown={surMouvement}
                  onPointerLeave={() => setSurvol(null)}
                />
              </svg>
              {p && survol !== null && (
                <div className="infobulle" style={{ left: Math.min(Math.max(x(survol), 90), largeur - 90), top: Math.max(4, y(p[serie]) - 56) }}>
                  <span className="muet">{date(p.t, true)}</span>
                  <b className="num">{serie === "gains" && p.gains > 0 ? "+" : ""}{formatJetons(p[serie])}</b>
                </div>
              )}
            </div>
            <details className="vue-tableau">
              <summary>Voir les données</summary>
              <div className="liste-defilante">
                <table className="tableau">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col" style={{ textAlign: "right" }}>Solde</th>
                      <th scope="col" style={{ textAlign: "right" }}>Gains de saison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().slice(0, 60).map((q, i) => (
                      <tr key={i}>
                        <td>{date(q.t, true)}</td>
                        <td className="num" style={{ textAlign: "right" }}>{formatJetons(q.solde)}</td>
                        <td className="num" style={{ textAlign: "right" }}>{formatJetons(q.gains)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
