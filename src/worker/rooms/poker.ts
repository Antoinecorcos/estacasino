import { type Carte, nouveauSabot } from "../../shared/cartes";
import { calculerPots, libelleProvisoire, meilleureMain, partagerPots } from "../../shared/poker";
import type { PkAction, PkEtat, PkJoueur, PkMessageClient, PkPhase } from "../../shared/protocole";
import {
  CAVE_MAX_GB,
  CAVE_MIN_GB,
  ENTREES_SNG,
  formatJetons,
  NIVEAUX_POKER,
  POKER_DELAI_ACTION_MS,
  POKER_PLACES,
  POKER_RESERVE_MS,
  repartitionSng,
  SNG_BLINDES,
  SNG_DUREE_NIVEAU_MS,
  SNG_TAPIS,
} from "../../shared/regles";
import { aleatoire } from "../crypto";
import { crediter, debiter, enregistrerPoker } from "../economie";
import { auHasard, dormir, ErreurJeu, type Identite, RoomBase } from "./base";

// Poker Texas Hold'em no-limit, de 2 à 6 joueurs humains.
//  - Partie libre (cash) : on s'assoit avec une cave prise sur son solde et on repart avec son tapis.
//  - Sit & Go (sng) : entrée payée en jetons, tapis de tournoi, blindes qui montent, 1er et 2e payés.
// Toute la logique et toutes les cartes sont ici, côté serveur ; chaque joueur ne reçoit que ses propres cartes.

const PAUSE_ENTRE_MAINS_MS = 2_500;
const DUREE_ABATTAGE_MS = 6_000;
const PAUSE_RUE_AUTO_MS = 1_400; // tapis : les cartes restantes sont dévoilées une à une
const DELAI_ABSENT_MS = 4_000; // joueur déconnecté : il passe ou se couche vite
const SNG_ATTENTE_DEPART_MS = 90_000; // table publique : départ avec 3 joueurs après cette attente

interface Siege {
  id: string;
  pseudo: string;
  avatar: PkJoueur["avatar"];
  place: number;
  tapis: number;
  tapisDebutMain: number;
  mise: number;
  engage: number;
  couche: boolean;
  tapisTout: boolean;
  enMain: boolean;
  aAgi: boolean;
  cartes: Carte[];
  revele: boolean;
  action: string | null;
  connecte: boolean;
  gain: number;
  combinaison: string | null;
  meilleures: Carte[];
  reserve: number;
  /** Horodatage du début d'utilisation de la réserve (null si elle ne court pas). */
  reserveDebut: number | null;
  rang: number | null;
  partant: boolean;
}

export class PokerRoom extends RoomBase<PkEtat, PkMessageClient> {
  private sieges = new Map<string, Siege>();
  private phase: PkPhase = "attente";
  private donne = 0;
  private bouton: number | null = null;
  private paquet: Carte[] = [];
  private board: Carte[] = [];
  private miseCourante = 0;
  private relance = 0; // taille de la dernière relance complète
  private tour: string | null = null;
  private echeance: number | null = null;
  private remarque: string | null = null;
  private potsPrecedents = 0;
  // Sit & Go
  private demarre = false;
  private niveauSng = 0;
  private prochainNiveau: number | null = null;
  private classement: { pseudo: string; place: number; gain: number }[] = [];
  private participants = 0;
  private departPrevu: number | null = null;
  private minuteurDepart: ReturnType<typeof setTimeout> | null = null;

  protected nomJeu() {
    return "poker" as const;
  }

  private get mode(): "cash" | "sng" {
    return this.config?.poker?.mode ?? "cash";
  }
  private get room(): string {
    return this.config?.code ?? this.config?.poker?.publique ?? "poker";
  }
  private get blindes(): { petite: number; grosse: number } {
    if (this.mode === "sng") {
      const [petite, grosse] = SNG_BLINDES[Math.min(this.niveauSng, SNG_BLINDES.length - 1)];
      return { petite, grosse };
    }
    const n = NIVEAUX_POKER.find((x) => x.id === this.config?.poker?.niveau) ?? NIVEAUX_POKER[0];
    return { petite: n.petite, grosse: n.grosse };
  }
  private get entree(): number {
    return ENTREES_SNG.find((x) => x.id === this.config?.poker?.niveau)?.entree ?? ENTREES_SNG[0].entree;
  }

  // ───────── Arrivées et départs ─────────

