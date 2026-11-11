import { useState } from "react";
import { estInstallee, fermerTuto, installerNatif, plateforme, useInstallation } from "../installation";
import { useSession } from "../session";

// Tutoriel « Estacasino sur l'écran d'accueil » : feuille en bas d'écran sur mobile,
// simple astuce discrète sur ordinateur.

const IconePartager = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
    <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" />
  </svg>
);
const IconeAjouter = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);
const IconeMenu = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);
const IconePoints = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

function Etape({ n, titre, children }: { n: number; titre: string; children?: React.ReactNode }) {
  return (
    <li className="tuto-etape" style={{ animationDelay: `${0.15 + n * 0.12}s` }}>
      <span className="tuto-numero">{n}</span>
      <div className="pile" style={{ gap: 8, minWidth: 0, flex: 1 }}>
        <b>{titre}</b>
        {children}
      </div>
    </li>
  );
}

/** Imitation d'une ligne du menu Partager d'iOS, pour la reconnaître du premier coup d'œil. */
const LigneIos = ({ texte, icone }: { texte: string; icone: React.ReactNode }) => (
  <div className="tuto-ligne-ios">
    <span>{texte}</span>
    {icone}
  </div>
);

export function TutoInstallation() {
  const { moi, notifier } = useSession();
  const { ouvert, natif } = useInstallation();
  const [p] = useState(plateforme);
  if (!moi || !ouvert || estInstallee()) return null;

  if (p === "bureau") {
    return (
      <div className="tuto-astuce" role="status">
        <span>
          <b>Astuce :</b> ajoutez Estacasino à vos favoris avec <kbd>{/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"}</kbd> + <kbd>D</kbd> pour revenir en un clic.
        </span>
        {natif && (
          <button type="button" className="btn btn-petit btn-contour" onClick={() => void installerNatif().then((ok) => ok && fermerTuto())}>
            Installer comme une application
          </button>
        )}
        <button type="button" className="tuto-fermer" aria-label="Fermer l'astuce" onClick={fermerTuto}>×</button>
      </div>
    );
  }

  const installer = async () => {
    if (await installerNatif()) {
      notifier("Estacasino est installé : retrouvez l'icône sur votre écran d'accueil.");
      fermerTuto();
    }
  };

  return (
    <div className="tuto-fond" role="dialog" aria-modal="true" aria-labelledby="tuto-titre" onClick={fermerTuto}>
      <div className="tuto-feuille" onClick={(e) => e.stopPropagation()}>
        <div className="tuto-poignee" aria-hidden="true" />
        <div className="tuto-entete">
          <img src="/icones/icone-192.png" alt="" width={64} height={64} className="tuto-icone" />
          <div className="pile" style={{ gap: 4 }}>
            <h2 id="tuto-titre">Estacasino sur votre écran d'accueil</h2>
            <p className="muet">En plein écran, comme une vraie application. 10 secondes.</p>
          </div>
        </div>

        {p === "android" && natif ? (
          <div className="pile" style={{ gap: 12 }}>
            <button type="button" className="btn btn-principal tuto-installer" onClick={() => void installer()}>Installer l'application</button>
            <p className="muet" style={{ fontSize: 13, textAlign: "center" }}>Gratuit, sans passer par le Play Store, et presque aucune place sur le téléphone.</p>
          </div>
        ) : p === "android" ? (
          <ol className="tuto-etapes">
            <Etape n={1} titre="Ouvrez le menu du navigateur">
              <span className="muet">Les trois points <span className="tuto-pastille"><IconeMenu /></span> en haut à droite de Chrome.</span>
            </Etape>
            <Etape n={2} titre="« Installer l'application »">
              <span className="muet">Ou « Ajouter à l'écran d'accueil », selon votre téléphone.</span>
            </Etape>
            <Etape n={3} titre="Confirmez avec « Installer »" />
          </ol>
        ) : p === "ios-integre" ? (
          <ol className="tuto-etapes">
            <Etape n={1} titre="Ouvrez d'abord la page dans Safari">
              <span className="muet">
                Vous êtes dans le navigateur d'une autre application. Touchez <span className="tuto-pastille"><IconePoints /></span> puis
                « Ouvrir dans le navigateur » (ou « Ouvrir dans Safari »).
              </span>
            </Etape>
            <Etape n={2} titre="Puis suivez le guide dans Safari">
              <span className="muet">Partager, puis « Sur l'écran d'accueil ».</span>
            </Etape>
          </ol>
        ) : (
          <ol className="tuto-etapes">
            <Etape n={1} titre="Touchez le bouton Partager">
              <span className="muet">
                <span className="tuto-pastille"><IconePartager /></span>{" "}
                {p === "ios-safari"
                  ? "En bas de Safari (ou dans le menu ⋯)."
                  : "Dans la barre d'adresse, en haut à droite (ou dans le menu du navigateur)."}
              </span>
            </Etape>
            <Etape n={2} titre="Choisissez « Sur l'écran d'accueil »">
              <span className="muet">Faites défiler la liste si besoin.</span>
              <LigneIos texte="Sur l'écran d'accueil" icone={<IconeAjouter />} />
            </Etape>
            <Etape n={3} titre="Touchez « Ajouter »">
              <span className="muet">En haut à droite. L'icône Estacasino apparaît sur votre écran d'accueil.</span>
            </Etape>
          </ol>
        )}

        {p !== "android" && (
          <p className="tuto-note">
            À la première ouverture depuis l'icône, reconnectez-vous une fois avec votre pseudo et votre mot de passe : l'application
            garde sa propre session.
          </p>
        )}
        <div className="rangee" style={{ gap: 10 }}>
          <button type="button" className="btn btn-principal" style={{ flex: 1 }} onClick={fermerTuto}>C'est fait</button>
          <button type="button" className="btn" onClick={fermerTuto}>Plus tard</button>
        </div>
      </div>
      {p === "ios-safari" && <div className="tuto-fleche" aria-hidden="true">↓</div>}
    </div>
  );
}
