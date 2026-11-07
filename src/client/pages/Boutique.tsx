import { useEffect, useState } from "react";
import type { Produit } from "../../shared/boutique";
import { formatPrix } from "../../shared/regles";
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
  const [donnees, setDonnees] = useState<{ paiementActif: boolean; produits: ProduitAffiche[] } | null>(null);
  const [choix, setChoix] = useState<ProduitAffiche | null>(null);
  const [renonciation, setRenonciation] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => void api<{ paiementActif: boolean; produits: ProduitAffiche[] }>("/boutique").then(setDonnees);
  useEffect(() => {
    charger();
    const p = new URLSearchParams(location.search);
    if (p.get("achat") === "ok") {
      notifier("Merci ! Votre achat apparaît dans votre profil d'ici quelques secondes.");
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

  const Fiche = ({ p }: { p: ProduitAffiche }) => (
    <article className={`carte-ui produit${p.type === "pack" ? " pack" : ""}`}>
      {p.type === "pack" ? (
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
        <h3 style={{ fontSize: 22 }}>{p.nom}</h3>
        <p className="muet" style={{ fontSize: 14 }}>{p.description}</p>
        <div className="prix">
          {formatPrix(p.prixCentimes)}
          <small>TTC</small>
        </div>
        {p.possede ? (
          <span className="badge" style={{ alignSelf: "flex-start" }}>Dans votre collection</span>
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
            Uniquement des cosmétiques : avatars, accessoires et thèmes de table. Aucun achat ne donne de jetons ni d'avantage en jeu. Prix TTC, TVA incluse.
          </p>
        </div>
        {pack && <Fiche p={pack} />}
        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Thèmes de table · {formatPrix(themes[0]?.prixCentimes ?? 299)}</h2>
          <div className="grille-boutique">{themes.map((p) => <Fiche key={p.id} p={p} />)}</div>
        </section>
        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Avatars premium · {formatPrix(299)}</h2>
          <div className="grille-boutique">{avatars.map((p) => <Fiche key={p.id} p={p} />)}</div>
        </section>
        <section className="pile" style={{ gap: 14 }}>
          <h2 className="surtitre">Accessoires · {formatPrix(199)}</h2>
          <div className="grille-boutique">{accessoires.map((p) => <Fiche key={p.id} p={p} />)}</div>
        </section>
        <p className="muet" style={{ fontSize: 13 }}>
          Paiement sécurisé par Stripe. Les avatars, accessoires et thèmes achetés s'équipent depuis votre <Lien href="/profil">profil</Lien>.
        </p>
      </div>

      {choix && (
        <div role="dialog" aria-modal="true" aria-labelledby="titre-achat" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="carte-ui formulaire" style={{ width: "100%" }}>
            <h2 id="titre-achat" style={{ fontSize: 28 }}>{choix.nom}</h2>
            <div className="rangee" style={{ gap: 16, flexWrap: "nowrap" }}>
              {choix.type === "theme" ? <div style={{ width: 140 }}><ApercuTheme theme={trouverTheme(choix.theme)} /></div> : <Avatar config={choix.apercu} taille={84} />}
              <div className="prix">
                {formatPrix(choix.prixCentimes)}
                <small>TTC</small>
              </div>
            </div>
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
