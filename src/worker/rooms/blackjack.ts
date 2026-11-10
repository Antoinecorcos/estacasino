import {
  croupierDoitTirer,
  estBlackjack,
  estBust,
  NB_JEUX,
  peutDoubler,
  peutSeparer,
  reglerMain,
  SEUIL_REMELANGE,
  valeurMain,
} from "../../shared/blackjack";
import { type Carte, nouveauSabot, valeurRang } from "../../shared/cartes";
import type { BjAction, BjEtat, BjJoueur, BjMain, BjMessageClient, BjPhase } from "../../shared/protocole";
import { BLACKJACK_PLACES, formatJetons } from "../../shared/regles";
import { aleatoire } from "../crypto";
import { crediter, debiter, enregistrerResultat } from "../economie";
import { progresserDefis } from "../defis";
import { auHasard, dormir, ErreurJeu, type Identite, RoomBase } from "./base";

const DELAI_MISES_MS = 12_000; // room : temps laissé aux autres pour miser après la première mise
const DELAI_TOUR_MS = 20_000; // temps pour jouer une main avant « rester » automatique
const PAUSE_CARTE_MS = 1_100; // rythme des cartes du croupier (le temps de suivre chaque carte)
const PAUSE_RETOURNE_MS = 900; // après avoir retourné sa carte cachée

export class BlackjackRoom extends RoomBase<BjEtat, BjMessageClient> {
  private phase: BjPhase = "attente";
  private donne = 0;
  private joueurs = new Map<string, BjJoueur>();
  private sabot: Carte[] = [];
  private croupier: Carte[] = [];
  private carteCachee = true;
  private tour: { joueurId: string; main: number } | null = null;
  private echeance: number | null = null;
  private remarque: string | null = null;

  protected nomJeu() {
    return "blackjack" as const;
  }

  private get room(): string | null {
    return this.config?.solo ? "solo" : (this.config?.code ?? null);
  }

  // ───────── Arrivées et départs ─────────

  protected rejoindre(ident: Identite): void {
    const existant = this.joueurs.get(ident.id);
    if (existant) {
      existant.connecte = true;
      existant.avatar = ident.avatar;
      if (this.phase === "attente") existant.solde = ident.solde;
      return;
    }
    if (this.joueurs.size >= BLACKJACK_PLACES) return; // spectateur
    const prises = new Set([...this.joueurs.values()].map((j) => j.place));
    let place = 0;
    while (prises.has(place)) place++;
    this.joueurs.set(ident.id, { ...ident, place, mise: 0, mains: [], connecte: true });
  }

  protected async quitter(id: string): Promise<void> {
    const j = this.joueurs.get(id);
    if (!j) return;
    j.connecte = false;
    if (this.phase === "attente" || this.phase === "mises") {
      await this.rembourserMise(j);
      this.joueurs.delete(id);
      this.verifierDepartAnticipe();
    } else if (this.phase === "jeu" && this.tour?.joueurId === id) {
      // Joueur parti pendant son tour : il reste sur toutes ses mains.
      for (const m of j.mains) m.terminee = true;
      await this.tourSuivant();
    }
  }

  // ───────── Messages ─────────

  protected async surMessage(id: string, msg: BjMessageClient): Promise<void> {
    const j = this.joueurs.get(id);
    if (!j) throw new ErreurJeu("La table est complète : vous regardez la partie.");
    switch (msg.t) {
      case "miser":
        return this.miser(j, msg.montant);
      case "distribuer":
        if (!this.config?.solo) throw new ErreurJeu("La donne démarre automatiquement.");
        if (j.mise <= 0) throw new ErreurJeu("Posez d'abord une mise.");
        return this.donner();
      case "action":
        return this.agir(j, msg.action);
    }
  }