  protected rejoindre(ident: Identite): void {
    const s = this.sieges.get(ident.id);
    if (s) {
      s.connecte = true;
      s.avatar = ident.avatar;
    }
    // Sinon : spectateur jusqu'à ce qu'il s'asseye.
  }

  protected async quitter(id: string): Promise<void> {
    const s = this.sieges.get(id);
    if (!s) return;
    s.connecte = false;
    if (this.mode === "cash" && !s.enMain) await this.lever(s);
    else if (this.mode === "sng" && !this.demarre) await this.desinscrire(s);
    else if (this.tour === id) this.planifier(DELAI_ABSENT_MS, () => this.actionAuto(id));
  }

  protected pseudoDe(id: string): string | null {
    return this.sieges.get(id)?.pseudo ?? null;
  }

  // ───────── Messages ─────────

  protected async surMessage(id: string, msg: PkMessageClient): Promise<void> {
    switch (msg.t) {
      case "asseoir":
        return this.asseoir(id, msg.cave);
      case "quitter": {
        const s = this.sieges.get(id);
        if (!s) return;
        if (this.mode === "sng") {
          if (!this.demarre) return this.desinscrire(s);
          throw new ErreurJeu("Le tournoi est lancé : vos jetons restent en jeu jusqu'à la fin.");
        }
        if (s.enMain && !s.couche && this.enCours()) {
          s.partant = true;
          if (this.tour === id) return this.appliquer(s, "coucher");
          // Ce n'est pas son tour : il se couche sans prendre la parole à celui qui l'a.
          s.couche = true;
          s.action = "Couché";
          if (this.actifs().length <= 1) return this.finDeMain();
          return;
        }
        return this.lever(s);
      }
      case "action": {
        const s = this.sieges.get(id);
        if (!s || this.tour !== id) throw new ErreurJeu("Ce n'est pas à vous de parler.");
        return this.appliquer(s, msg.action, msg.montant);
      }
      case "montrer": {
        const s = this.sieges.get(id);
        if (!s || this.phase !== "abattage" || !s.enMain || s.revele) return;
        s.revele = true;
        s.combinaison = this.board.length >= 3 ? meilleureMain([...s.cartes, ...this.board]).libelle : libelleProvisoire(s.cartes);
        return;
      }
      case "demarrer":
        if (this.mode !== "sng" || this.demarre) return;
        if (this.phase === "termine") return this.reinitialiserSng();
        if (id !== this.config?.hoteId) throw new ErreurJeu("Seul l'hôte peut lancer le tournoi.");
        if (this.sieges.size < 2) throw new ErreurJeu("Il faut au moins 2 joueurs.");
        return this.demarrerSng();
    }
  }

  private placeLibre(): number | null {
    const prises = new Set([...this.sieges.values()].map((s) => s.place));
    for (let p = 0; p < POKER_PLACES; p++) if (!prises.has(p)) return p;
    return null;
  }

  private nouveauSiege(ident: { id: string; pseudo: string; avatar: PkJoueur["avatar"] }, place: number, tapis: number): Siege {
    return {
      ...ident, place, tapis, tapisDebutMain: tapis, mise: 0, engage: 0, couche: false, tapisTout: false, enMain: false, aAgi: false,
      cartes: [], revele: false, action: null, connecte: true, gain: 0, combinaison: null, meilleures: [], reserve: POKER_RESERVE_MS, reserveDebut: null, rang: null, partant: false,
    };
  }

