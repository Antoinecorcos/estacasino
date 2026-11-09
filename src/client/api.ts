import type { ConfigAvatar } from "../shared/avatar";

export class ErreurApi extends Error {
  constructor(message: string, public statut: number) {
    super(message);
  }
}

export async function api<T>(chemin: string, options: { methode?: string; corps?: unknown } = {}): Promise<T> {
  const rep = await fetch(`/api${chemin}`, {
    method: options.methode ?? (options.corps === undefined ? "GET" : "POST"),
    headers: options.corps === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
    credentials: "same-origin",
  });
  const json = (await rep.json().catch(() => ({}))) as T & { erreur?: string };
  if (!rep.ok) throw new ErreurApi(json.erreur ?? "Une erreur est survenue.", rep.status);
  return json;
}

export interface Moi {
  id: string;
  pseudo: string;
  solde: number;
  avatar: ConfigAvatar;
  role: string;
  theme: string;
  inventaire: string[];
  saison: { nom: string; fin: number; gains: number; parties: number; rang: number | null; minParties: number } | null;
  ligue: { id: string; nom: string; suivante: { id: string; nom: string; seuil: number } | null };
  bonus: { disponible: boolean; montant: number; serie: number };
  filet: { seuil: number; montant: number; disponible: boolean; prochain: number };
}