  private async miser(j: BjJoueur, montant: number): Promise<void> {
    if (this.phase !== "attente" && this.phase !== "mises") throw new ErreurJeu("Attendez la prochaine donne.");
    const { min, max } = this.config!;
    if (!Number.isInteger(montant) || montant < 0) throw new ErreurJeu("Mise invalide.");
    if (montant > 0 && (montant < min || montant > max))
      throw new ErreurJeu(`La mise doit être entre ${formatJetons(min)} et ${formatJetons(max)}.`);
    await this.rembourserMise(j);
    if (montant > 0) {
      const solde = await debiter(this.env.DB, j.id, montant, "blackjack", this.room);
      if (solde === null) throw new ErreurJeu("Solde insuffisant pour cette mise.");
      await this.enJeu(j.id, montant);
      j.solde = solde;
      j.mise = montant;
    }
    if (this.config!.solo) {
      this.phase = j.mise > 0 ? "mises" : "attente";
      return;
    }
    if (this.phase === "attente" && j.mise > 0) {
      this.phase = "mises";
      this.echeance = Date.now() + DELAI_MISES_MS;
      this.planifier(DELAI_MISES_MS, () => this.donner());
    }
    this.verifierDepartAnticipe();
  }

  /** Room : si tous les joueurs assis ont misé, inutile d'attendre la fin du compte à rebours. */
  private verifierDepartAnticipe(): void {
    if (this.config?.solo || this.phase !== "mises") return;
    const assis = [...this.joueurs.values()];
    if (assis.length > 0 && assis.every((x) => x.mise > 0)) this.planifier(800, () => this.donner());
    if (!assis.some((x) => x.mise > 0)) {
      this.annulerMinuteur();
      this.phase = "attente";
      this.echeance = null;
    }
  }

  private async rembourserMise(j: BjJoueur): Promise<void> {
    if (j.mise <= 0) return;
    const solde = await crediter(this.env.DB, j.id, j.mise, "remboursement", "blackjack", this.room);
    await this.enJeu(j.id, -j.mise);
    if (solde !== null) j.solde = solde;
    j.mise = 0;
  }

  // ───────── Donne ─────────

  private tirer(): Carte {
    if (this.sabot.length === 0) this.sabot = nouveauSabot(NB_JEUX, aleatoire);
    return this.sabot.pop()!;
  }

  private ordre(): BjJoueur[] {
    return [...this.joueurs.values()].filter((j) => j.mains.length > 0).sort((a, b) => a.place - b.place);
  }

  private async donner(): Promise<void> {
    if (this.phase !== "mises" && this.phase !== "attente") return;
    const participants = [...this.joueurs.values()].filter((j) => j.mise > 0);
    if (participants.length === 0) return;
    this.annulerMinuteur();

    this.remarque = null;
    if (this.sabot.length < SEUIL_REMELANGE) {
      this.sabot = nouveauSabot(NB_JEUX, aleatoire);
      this.remarque = "Le croupier mélange un nouveau sabot. Avec élégance, évidemment.";
    }
    this.donne++;
    for (const j of this.joueurs.values()) j.mains = [];
    for (const j of participants) {
      j.mains = [{ cartes: [], mise: j.mise, separee: false, doublee: false, terminee: false }];
      j.mise = 0;
    }
    this.croupier = [];
    this.carteCachee = true;
    const ordre = this.ordre();
    for (let tour = 0; tour < 2; tour++) {
      for (const j of ordre) j.mains[0].cartes.push(this.tirer());
      this.croupier.push(this.tirer());
    }

    // Le croupier vérifie son blackjack quand sa carte visible est un As ou vaut 10.
    const visible = valeurRang(this.croupier[0].r);
    if ((visible === 1 || visible === 10) && estBlackjack(this.croupier, false)) {
      this.carteCachee = false;
      this.remarque = "Blackjack de la maison. Toutes nos excuses… ou presque.";
      for (const j of ordre) j.mains[0].terminee = true;
      return this.regler();
    }
    for (const j of ordre) if (estBlackjack(j.mains[0].cartes, false)) j.mains[0].terminee = true;
    this.phase = "jeu";
    this.tour = null;
    await this.tourSuivant();
  }

