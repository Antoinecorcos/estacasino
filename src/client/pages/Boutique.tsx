import { useEffect, useState } from "react";
import type { Produit } from "../../shared/boutique";
import { formatJetons, formatPrix, PLAFOND_PACKS_JOUR } from "../../shared/regles";
import { trouverTheme } from "../../shared/themes";
import { api } from "../api";
import { ApercuTheme } from "../components/ApercuTheme";
import { Avatar } from "../components/Avatar";
import { Page } from "../components/Elements";
import { Lien } from "../router";
import { useSession } from "../session";

type ProduitAffiche = Produit & { possede: boolean };

export function Boutique() {
  const { moi, rafraichir, notifier } = useSession();
  const [donnees, setDonnees] = useState<{ paiementActif: boolean; saison: { nom: string } | null; produits: ProduitAffiche[] } | null>(null);
  const [choix, setChoix] = useState<ProduitAffiche | null>(null);
  const [renonciation, setRenonciation] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => void api<{ paiementActif: boolean; saison: { nom: string } | null; produits: ProduitAffiche[] }>("/boutique").then(setDonnees);
  useEffect(() => {
    charger();
    const p = new URLSearchParams(location.search);
    if (p.get("achat") === "ok") {
      notifier("Merci ! Votre achat arrive sur votre compte d'ici quelques secondes.");
      // Le webhook Stripe peut arriver juste après le retour : on recharge un peu plus tard.
      setTimeout(() => {
        charger();
        void rafraichir();
      }, 2500);
      history.replaceState(null, "", "/boutique");
    } else if (p.get("achat") === "annule") {
      notifier("Paiement annulé. Rien n'a été débité.");
      history.replaceState(null, "", "/boutique");
    }
  }, []);

  const payer = async () => {
    if (!choix) return;
    setEnvoi(true);
    try {
      const r = await api<{ url: string }>("/boutique/checkout", { corps: { produit: choix.id, renonciation } });
      location.href = r.url;
    } catch (e) {
      notifier((e as Error).message, true);
      setEnvoi(false);
    }
  };

  const produits = donnees?.produits ?? [];
  const pack = produits.find((p) => p.type === "pack");
  const avatars = produits.filter((p) => p.type === "avatar");
  const accessoires = produits.filter((p) => p.type === "accessoire");
  const themes = produits.filter((p) => p.type === "theme");
  const offresJetons = produits.filter((p) => p.type === "jetons" || p.type === "forfait");

  const Fiche = ({ p }: { p: ProduitAffiche }) => (
    <article className={`carte-ui produit${p.type === "pack" ? " pack" : ""}`}>
      {p.type === "jetons" || p.type === "forfait" ? (
        <div className="apercu"><IllustrationJetons produit={p} /></div>
      ) : p.type === "pack" ? (
        <div className="rangee" style={{ gap: 6 }} aria-hidden="true">
          {avatars.map((a) => <Avatar key={a.id} config={a.apercu} taille={84} />)}
        </div>
      ) : p.type === "theme" ? (
        <ApercuTheme theme={trouverTheme(p.theme)} />
      ) : (
        <div className="apercu"><Avatar config={p.apercu} taille={120} titre={`Aperçu : ${p.nom}`} /></div>
      )}
      <div className="pile" style={{ gap: 8, flex: 1, minWidth: 220 }}>
        {p.type === "pack" && <span className="badge" style={{ alignSelf: "flex-start" }}>Économisez {formatPrix(avatars.reduce((a, x) => a + x.prixCentimes, 0) - p.prixCentimes)}</span>}
        {p.id === "jetons_100k" && <span className="badge" style={{ alignSelf: "flex-start" }}>Meilleure offre</span>}
        <h3 style={{ fontSize: 22 }}>{p.nom}</h3>
        <p className="muet" style={{ fontSize: 14 }}>{p.description}</p>
        <div className="prix">
          {formatPrix(p.prixCentimes)}
          <small>TTC</small>
        </div>
        {p.possede ? (
          <span className="badge" style={{ alignSelf: "flex-start" }}>{p.type === "forfait" ? `Actif · ${donnees?.saison?.nom ?? "saison en cours"}` : "Dans votre collection"}</span>
        ) : moi ? (
          <button type="button" className="btn btn-principal" style={{ alignSelf: "flex-start" }} disabled={!donnees?.paiementActif} onClick={() => { setChoix(p); setRenonciation(false); }}>
            {donnees?.paiementActif ? "Acheter" : "Bientôt disponible"}
          </button>
        ) : (
          <Lien href="/connexion" className="btn" style={{ alignSelf: "flex-start" }}>Se connecter pour acheter</Lien>
        )}
      </div>
    </article>
  );

  return (
    <Page>
      <div className="pile" style={{ gap: 28 }}>
        <div className="pile" style={{ gap: 8 }}>
          <div className="surtitre">La boutique</div>
          <h1 style={{ fontSize: 40 }}>Le style, pas la chance.</h1>
          <p className="muet" style={{ maxWidth: 640 }}>
            Des jetons pour rester à table, et des cosmétiques pour y briller : avatars, accessoires et thèmes. Prix TTC, TVA incluse.
          </p>
        </div>
        <section id="jetons" className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Jetons</h2>
          <div className="grille-boutique">{offresJetons.map((p) => <Fiche key={p.id} p={p} />)}</div>
          <p className="muet" style={{ fontSize: 13, maxWidth: 720 }}>
            Les jetons sont fictifs et n'ont aucune valeur monétaire : ils ne sont ni remboursables, ni convertibles en argent ou en lots, ni
            transférables à un autre joueur. Au plus {PLAFOND_PACKS_JOUR} packs par 24 heures. Le bonus quotidien et le filet de sécurité
            restent gratuits.
          </p>
        </section>
        {pack && <Fiche p={pack} />}
        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Thèmes de table · {formatPrix(themes[0]?.prixCentimes ?? 299)}</h2>
          <div className="grille-boutique">{themes.map((p) => <Fiche key={p.id} p={p} />)}</div>
        </section>
        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Avatars premium · {formatPrix(avatars[0]?.prixCentimes ?? 299)}</h2>
          <div className="grille-boutique">{avatars.map((p) => <Fiche key={p.id} p={p} />)}</div>
        </section>
        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Accessoires · {formatPrix(accessoires[0]?.prixCentimes ?? 99)}</h2>
          <div className="grille-boutique">{accessoires.map((p) => <Fiche key={p.id} p={p} />)}</div>
        </section>
        <p className="muet" style={{ fontSize: 13 }}>
          Paiement sécurisé par Stripe. Les jetons sont crédités dès la fin du paiement ; les avatars, accessoires et thèmes achetés
          s'équipent depuis votre <Lien href="/profil">profil</Lien>.
        </p>
      </div>

      {choix && (
        <div role="dialog" aria-modal="true" aria-labelledby="titre-achat" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="carte-ui formulaire" style={{ width: "100%" }}>
            <h2 id="titre-achat" style={{ fontSize: 28 }}>{choix.nom}</h2>
            <div className="rangee" style={{ gap: 16, flexWrap: "nowrap" }}>
              {choix.type === "theme" ? (
                <div style={{ width: 140 }}><ApercuTheme theme={trouverTheme(choix.theme)} /></div>
              ) : choix.type === "jetons" || choix.type === "forfait" ? (
                <IllustrationJetons produit={choix} taille={84} />
              ) : (
                <Avatar config={choix.apercu} taille={84} />
              )}
              <div className="prix">
                {formatPrix(choix.prixCentimes)}
                <small>TTC</small>
              </div>
            </div>
            {(choix.type === "jetons" || choix.type === "forfait") && (
              <p className="muet" style={{ fontSize: 13 }}>
                {choix.type === "forfait"
                  ? `Valable jusqu'à la fin de ${donnees?.saison?.nom ?? "la saison en cours"} : ${formatJetons(choix.jetons ?? 0)} jetons dès que votre solde tombe à zéro.`
                  : `${formatJetons(choix.jetons ?? 0)} jetons crédités sur votre solde dès la fin du paiement.`}{" "}
                Jetons fictifs, sans valeur monétaire, non remboursables et non transférables.
              </p>
            )}
            <label className="case">
              <input type="checkbox" checked={renonciation} onChange={(e) => setRenonciation(e.target.checked)} />
              <span>
                Je demande l'accès immédiat à ce contenu numérique et je reconnais perdre mon droit de rétractation une fois qu'il est
                disponible dans mon compte.
              </span>
            </label>
            <div className="rangee" style={{ gap: 10 }}>
              <button type="button" className="btn btn-principal" style={{ flex: 1 }} disabled={!renonciation || envoi} onClick={() => void payer()}>
                {envoi ? "Redirection…" : `Payer ${formatPrix(choix.prixCentimes)}`}
              </button>
              <button type="button" className="btn" onClick={() => setChoix(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

/** Vignette des offres de jetons : une pile, quatre piles, ou un jeton avec une flèche de recharge. */
function IllustrationJetons({ produit, taille = 120 }: { produit: Produit; taille?: number }) {
  const pile = (x: number, hauteur: number, couleur: string, cle: string) => (
    <g key={cle}>
      {Array.from({ length: hauteur }, (_, i) => (
        <g key={i} transform={`translate(${x} ${92 - i * 7})`}>
          <ellipse cx="0" cy="3" rx="18" ry="6" fill="rgba(0,0,0,0.35)" />
          <ellipse cx="0" cy="0" rx="18" ry="6" fill={couleur} stroke="#1a1410" strokeWidth="1" />
          <ellipse cx="0" cy="0" rx="11" ry="3.6" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeDasharray="3 3" />
        </g>
      ))}
    </g>
  );
  let contenu;
  if (produit.type === "forfait") {
    contenu = (
      <>
        {pile(60, 5, "var(--accent)", "a")}
        <path d="M60 18 a 30 30 0 1 1 -26 15" fill="none" stroke="var(--ivoire)" strokeWidth="4" strokeLinecap="round" />
        <path d="M26 24 l 8 10 l 4 -12 z" fill="var(--ivoire)" />
      </>
    );
  } else if ((produit.jetons ?? 0) >= 100_000) {
    contenu = [pile(30, 6, "var(--accent)", "a"), pile(60, 9, "#1f5c45", "b"), pile(90, 7, "var(--ivoire)", "c"), pile(45, 3, "#a03a2c", "d"), pile(77, 4, "var(--accent)", "e")];
  } else {
    contenu = [pile(48, 6, "#a03a2c", "a"), pile(74, 4, "var(--accent)", "b")];
  }
  return (
    <svg viewBox="0 0 120 110" width={taille} height={(taille * 110) / 120} role="img" aria-label={produit.nom}>
      {contenu}
    </svg>
  );
}