  private async asseoir(id: string, cave?: number): Promise<void> {
    if (this.sieges.has(id)) throw new ErreurJeu("Vous êtes déjà assis.");
    const place = this.placeLibre();
    if (place === null) throw new ErreurJeu("La table est complète.");
    const ident = await this.env.DB.prepare("SELECT pseudo, avatar FROM joueurs WHERE id = ?").bind(id).first<{ pseudo: string; avatar: string }>();
    if (!ident) throw new ErreurJeu("Joueur introuvable.");
    const avatar = JSON.parse(ident.avatar) as PkJoueur["avatar"];

    if (this.mode === "cash") {
      const { grosse } = this.blindes;
      const min = CAVE_MIN_GB * grosse;
      const max = CAVE_MAX_GB * grosse;
      const montant = Math.trunc(cave ?? max);
      if (!(montant >= min && montant <= max)) throw new ErreurJeu(`Cave entre ${formatJetons(min)} et ${formatJetons(max)} jetons.`);
      const solde = await debiter(this.env.DB, id, montant, "poker", this.room, "cave");
      if (solde === null) throw new ErreurJeu("Solde insuffisant pour cette cave.");
      await this.fixerEnJeu(id, montant);
      this.sieges.set(id, this.nouveauSiege({ id, pseudo: ident.pseudo, avatar }, place, montant));
      this.remarque = `${ident.pseudo} prend place. Le croupier ajuste sa cravate.`;
      await this.majRegistre();
      if (this.phase === "attente") this.planifierMain();
      return;
    }
    // Sit & Go : inscription
    if (this.demarre || this.phase === "termine") throw new ErreurJeu("Le tournoi a déjà commencé.");
    const solde = await debiter(this.env.DB, id, this.entree, "poker", this.room, "cave");
    if (solde === null) throw new ErreurJeu("Solde insuffisant pour l'entrée.");
    await this.enJeu(id, this.entree);
    this.sieges.set(id, this.nouveauSiege({ id, pseudo: ident.pseudo, avatar }, place, SNG_TAPIS));
    await this.majRegistre();
    if (this.config?.poker?.publique) {
      if (this.sieges.size >= POKER_PLACES) return this.demarrerSng();
      if (this.sieges.size >= 3 && !this.minuteurDepart) {
        this.departPrevu = Date.now() + SNG_ATTENTE_DEPART_MS;
        this.minuteurDepart = setTimeout(() => this.enFile(async () => {
          this.minuteurDepart = null;
          if (!this.demarre && this.sieges.size >= 3) await this.demarrerSng();
          this.diffuser();
        }), SNG_ATTENTE_DEPART_MS);
      }
    }
  }

  /** Partie libre : le joueur quitte la table avec son tapis. */
  private async lever(s: Siege): Promise<void> {
    if (s.tapis > 0) await crediter(this.env.DB, s.id, s.tapis, "retrait", "poker", this.room);
    await this.solderEnJeu(s.id);
    this.sieges.delete(s.id);
    await this.majRegistre();
  }

  private async desinscrire(s: Siege): Promise<void> {
    await crediter(this.env.DB, s.id, this.entree, "remboursement", "poker", this.room);
    await this.solderEnJeu(s.id);
    this.sieges.delete(s.id);
    if (this.sieges.size < 3 && this.minuteurDepart) {
      clearTimeout(this.minuteurDepart);
      this.minuteurDepart = null;
      this.departPrevu = null;
    }
    await this.majRegistre();
  }

  /** Registre des tables publiques (nombre de joueurs, statut). */
  private async majRegistre(): Promise<void> {
    const nom = this.config?.poker?.publique;
    if (!nom) return;
    const statut = this.mode === "cash" ? "ouverte" : this.phase === "termine" ? "termine" : this.demarre ? "en_cours" : "inscription";
    await this.env.DB.prepare("UPDATE poker_tables SET joueurs = ?, statut = ?, maj = ? WHERE nom = ?").bind(this.sieges.size, statut, Date.now(), nom).run();
  }

  // ───────── Sit & Go ─────────

  private async demarrerSng(): Promise<void> {
    if (this.minuteurDepart) clearTimeout(this.minuteurDepart);
    this.minuteurDepart = null;
    this.departPrevu = null;
    this.demarre = true;
    this.participants = this.sieges.size;
    this.niveauSng = 0;
    this.prochainNiveau = Date.now() + SNG_DUREE_NIVEAU_MS;
    this.classement = [];
    this.remarque = `Le tournoi commence : ${this.participants} joueurs, ${formatJetons(this.entree * this.participants)} jetons à se partager.`;
    await this.majRegistre();
    this.planifierMain(1_500);
  }

  private async terminerSng(gagnant: Siege): Promise<void> {
    const prix = repartitionSng(this.participants).map((p) => Math.floor(p * this.entree * this.participants));
    gagnant.rang = 1;
    const tous = [...this.sieges.values()];
    for (const s of tous) {
      const gain = s.rang && s.rang <= prix.length ? prix[s.rang - 1] : 0;
      if (gain > 0) await crediter(this.env.DB, s.id, gain, "gain", "poker", this.room);
      await enregistrerPoker(this.env.DB, s.id, gain - this.entree);
      await this.solderEnJeu(s.id);
      this.classement.push({ pseudo: s.pseudo, place: s.rang ?? tous.length, gain });
    }
    this.classement.sort((a, b) => a.place - b.place);
    this.phase = "termine";
    this.tour = null;
    this.echeance = null;
    this.remarque = `${gagnant.pseudo} remporte le tournoi. Le croupier s'incline.`;
    await this.majRegistre();
    if (this.config?.poker?.publique) this.planifier(20_000, () => this.reinitialiserSng());
  }