  /** Passe à la prochaine main à jouer, ou au croupier s'il n'y en a plus. */
  private async tourSuivant(): Promise<void> {
    for (const j of this.ordre()) {
      const idx = j.mains.findIndex((m) => !m.terminee);
      if (idx === -1) continue;
      if (!j.connecte) {
        for (const m of j.mains) m.terminee = true;
        continue;
      }
      this.tour = { joueurId: j.id, main: idx };
      this.echeance = Date.now() + DELAI_TOUR_MS;
      this.planifier(DELAI_TOUR_MS, async () => {
        const main = j.mains[idx];
        if (main && !main.terminee) main.terminee = true;
        await this.tourSuivant();
      });
      return;
    }
    this.tour = null;
    await this.jouerCroupier();
  }

  private async agir(j: BjJoueur, action: BjAction): Promise<void> {
    if (this.phase !== "jeu" || this.tour?.joueurId !== j.id) throw new ErreurJeu("Ce n'est pas votre tour.");
    const main = j.mains[this.tour.main];
    switch (action) {
      case "tirer": {
        main.cartes.push(this.tirer());
        const total = valeurMain(main.cartes).total;
        if (total >= 21) main.terminee = true;
        if (total > 21) this.remarque = auHasard([`${j.pseudo}, ${total}. Ça arrive aux meilleurs.`, "Le croupier compatit. En silence.", `${total}. Le croupier n'a rien dit. Mais il l'a pensé très fort.`]);
        break;
      }
      case "rester":
        main.terminee = true;
        break;
      case "doubler": {
        if (!peutDoubler(main.cartes)) throw new ErreurJeu("On ne double que sur les deux premières cartes.");
        const solde = await debiter(this.env.DB, j.id, main.mise, "blackjack", this.room);
        if (solde === null) throw new ErreurJeu("Solde insuffisant pour doubler.");
        await this.enJeu(j.id, main.mise);
        j.solde = solde;
        main.mise *= 2;
        main.doublee = true;
        main.cartes.push(this.tirer());
        main.terminee = true;
        break;
      }
      case "separer": {
        if (j.mains.length > 1 || !peutSeparer(main.cartes, main.separee))
          throw new ErreurJeu("Séparation possible une seule fois, avec deux cartes de même valeur.");
        const solde = await debiter(this.env.DB, j.id, main.mise, "blackjack", this.room);
        if (solde === null) throw new ErreurJeu("Solde insuffisant pour séparer.");
        await this.enJeu(j.id, main.mise);
        j.solde = solde;
        const [a, b] = main.cartes;
        const asSepares = a.r === "A";
        const m1: BjMain = { cartes: [a, this.tirer()], mise: main.mise, separee: true, doublee: false, terminee: asSepares };
        const m2: BjMain = { cartes: [b, this.tirer()], mise: main.mise, separee: true, doublee: false, terminee: asSepares };
        for (const m of [m1, m2]) if (valeurMain(m.cartes).total === 21) m.terminee = true;
        j.mains = [m1, m2];
        break;
      }
      default:
        throw new ErreurJeu("Action inconnue.");
    }
    if (j.mains[this.tour.main]?.terminee) await this.tourSuivant();
    else {
      this.echeance = Date.now() + DELAI_TOUR_MS;
      const idx = this.tour.main;
      this.planifier(DELAI_TOUR_MS, async () => {
        j.mains[idx].terminee = true;
        await this.tourSuivant();
      });
    }
  }

  private async jouerCroupier(): Promise<void> {
    this.annulerMinuteur();
    this.phase = "croupier";
    this.echeance = null;
    this.carteCachee = false;
    this.diffuser();
    // Le croupier ne tire que s'il reste au moins une main « vivante » (ni bust, ni blackjack).
    const vivantes = this.ordre().some((j) => j.mains.some((m) => !estBust(m.cartes) && !estBlackjack(m.cartes, m.separee)));
    // Rythme d'une vraie table : la carte cachée se retourne, puis chaque carte arrive l'une après l'autre.
    await dormir(PAUSE_RETOURNE_MS);
    if (vivantes) {
      while (croupierDoitTirer(this.croupier)) {
        this.croupier.push(this.tirer());
        this.diffuser();
        await dormir(PAUSE_CARTE_MS);
      }
    }
    await this.regler();
  }

