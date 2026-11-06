import type { RlEtat, RlJoueur, RlMessageClient, RlPhase } from "../../shared/protocole";
import { definitionMise, rendreMise } from "../../shared/roulette";
import { formatJetons, ROULETTE_PLACES } from "../../shared/regles";
import { aleatoire } from "../crypto";
import { crediter, debiter, enregistrerResultat } from "../economie";
import { auHasard, ErreurJeu, type Identite, RoomBase } from "./base";

// Cycle de 30 secondes : 20 s de mises, 6 s de tirage (animation), 4 s de résultats.
// La roue ne tourne que s'il y a quelqu'un dans la room.
const DUREE_MISES_MS = 20_000;
const DUREE_TIRAGE_MS = 6_000;
const DUREE_RESULTATS_MS = 4_000;
const HISTORIQUE = 14;

export class RouletteRoom extends RoomBase<RlEtat, RlMessageClient> {
  private phase: RlPhase = "attente";
  private joueurs = new Map<string, RlJoueur>();
  private echeance: number | null = null;
  private resultat: number | null = null;
  private historique: number[] = [];
  private remarque: string | null = null;

  private get room(): string {
    return this.config?.code ?? "grande-roue";
  }

  protected rejoindre(ident: Identite): void {
    const existant = this.joueurs.get(ident.id);
    if (existant) {
      existant.connecte = true;
      existant.avatar = ident.avatar;
      return;
    }
    if (this.joueurs.size >= ROULETTE_PLACES) return; // spectateur
    this.joueurs.set(ident.id, { ...ident, mises: {}, dernier: null, connecte: true });
  }

  protected surPremiereConnexion(): void {
    if (this.phase === "attente") this.ouvrirMises();
  }

  protected quitter(id: string): void {
    const j = this.joueurs.get(id);
    if (!j) return;
    j.connecte = false;
    // Ses mises éventuelles sont jouées normalement ; il quitte la table après le tirage.
    if (Object.keys(j.mises).length === 0) this.joueurs.delete(id);
  }

  protected async surMessage(id: string, msg: RlMessageClient): Promise<void> {
    const j = this.joueurs.get(id);
    if (!j) throw new ErreurJeu("La table est complète : vous regardez la partie.");
    if (this.phase !== "mises") throw new ErreurJeu("Les jeux sont faits, attendez le prochain tour.");
    if (msg.t === "annuler") {
      const total = totalMises(j);
      if (total > 0) {
        const solde = await crediter(this.env.DB, j.id, total, "remboursement", "roulette", this.room);
        if (solde !== null) j.solde = solde;
      }
      j.mises = {};
      return;
    }
    if (msg.t !== "miser") throw new ErreurJeu("Action inconnue.");
    const def = definitionMise(msg.cle);
    if (!def) throw new ErreurJeu("Mise inconnue.");
    const { min, max } = this.config!;
    if (!Number.isInteger(msg.montant) || msg.montant < min)
      throw new ErreurJeu(`Mise minimum : ${formatJetons(min)} jetons par case.`);
    if (totalMises(j) + msg.montant > max) throw new ErreurJeu(`Maximum ${formatJetons(max)} jetons par tour.`);
    const solde = await debiter(this.env.DB, j.id, msg.montant, "roulette", this.room);
    if (solde === null) throw new ErreurJeu("Solde insuffisant pour cette mise.");
    j.solde = solde;
    j.mises[msg.cle] = (j.mises[msg.cle] ?? 0) + msg.montant;
  }

  private ouvrirMises(): void {
    this.phase = "mises";
    this.resultat = null;
    this.echeance = Date.now() + DUREE_MISES_MS;
    this.remarque = auHasard([null, null, "Faites vos jeux.", "Le croupier lustre la bille. Prenez votre temps."]);
    this.planifier(DUREE_MISES_MS, () => this.lancer());
  }

  private lancer(): void {
    this.phase = "tirage";
    this.resultat = aleatoire(37);
    this.echeance = Date.now() + DUREE_TIRAGE_MS;
    this.remarque = "Rien ne va plus.";
    this.planifier(DUREE_TIRAGE_MS, () => this.regler());
  }

  private async regler(): Promise<void> {
    const n = this.resultat!;
    let meilleur: { pseudo: string; gain: number } | null = null;
    for (const j of this.joueurs.values()) {
      const total = totalMises(j);
      if (total === 0) {
        j.dernier = null;
        continue;
      }
      let rendu = 0;
      for (const [cle, montant] of Object.entries(j.mises)) rendu += rendreMise(cle, montant, n);
      if (rendu > 0) {
        const solde = await crediter(this.env.DB, j.id, rendu, "gain", "roulette", this.room);
        if (solde !== null) j.solde = solde;
      }
      await enregistrerResultat(this.env.DB, j.id, "roulette", total, rendu);
      j.dernier = { mise: total, rendu };
      j.mises = {};
      if (rendu - total > 0 && (!meilleur || rendu - total > meilleur.gain)) meilleur = { pseudo: j.pseudo, gain: rendu - total };
    }
    for (const [id, j] of this.joueurs) if (!j.connecte) this.joueurs.delete(id);

    this.historique = [n, ...this.historique].slice(0, HISTORIQUE);
    if (n === 0) this.remarque = "Zéro. La maison s'excuse platement.";
    else if (meilleur && meilleur.gain >= 3_000) this.remarque = `${meilleur.pseudo} rafle ${formatJetons(meilleur.gain)} jetons. Le croupier note le nom… pour l'admirer.`;
    else if (meilleur) this.remarque = `${meilleur.pseudo} a le nez fin.`;
    else this.remarque = null;

    this.phase = "resultats";
    this.echeance = Date.now() + DUREE_RESULTATS_MS;
    this.planifier(DUREE_RESULTATS_MS, () => {
      if (this.nbConnexions() > 0) this.ouvrirMises();
      else {
        this.phase = "attente";
        this.echeance = null;
      }
    });
  }

  protected etat(): RlEtat {
    const assis = [...this.joueurs.values()];
    return {
      jeu: "roulette",
      code: this.config?.code ?? null,
      nom: this.config?.nom ?? "Roulette",
      hoteId: this.config?.hoteId ?? null,
      phase: this.phase,
      limites: { min: this.config?.min ?? 0, max: this.config?.max ?? 0 },
      joueurs: assis,
      spectateurs: Math.max(0, this.idsConnectes().size - assis.filter((j) => j.connecte).length),
      echeance: this.echeance,
      resultat: this.phase === "mises" ? null : this.resultat,
      historique: this.historique,
      remarque: this.remarque,
    };
  }
}

function totalMises(j: RlJoueur): number {
  return Object.values(j.mises).reduce((a, b) => a + b, 0);
}