  private async reinitialiserSng(): Promise<void> {
    this.sieges.clear();
    this.demarre = false;
    this.phase = "attente";
    this.classement = [];
    this.board = [];
    this.bouton = null;
    this.remarque = null;
    await this.majRegistre();
  }

  // ───────── Déroulé d'une main ─────────

  private enCours(): boolean {
    return this.phase === "preflop" || this.phase === "flop" || this.phase === "turn" || this.phase === "river";
  }

  private planifierMain(delai = PAUSE_ENTRE_MAINS_MS): void {
    this.planifier(delai, () => this.nouvelleMain());
  }

  private ordre(): Siege[] {
    return [...this.sieges.values()].sort((a, b) => a.place - b.place);
  }

  /** Prochain siège (dans le sens des aiguilles d'une montre) après `place` qui vérifie `filtre`. */
  private suivant(place: number, filtre: (s: Siege) => boolean): Siege | null {
    const o = this.ordre();
    for (let k = 1; k <= POKER_PLACES; k++) {
      const s = o.find((x) => x.place === (place + k) % POKER_PLACES);
      if (s && filtre(s)) return s;
    }
    return null;
  }

  private async nouvelleMain(): Promise<void> {
    if (this.enCours()) return;
    // Sit & Go : montée des blindes.
    if (this.mode === "sng" && this.prochainNiveau && Date.now() >= this.prochainNiveau && this.niveauSng < SNG_BLINDES.length - 1) {
      this.niveauSng++;
      this.prochainNiveau = Date.now() + SNG_DUREE_NIVEAU_MS;
      const { petite, grosse } = this.blindes;
      this.remarque = `Les blindes montent : ${formatJetons(petite)} / ${formatJetons(grosse)}.`;
    }
    const joueurs = this.ordre().filter((s) => s.tapis > 0 && !s.partant && (this.mode === "sng" || s.connecte));
    if (joueurs.length < 2 || (this.mode === "sng" && !this.demarre)) {
      this.phase = "attente";
      this.tour = null;
      this.echeance = null;
      return;
    }
    this.donne++;
    this.paquet = nouveauSabot(1, aleatoire);
    this.board = [];
    this.potsPrecedents = 0;
    this.miseCourante = 0;
    for (const s of this.sieges.values()) {
      Object.assign(s, { mise: 0, engage: 0, couche: false, tapisTout: false, enMain: false, aAgi: false, cartes: [], revele: false, action: null, gain: 0, combinaison: null, meilleures: [], reserve: POKER_RESERVE_MS, reserveDebut: null });
      s.tapisDebutMain = s.tapis;
    }
    for (const s of joueurs) s.enMain = true;

    const enMain = (s: Siege) => s.enMain;
    this.bouton = (this.bouton === null ? joueurs[0] : this.suivant(this.bouton, enMain) ?? joueurs[0]).place;
    const teteATete = joueurs.length === 2;
    const petiteB = teteATete ? this.sieges.get(joueurs.find((s) => s.place === this.bouton)!.id)! : this.suivant(this.bouton, enMain)!;
    const grosseB = this.suivant(petiteB.place, enMain)!;
    const { petite, grosse } = this.blindes;
    this.poster(petiteB, petite);
    petiteB.action = "Petite blinde";
    this.poster(grosseB, grosse);
    grosseB.action = "Grosse blinde";
    this.miseCourante = grosse;
    this.relance = grosse;
    for (let tour = 0; tour < 2; tour++) for (const s of joueurs) s.cartes.push(this.paquet.pop()!);
    this.phase = "preflop";
    if (this.remarque?.startsWith("Les blindes montent") !== true && this.donne % 5 === 0) {
      this.remarque = auHasard(["Le croupier mélange avec la grâce d'un pianiste.", "Nouvelle donne. Visages impassibles, s'il vous plaît.", null]);
    }
    const premier = this.suivant(grosseB.place, (s) => s.enMain && !s.couche && !s.tapisTout);
    await this.donnerLaParole(premier);
  }

