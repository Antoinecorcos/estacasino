import type { ReactNode } from "react";
import { type Carte as TCarte, RANG_AFFICHE, SYMBOLES } from "../../shared/cartes";
import { formatJetons } from "../../shared/regles";
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
            </nav>
            <div className="soldes">
              <div className="solde" title="Vos jetons pour jouer. Ils sont conservés d'une saison à l'autre.">
                <div className="etiquette">Solde total</div>
                <div className="valeur">{formatJetons(moi.solde)}</div>
              </div>
              {moi.saison && (
                <div className="solde saison" title="Vos gains nets de la saison : c'est ce chiffre qui compte pour le classement.">
                  <div className="etiquette">Gains de saison</div>
                  <div className="valeur">
                    {moi.saison.gains > 0 ? "+" : ""}
                    {formatJetons(moi.saison.gains)}
                  </div>
                </div>
              )}
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