  private async regler(): Promise<void> {
    this.annulerMinuteur();
    let bjJoueur: string | null = null;
    const participants = this.ordre().length;
    let gagnants = 0;
    let perdants = 0;
    for (const j of this.ordre()) {
      for (const m of j.mains) {
        const { issue, rendu } = reglerMain(m.cartes, m.mise, m.separee, this.croupier);
        m.issue = issue;
        m.rendu = rendu;
        m.terminee = true;
        if (rendu > 0) {
          const solde = await crediter(this.env.DB, j.id, rendu, "gain", "blackjack", this.room);
          if (solde !== null) j.solde = solde;
        }
        await enregistrerResultat(this.env.DB, j.id, "blackjack", m.mise, rendu);
        if (issue === "blackjack") bjJoueur = j.pseudo;
        if (rendu > m.mise) gagnants++;
        if (rendu === 0) perdants++;
      }
      const recharge = await this.solderEnJeu(j.id);
      if (recharge !== null) j.solde = recharge;
      await this.defisApresMain(j, participants);
    }
    if (!this.remarque || this.phase === "jeu" || this.phase === "croupier") {
      const vc = valeurMain(this.croupier).total;
      if (bjJoueur) this.remarque = `Blackjack pour ${bjJoueur}. Le croupier fait semblant de ne pas être vexé.`;
      else if (vc > 21) this.remarque = "Le croupier saute. Il dira que c'était voulu.";
      else if (estBlackjack(this.croupier, false)) this.remarque = "Blackjack de la maison. Toutes nos excuses… ou presque.";
      else if (gagnants > 0 && perdants === 0) this.remarque = "La maison salue votre élégance.";
      else if (gagnants === 0 && perdants > 0) this.remarque = "La maison vous remercie pour votre générosité fictive.";
      else this.remarque = "Les comptes sont faits. On remet ça ?";
    }
    this.tour = null;
    this.echeance = null;
    // Les cartes restent visibles jusqu'à la donne suivante ; les absents quittent la table.
    for (const [id, j] of this.joueurs) if (!j.connecte) this.joueurs.delete(id);
    this.phase = "attente";
  }

  /** Défis quotidiens : une erreur ici ne doit jamais bloquer la table. */
  private async defisApresMain(j: BjJoueur, participants: number): Promise<void> {
    try {
      const reussis = await progresserDefis(this.env.DB, j.id, {
        main_bj: j.mains.length,
        gain_bj: j.mains.filter((m) => (m.rendu ?? 0) > m.mise).length,
        blackjack: j.mains.filter((m) => m.issue === "blackjack").length,
        double_gagne: j.mains.filter((m) => m.doublee && (m.rendu ?? 0) > m.mise).length,
        room: !this.config?.solo && participants >= 2 ? 1 : 0,
      });
      this.annoncerDefis(j.id, reussis);
    } catch (e) {
      console.error("défis", e);
    }
  }

  protected pseudoDe(id: string): string | null {
    return this.joueurs.get(id)?.pseudo ?? null;
  }

  // ───────── État public ─────────

  protected etat(): BjEtat {
    return {
      jeu: "blackjack",
      code: this.config?.code ?? null,
      solo: this.config?.solo ?? false,
      hoteId: this.config?.hoteId ?? null,
      theme: this.config?.theme ?? null,
      phase: this.phase,
      donne: this.donne,
      limites: { min: this.config?.min ?? 0, max: this.config?.max ?? 0 },
      joueurs: [...this.joueurs.values()].sort((a, b) => a.place - b.place),
      spectateurs: Math.max(0, this.idsConnectes().size - [...this.joueurs.values()].filter((j) => j.connecte).length),
      croupier: this.croupier.map((c, i) => (i === 1 && this.carteCachee ? null : c)),
      tour: this.tour,
      echeance: this.echeance,
      remarque: this.remarque,
    };
  }
}