  private poster(s: Siege, montant: number): number {
    const m = Math.min(montant, s.tapis);
    s.tapis -= m;
    s.mise += m;
    s.engage += m;
    if (s.tapis === 0) s.tapisTout = true;
    return m;
  }

  private actifs(): Siege[] {
    return this.ordre().filter((s) => s.enMain && !s.couche);
  }

  /** Donne la parole au joueur, ou passe à la suite si personne ne peut plus parler. */
  private async donnerLaParole(s: Siege | null): Promise<void> {
    if (!s || this.rueTerminee()) return this.finDeRue();
    this.tour = s.id;
    s.reserveDebut = null;
    this.echeance = Date.now() + (s.connecte ? POKER_DELAI_ACTION_MS : DELAI_ABSENT_MS);
    this.planifier(this.echeance - Date.now(), () => this.delaiEcoule(s.id));
  }

  private delaiEcoule(id: string): Promise<void> | void {
    const s = this.sieges.get(id);
    if (!s || this.tour !== id) return;
    // Délai écoulé : la réserve de réflexion (30 s par main) prend le relais, si le joueur est là.
    if (s.reserveDebut === null && s.connecte && s.reserve > 0) {
      s.reserveDebut = Date.now();
      this.echeance = Date.now() + s.reserve;
      this.planifier(s.reserve, () => {
        s.reserve = 0;
        s.reserveDebut = null;
        return this.actionAuto(id);
      });
      return;
    }
    return this.actionAuto(id);
  }

  private actionAuto(id: string): Promise<void> | void {
    const s = this.sieges.get(id);
    if (!s || this.tour !== id) return;
    return this.appliquer(s, s.mise >= this.miseCourante ? "parole" : "coucher");
  }

  private async appliquer(s: Siege, action: PkAction, montant?: number): Promise<void> {
    if (!this.enCours() || this.tour !== s.id) throw new ErreurJeu("Ce n'est pas à vous de parler.");
    // Réserve entamée : on décompte le temps utilisé.
    if (s.reserveDebut !== null) {
      s.reserve = Math.max(0, s.reserve - (Date.now() - s.reserveDebut));
      s.reserveDebut = null;
    }

    const aSuivre = this.miseCourante - s.mise;
    switch (action) {
      case "coucher":
        s.couche = true;
        s.action = "Couché";
        break;
      case "parole":
        if (aSuivre > 0) throw new ErreurJeu(`Il faut suivre ${formatJetons(aSuivre)} ou se coucher.`);
        s.action = "Parole";
        break;
      case "suivre": {
        if (aSuivre <= 0) {
          s.action = "Parole";
          break;
        }
        const m = this.poster(s, aSuivre);
        s.action = s.tapisTout ? `Tapis ${formatJetons(s.engage)}` : `Suit ${formatJetons(m)}`;
        break;
      }
      case "relancer": {
        const max = s.mise + s.tapis; // tapis : tout ce que le joueur a
        const cible = Math.min(Math.trunc(montant ?? 0), max);
        const minimum = this.miseCourante === 0 ? this.blindes.grosse : this.miseCourante + this.relance;
        if (cible <= this.miseCourante) throw new ErreurJeu("Relance trop faible.");
        if (cible < minimum && cible < max) throw new ErreurJeu(`Relance minimum : ${formatJetons(minimum)}.`);
        const ouverture = this.miseCourante === 0;
        const taille = cible - this.miseCourante;
        this.poster(s, cible - s.mise);
        if (taille >= this.relance) {
          // Relance complète : tout le monde doit reparler.
          this.relance = taille;
          for (const x of this.sieges.values()) if (x !== s) x.aAgi = false;
        }
        this.miseCourante = cible;
        s.action = s.tapisTout ? `Tapis ${formatJetons(cible)}` : ouverture ? `Mise ${formatJetons(cible)}` : `Relance à ${formatJetons(cible)}`;
        break;
      }
      default:
        throw new ErreurJeu("Action inconnue.");
    }
    s.aAgi = true;
    await this.verifierFinDeRue(s);
  }

  /** La rue est finie quand chaque joueur encore capable de parler a parlé et égalisé. */
  private rueTerminee(): boolean {
    const actifs = this.actifs();
    if (actifs.length <= 1) return true;
    const parlants = actifs.filter((s) => !s.tapisTout);
    if (parlants.length === 0) return true;
    // Seul à pouvoir parler face à des tapis : s'il a égalisé, il n'y a plus rien à décider.
    if (parlants.length === 1) return parlants[0].mise >= this.miseCourante;
    return parlants.every((s) => s.aAgi && s.mise === this.miseCourante);
  }

