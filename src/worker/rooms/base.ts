import { DurableObject } from "cloudflare:workers";
import type { ConfigAvatar } from "../../shared/avatar";
import type { MessageServeur } from "../../shared/protocole";
import { ROOM_VIDE_FERMETURE_MS } from "../../shared/regles";
import type { Env } from "../env";

// Base commune des rooms (blackjack et roulette). Chaque room est un Durable Object unique :
// il détient l'état de la partie, les connexions WebSocket, et fait tous les tirages.

export interface ConfigRoom {
  code: string | null; // null : table solo ou Grande Roue
  solo: boolean;
  hoteId: string | null;
  nom: string;
  /** Thème de table imposé (room : celui de l'hôte). null = chacun voit le sien. */
  theme: string | null;
  min: number;
  max: number;
}

export interface Identite {
  id: string;
  pseudo: string;
  avatar: ConfigAvatar;
  solde: number;
}

export const ENTETE_IDENTITE = "X-Esta-Identite";
export const ENTETE_CONFIG = "X-Esta-Config";

export const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function auHasard<T>(liste: T[]): T {
  return liste[Math.floor(Math.random() * liste.length)];
}

export abstract class RoomBase<Etat, MessageClient> extends DurableObject<Env> {
  protected config: ConfigRoom | null = null;
  private sockets = new Map<WebSocket, string>();
  private file: Promise<void> = Promise.resolve();
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  /** Le joueur arrive (ou revient). Retourne false s'il n'y a plus de place : il devient spectateur. */
  protected abstract rejoindre(ident: Identite): Promise<void> | void;
  /** Le joueur n'a plus aucune connexion ouverte. */
  protected abstract quitter(id: string): Promise<void> | void;
  protected abstract surMessage(id: string, msg: MessageClient): Promise<void>;
  protected abstract etat(): Etat;
  /** Appelé quand le premier joueur arrive dans une room vide (ex. relancer la roue). */
  protected surPremiereConnexion(): void {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("WebSocket attendu", { status: 426 });
    const ident = JSON.parse(decodeURIComponent(req.headers.get(ENTETE_IDENTITE) ?? "")) as Identite;
    const config = JSON.parse(decodeURIComponent(req.headers.get(ENTETE_CONFIG) ?? "")) as ConfigRoom;
    if (!this.config) this.config = config;

    const paire = new WebSocketPair();
    const [client, serveur] = [paire[0], paire[1]];
    serveur.accept();

    const etaitVide = this.sockets.size === 0;
    this.sockets.set(serveur, ident.id);
    await this.ctx.storage.deleteAlarm();

    serveur.addEventListener("message", (ev) => {
      let msg: MessageClient;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as MessageClient;
      } catch {
        return;
      }
      this.enFile(async () => {
        try {
          await this.surMessage(ident.id, msg);
        } catch (e) {
          if (!(e instanceof ErreurJeu)) console.error("room", e);
          this.erreur(serveur, e instanceof ErreurJeu ? e.message : "Erreur inattendue, réessayez.");
        }
        this.diffuser();
      });
    });
    const depart = () => this.enFile(() => this.depart(serveur));
    serveur.addEventListener("close", depart);
    serveur.addEventListener("error", depart);

    this.enFile(async () => {
      await this.rejoindre(ident);
      if (etaitVide) this.surPremiereConnexion();
      this.diffuser();
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async depart(ws: WebSocket): Promise<void> {
    const id = this.sockets.get(ws);
    if (id === undefined) return;
    this.sockets.delete(ws);
    if (!this.estConnecte(id)) await this.quitter(id);
    this.diffuser();
    if (this.sockets.size === 0) await this.ctx.storage.setAlarm(Date.now() + ROOM_VIDE_FERMETURE_MS);
  }

  /** Room vide depuis 15 minutes : on la ferme. */
  async alarm(): Promise<void> {
    if (this.sockets.size > 0) return;
    const code = this.config?.code;
    if (code) await this.env.DB.prepare("UPDATE rooms SET ouverte = 0 WHERE code = ?").bind(code).run();
  }

  /** Toutes les actions (messages, minuteurs, départs) passent par une file : jamais deux à la fois. */
  protected enFile(tache: () => Promise<void> | void): void {
    this.file = this.file.then(tache).catch((e) => console.error("room", e));
  }

  /** Un seul minuteur actif à la fois ; en replanifier un annule le précédent. */
  protected planifier(ms: number, tache: () => Promise<void> | void): void {
    this.annulerMinuteur();
    const gen = this.generation;
    this.minuteur = setTimeout(() => {
      this.enFile(async () => {
        if (gen !== this.generation) return;
        this.minuteur = null;
        await tache();
        this.diffuser();
      });
    }, ms);
  }

  protected annulerMinuteur(): void {
    this.generation++;
    if (this.minuteur) clearTimeout(this.minuteur);
    this.minuteur = null;
  }

  protected estConnecte(id: string): boolean {
    for (const v of this.sockets.values()) if (v === id) return true;
    return false;
  }

  protected nbConnexions(): number {
    return this.sockets.size;
  }

  protected idsConnectes(): Set<string> {
    return new Set(this.sockets.values());
  }

  protected diffuser(): void {
    const etat = this.etat();
    for (const [ws, id] of this.sockets) {
      const msg: MessageServeur<Etat> = { t: "etat", etat, moi: id };
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* connexion déjà fermée */
      }
    }
  }

  protected erreur(ws: WebSocket, message: string): void {
    const msg: MessageServeur<Etat> = { t: "erreur", message };
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* ignoré */
    }
  }

  /** Envoie une erreur à toutes les connexions d'un joueur. */
  protected erreurPour(id: string, message: string): void {
    for (const [ws, v] of this.sockets) if (v === id) this.erreur(ws, message);
  }
}

export class ErreurJeu extends Error {}
