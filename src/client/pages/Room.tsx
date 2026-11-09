import { useEffect, useState } from "react";
import type { Jeu } from "../../shared/regles";
import { api } from "../api";
import { Lien } from "../router";
import { useSession } from "../session";
import type { StatutConnexion } from "../useRoom";
import { TableBlackjack } from "./Blackjack";
import { TablePoker } from "./Poker";
import { TableRoulette } from "./Roulette";

export function BarreRoom({ titre, code, detail, statut }: { titre: string; code: string | null; detail: string; statut: StatutConnexion }) {
  const { notifier } = useSession();
  return (
    <div className="barre-jeu">
      <div className="rangee" style={{ gap: 14 }}>
        <Lien href="/" className="btn btn-petit" aria-label="Retour au lobby">← Lobby</Lien>
        <div className="pile" style={{ gap: 2 }}>
          <h1 style={{ fontSize: 24 }}>{titre}</h1>
          <span className="muet" style={{ fontSize: 13 }}>{detail} · <span title="Jetons fictifs, sans aucune valeur monétaire. Réservé aux 18 ans et plus.">jetons fictifs, 18+</span></span>
        </div>
      </div>
      <div className="rangee" style={{ gap: 12 }}>
        {statut !== "ouvert" && <span className="muet" style={{ fontSize: 13 }}>{statut === "perdu" ? "Reconnexion…" : "Connexion…"}</span>}
        {code && (
          <div className="code-room">
            <span className="muet" style={{ fontSize: 12 }}>Room</span>
            <span className="code">{code}</span>
            <button
              type="button"
              className="btn btn-petit"
              style={{ minHeight: 32, borderColor: "transparent", color: "var(--accent)" }}
              onClick={() => {
                void navigator.clipboard?.writeText(code);
                notifier(`Code ${code} copié. Envoyez-le à vos amis.`);
              }}
            >
              Copier
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PageBlackjackSolo() {
  return <TableBlackjack chemin="/jeu/blackjack/solo/ws" />;
}

export function PageRouletteSolo() {
  return <TableRoulette chemin="/jeu/roulette/solo/ws" />;
}

export function PageGrandeRoue() {
  return <TableRoulette chemin="/jeu/roulette/grande-roue/ws" />;
}

export function PageRoom({ code }: { code: string }) {
  const [jeu, setJeu] = useState<Jeu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    setJeu(null);
    setErreur(null);
    api<{ jeu: Jeu }>(`/rooms/${code}`)
      .then((r) => setJeu(r.jeu))
      .catch((e: Error) => setErreur(e.message));
  }, [code]);

  if (erreur) {
    return (
      <main className="page">
        <div className="conteneur pile" style={{ gap: 16, alignItems: "center", textAlign: "center", paddingTop: 40 }}>
          <h1 style={{ fontSize: 34 }}>Room introuvable</h1>
          <p className="muet">{erreur} Elle a peut-être fermé après 15 minutes sans joueur.</p>
          <Lien href="/" className="btn btn-principal">Retour au lobby</Lien>
        </div>
      </main>
    );
  }
  if (!jeu) return null;
  const chemin = `/rooms/${code}/ws`;
  if (jeu === "poker") return <TablePoker chemin={chemin} />;
  return jeu === "blackjack" ? <TableBlackjack chemin={chemin} /> : <TableRoulette chemin={chemin} />;
}