  private async verifierFinDeRue(dernier?: Siege): Promise<void> {
    if (this.actifs().length <= 1) return this.finDeMain();
    if (this.rueTerminee()) return this.finDeRue();
    const depuis = dernier?.place ?? this.ordre().find((s) => s.id === this.tour)?.place ?? this.bouton ?? 0;
    const prochain = this.suivant(depuis, (s) => s.enMain && !s.couche && !s.tapisTout && (!s.aAgi || s.mise < this.miseCourante));
    await this.donnerLaParole(prochain);
  }

  private async finDeRue(): Promise<void> {
    this.annulerMinuteur();
    this.tour = null;
    this.echeance = null;
    if (this.actifs().length <= 1) return this.finDeMain();
    for (const s of this.sieges.values()) {
      this.potsPrecedents += s.mise;
      s.mise = 0;
      s.aAgi = false;
      if (s.enMain && !s.couche && !s.tapisTout) s.action = null;
    }
    this.miseCourante = 0;
    this.relance = this.blindes.grosse;
    if (this.phase === "river") return this.finDeMain();
    const suite: Record<string, [PkPhase, number]> = { preflop: ["flop", 3], flop: ["turn", 1], turn: ["river", 1] };
    const [phase, n] = suite[this.phase];
    this.phase = phase;
    for (let i = 0; i < n; i++) this.board.push(this.paquet.pop()!);
    const parlants = this.actifs().filter((s) => !s.tapisTout);
    if (parlants.length <= 1) {
      // Tout le monde (ou presque) à tapis : on dévoile la suite, carte après carte.
      this.diffuser();
      await dormir(PAUSE_RUE_AUTO_MS);
      return this.finDeRue();
    }
    const premier = this.suivant(this.bouton ?? 0, (s) => s.enMain && !s.couche && !s.tapisTout);
    await this.donnerLaParole(premier);
  }

  private async finDeMain(): Promise<void> {
    this.annulerMinuteur();
    this.tour = null;
    for (const s of this.sieges.values()) {
      this.potsPrecedents += s.mise;
      s.mise = 0;
    }
    const actifs = this.actifs();
    const engagements = this.ordre().filter((s) => s.engage > 0).map((s) => ({ id: s.id, engage: s.engage, couche: s.couche || !s.enMain }));
    const pots = calculerPots(engagements);
    const ordreBouton: string[] = [];
    let p = this.bouton ?? 0;
    for (let k = 0; k < POKER_PLACES; k++) {
      p = (p + 1) % POKER_PLACES;
      const s = this.ordre().find((x) => x.place === p);
      if (s) ordreBouton.push(s.id);
    }
    const scores = new Map<string, number>();
    const abattage = actifs.length > 1;
    if (abattage) {
      while (this.board.length < 5) this.board.push(this.paquet.pop()!);
      for (const s of actifs) {
        const e = meilleureMain([...s.cartes, ...this.board]);
        scores.set(s.id, e.score);
        s.combinaison = e.libelle;
        s.meilleures = e.cartes;
      }
    } else if (actifs[0]) scores.set(actifs[0].id, 1);
    const gains = partagerPots(pots, scores, ordreBouton);
    let meilleur: Siege | null = null;
    for (const [id, g] of gains) {
      const s = this.sieges.get(id)!;
      s.tapis += g;
      s.gain = g;
      if (abattage) s.revele = true; // le gagnant montre forcément ses cartes
      if (!meilleur || g > meilleur.gain) meilleur = s;
    }
    // À l'abattage, seuls les gagnants sont montrés d'office : les perdants choisissent de montrer ou non.

    if (meilleur) {
      const total = pots.reduce((a, x) => a + x.montant, 0);
      this.remarque = abattage
        ? `${meilleur.pseudo} remporte ${formatJetons(meilleur.gain)} avec ${(meilleur.combinaison ?? "").replace(/^./, (c) => c.toLowerCase())}.`
        : `${meilleur.pseudo} ramasse ${formatJetons(total)} sans abattage. Personne n'a voulu voir.`;
    }

    // Partie libre : statistiques poker et jetons en jeu mis à jour main par main.
    if (this.mode === "cash") {
      for (const s of this.ordre()) {
        if (!s.cartes.length) continue;
        await enregistrerPoker(this.env.DB, s.id, s.tapis - s.tapisDebutMain);
        await this.fixerEnJeu(s.id, s.tapis);
      }
    }
    this.phase = "abattage";
    this.echeance = Date.now() + DUREE_ABATTAGE_MS;
    this.planifier(DUREE_ABATTAGE_MS, () => this.apresMain());
  }

