import React, { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Entete, Pied } from "./components/Elements";
import { Accueil, Connexion, Inscription, MotDePasseOublie } from "./pages/Auth";
import { Admin } from "./pages/Admin";
import { Boutique } from "./pages/Boutique";
import { Classement } from "./pages/Classement";
import { Lobby } from "./pages/Lobby";
import { PageMachine } from "./pages/Machine";
import { Mentions } from "./pages/Mentions";
import { TablePoker } from "./pages/Poker";
import { PokerLobby } from "./pages/PokerLobby";
import { Profil } from "./pages/Profil";
import { PageBlackjackSolo, PageGrandeRoue, PageRoom, PageRouletteSolo } from "./pages/Room";
import { naviguer, useChemin } from "./router";
import { SessionProvider, useSession } from "./session";
import "./styles.css";

const PAGES_PUBLIQUES: Record<string, () => React.JSX.Element | null> = {
  "/inscription": Inscription,
  "/connexion": Connexion,
  "/mot-de-passe-oublie": MotDePasseOublie,
  "/mentions": Mentions,
  "/classement": Classement,
  "/boutique": Boutique,
};

/** Pages de jeu : plein écran, sans pied de page (la mention « jetons fictifs » est dans la barre du jeu). */
const PAGE_JEU = /^\/(blackjack|machine|roulette(\/solo)?|room\/[A-Za-z]{5}|poker\/table\/[a-z0-9-]+)$/;

function Contenu() {
  const chemin = useChemin();
  const { moi, charge } = useSession();
  const jeu = !!moi && PAGE_JEU.test(chemin);
  useEffect(() => {
    document.body.classList.toggle("page-jeu", jeu);
  }, [jeu]);
  if (!charge) return <main className="page" />;

  const Publique = PAGES_PUBLIQUES[chemin];
  if (Publique) return <Publique />;
  if (!moi) {
    if (chemin !== "/") {
      queueMicrotask(() => naviguer("/connexion", true));
      return null;
    }
    return <Accueil />;
  }
  if (chemin === "/") return <Lobby />;
  if (chemin === "/blackjack") return <PageBlackjackSolo />;
  if (chemin === "/machine") return <PageMachine />;
  if (chemin === "/roulette") return <PageGrandeRoue />;
  if (chemin === "/roulette/solo") return <PageRouletteSolo />;
  if (chemin === "/profil") return <Profil />;
  if (chemin === "/admin") return <Admin />;
  if (chemin === "/poker") return <PokerLobby />;
  const table = /^\/poker\/table\/([a-z0-9-]{3,40})$/.exec(chemin);
  if (table) return <TablePoker key={table[1]} chemin={`/poker/table/${table[1]}/ws`} />;
  const room = /^\/room\/([A-Za-z]{5})$/.exec(chemin);
  if (room) return <PageRoom code={room[1].toUpperCase()} />;
  return (
    <main className="page">
      <div className="conteneur pile" style={{ gap: 12, alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 40 }}>Cette table n'existe pas.</h1>
        <p className="italique accent">Le croupier a cherché partout. Même sous le tapis.</p>
        <button type="button" className="btn btn-principal" onClick={() => naviguer("/")}>Retour au lobby</button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <Entete />
      <Contenu />
      <Pied />
    </SessionProvider>
  </StrictMode>,
);
