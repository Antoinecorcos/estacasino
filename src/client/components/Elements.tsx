import { type ReactNode, useEffect, useRef, useState } from "react";
import { type Carte as TCarte, RANG_AFFICHE, SYMBOLES } from "../../shared/cartes";
import { formatJetons } from "../../shared/regles";
import { basculerSon, useSonActif } from "../fx/sons";
import { Lien } from "../router";
import { useSession } from "../session";
import { Avatar } from "./Avatar";

const NOMS_COULEURS = { S: "pique", H: "cœur", D: "carreau", C: "trèfle" } as const;

export function Carte({ carte, petite, surbrillance }: { carte: TCarte | null; petite?: boolean; surbrillance?: boolean }) {
  const classes = ["carte", petite && "petite", surbrillance && "surbrillance"].filter(Boolean).join(" ");
  if (!carte) return <div className={`${classes} dos`} role="img" aria-label="Carte cachée" />;
  const rouge = carte.c === "H" || carte.c === "D";
  const symbole = SYMBOLES[carte.c] + "︎";
  return (
    <div className={`${classes}${rouge ? " rouge" : ""}`} role="img" aria-label={`${RANG_AFFICHE[carte.r]} de ${NOMS_COULEURS[carte.c]}`}>
      <span className="coin" aria-hidden="true">
        {RANG_AFFICHE[carte.r]}
        <small>{symbole}</small>
      </span>
      <span className="centre" aria-hidden="true">
        {symbole}
      </span>
    </div>
  );
}

export const VALEURS_JETONS = [10, 50, 100, 500, 1000, 5000] as const;

export function libelleJeton(v: number): string {
  return v >= 1000 ? `${v / 1000}K` : String(v);
}

export function Jeton({ valeur, mini, ...reste }: { valeur: number; mini?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`jeton j${valeur}${mini ? " mini" : ""}`} aria-label={`Jeton de ${formatJetons(valeur)}`} {...reste}>
      {libelleJeton(valeur)}
    </button>
  );
}

export function Logo() {
  return (
    <Lien href="/" className="logo" aria-label="Estacasino, accueil">
      Esta<em>casino</em>
    </Lien>
  );
}

export function Entete() {
  const { moi } = useSession();
  return (
    <header className="entete">
      <div className="conteneur entete-int">
        <Logo />
        {moi ? (
          <>
            <nav className="nav" aria-label="Navigation principale">
              <Lien href="/">Jouer</Lien>
              <Lien href="/classement">Classement</Lien>
              <Lien href="/boutique">Boutique</Lien>
              <Lien href="/profil">Profil</Lien>
              {moi.role === "admin" && <Lien href="/admin">Admin</Lien>}
            </nav>
            <div className="soldes">
              <SoldeAnime valeur={moi.solde} />
              {moi.saison && (
                <div className="solde saison" title="Vos gains nets de la saison : c'est ce chiffre qui compte pour le classement.">
                  <div className="etiquette">Gains de saison</div>
                  <div className="valeur">
                    {moi.saison.gains > 0 ? "+" : ""}
                    {formatJetons(moi.saison.gains)}
                  </div>
                </div>
              )}
              <BoutonSon />
              <Lien href="/profil" className="profil-mini" aria-label="Mon profil">
                <Avatar config={moi.avatar} taille={40} />
                <span className="pseudo">{moi.pseudo}</span>
              </Lien>
            </div>
          </>
        ) : (
          <div className="rangee" style={{ gap: 10 }}>
            <Lien href="/connexion" className="btn btn-petit">
              Connexion
            </Lien>
            <Lien href="/inscription" className="btn btn-principal btn-petit">
              Créer un compte
            </Lien>
          </div>
        )}
      </div>
    </header>
  );
}

/** Solde total : le chiffre défile vers sa nouvelle valeur et s'éclaire à la hausse ou à la baisse. */
function SoldeAnime({ valeur }: { valeur: number }) {
  const [affiche, setAffiche] = useState(valeur);
  const [sens, setSens] = useState<"" | "monte" | "baisse">("");
  const courant = useRef(valeur);
  useEffect(() => {
    const depart = courant.current;
    if (depart === valeur) return;
    setSens(valeur > depart ? "monte" : "baisse");
    const t0 = performance.now();
    let raf = 0;
    const pas = (now: number) => {
      const s = Math.min(1, (now - t0) / 600);
      const v = Math.round(depart + (valeur - depart) * (1 - Math.pow(1 - s, 3)));
      courant.current = v;
      setAffiche(v);
      if (s < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    const fin = setTimeout(() => setSens(""), 900);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fin);
      courant.current = valeur;
    };
  }, [valeur]);
  return (
    <div id="solde-total" className={`solde ${sens}`} title="Vos jetons pour jouer. Ils sont conservés d'une saison à l'autre.">
      <div className="etiquette">Solde total</div>
      <div className="valeur">{formatJetons(affiche)}</div>
    </div>
  );
}

function BoutonSon() {
  const actif = useSonActif();
  return (
    <button type="button" className="bouton-icone" aria-pressed={actif} aria-label={actif ? "Couper le son" : "Activer le son"} title={actif ? "Couper le son" : "Activer le son"} onClick={basculerSon}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {actif ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6m0-6-6 6" />}
      </svg>
    </button>
  );
}

export function Pied() {
  return (
    <footer className="pied">
      <div className="conteneur pied-int">
        <div>Jetons fictifs, sans aucune valeur monétaire. Réservé aux 18 ans et plus.</div>
        <div className="rangee" style={{ gap: 16 }}>
          <Lien href="/mentions">Mentions et règles</Lien>
          <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noreferrer">
            Joueurs Info Service
          </a>
        </div>
      </div>
    </footer>
  );
}

export function Page({ children, etroite }: { children: ReactNode; etroite?: boolean }) {
  return (
    <main className="page">
      <div className="conteneur" style={etroite ? { maxWidth: 820 } : undefined}>
        {children}
      </div>
    </main>
  );
}

export function Compteur({ secondes, total }: { secondes: number | null; total: number }) {
  if (secondes === null) return null;
  const r = 14;
  const circ = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, secondes / total));
  return (
    <span className="rangee" style={{ gap: 8 }}>
      <svg className="anneau" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={r} fill="none" stroke="var(--ligne-2)" strokeWidth="3" />
        <circle
          cx="17" cy="17" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - ratio)} transform="rotate(-90 17 17)"
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <span className="compteur">{secondes}&nbsp;s</span>
    </span>
  );
}