  private async apresMain(): Promise<void> {
    if (this.mode === "cash") {
      for (const s of this.ordre()) {
        if (s.partant || !s.connecte || s.tapis === 0) {
          if (s.tapis === 0) this.remarque = `${s.pseudo} quitte la table, le portefeuille léger.`;
          await this.lever(s);
        }
      }
    } else {
      // Sit & Go : éliminations, du plus petit tapis de départ au plus grand.
      const restants = this.ordre().filter((s) => s.tapis > 0);
      const elimines = this.ordre().filter((s) => s.tapis === 0 && s.rang === null).sort((a, b) => a.tapisDebutMain - b.tapisDebutMain);
      let rang = restants.length + elimines.length;
      for (const s of elimines) s.rang = rang--;
      if (elimines.length) this.remarque = `${elimines.map((s) => s.pseudo).join(", ")} ${elimines.length > 1 ? "quittent" : "quitte"} le tournoi.`;
      if (restants.length === 1) return this.terminerSng(restants[0]);
    }
    for (const s of this.sieges.values()) {
      s.cartes = [];
      s.action = null;
      s.gain = 0;
      s.combinaison = null;
      s.meilleures = [];
      s.enMain = false;
      s.revele = false;
    }
    this.board = [];
    this.potsPrecedents = 0;
    this.phase = "attente";
    this.echeance = null;
    await this.majRegistre();
    this.planifierMain(800);
  }

  // ───────── État ─────────

  private versJoueur(s: Siege, pour: string | null): PkJoueur {
    const visibles = s.id === pour || s.revele;
    return {
      id: s.id,
      pseudo: s.pseudo,
      avatar: s.avatar,
      place: s.place,
      tapis: s.tapis,
      mise: s.mise,
      couche: s.couche,
      tapisTout: s.tapisTout,
      enMain: s.enMain,
      cartes: s.cartes.map((c) => (visibles ? c : null)),
      action: s.action,
      connecte: s.connecte,
      gain: s.gain,
      combinaison: s.revele ? s.combinaison : null,
      meilleures: s.revele ? s.meilleures : [],
      reserve: s.reserve,
      rang: s.rang,
      partant: s.partant,
    };
  }

  protected etatPour(id: string): PkEtat {
    const e = this.etat();
    e.joueurs = this.ordre().map((s) => this.versJoueur(s, id));
    return e;
  }

  protected etat(): PkEtat {
    const { petite, grosse } = this.blindes;
    const mises = [...this.sieges.values()].reduce((a, s) => a + s.mise, 0);
    const spectateurs = Math.max(0, this.idsConnectes().size - [...this.sieges.values()].filter((s) => s.connecte).length);
    return {
      jeu: "poker",
      mode: this.mode,
      code: this.config?.code ?? null,
      nom: this.config?.nom ?? "Poker",
      hoteId: this.config?.hoteId ?? null,
      theme: this.config?.theme ?? null,
      phase: this.phase,
      donne: this.donne,
      blindes: { petite, grosse },
      cave: this.mode === "cash" ? { min: CAVE_MIN_GB * grosse, max: CAVE_MAX_GB * grosse } : null,
      joueurs: this.ordre().map((s) => this.versJoueur(s, null)),
      spectateurs,
      board: this.board,
      pot: this.potsPrecedents + mises,
      bouton: this.bouton,
      tour: this.tour,
      echeance: this.echeance,
      miseCourante: this.miseCourante,
      relanceMin: this.miseCourante === 0 ? grosse : this.miseCourante + this.relance,
      sng:
        this.mode === "sng"
          ? {
              entree: this.entree,
              prix: repartitionSng(Math.max(this.participants, this.sieges.size)).map((x) => Math.floor(x * this.entree * Math.max(this.participants, this.sieges.size))),
              demarre: this.demarre,
              niveau: this.niveauSng,
              prochainNiveau: this.prochainNiveau,
              classement: this.classement,
              depart: this.departPrevu,
            }
          : null,
      remarque: this.remarque,
    };
  }
}
