import { useEffect, useState } from "react";
import {
  type Evenement,
  MODELES,
  NOMS_JEUX,
  NOMS_TYPES,
  type JeuEvenement,
  type Params,
  type ParamsBoost,
  type ParamsCalendrier,
  type ParamsClassement,
  type ParamsObjectif,
  type TypeEvenement,
  validerParams,
  type Visibilite,
} from "../../shared/evenements";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { useSession } from "../session";
import { restant } from "./Evenements";

// Gestion des événements dans l'espace Admin. Un événement naît en brouillon (invisible) ; « Test »
// le rend visible et actif pour les admins seulement ; « En ligne » l'ouvre à tous les joueurs.

type Ligne = Evenement & { participants: number; cadeaux: number };

const VISIBILITES: { id: Visibilite; nom: string }[] = [
  { id: "brouillon", nom: "Brouillon" },
  { id: "admins", nom: "Test (admins)" },
  { id: "tous", nom: "En ligne" },
];
const JEUX = Object.keys(NOMS_JEUX) as JeuEvenement[];

/** Date locale (heure de l'appareil, donc de Paris pour l'équipe) ⇄ champ datetime-local. */
const versChamp = (ms: number) => {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const depuisChamp = (v: string) => new Date(v).getTime();
const dateCourte = (ms: number) => new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const listeNombres = (texte: string) => texte.split(/[\s,;]+/).filter(Boolean).map((x) => Math.trunc(Number(x)));

interface Brouillon {
  id: number | null;
  type: TypeEvenement;
  titre: string;
  description: string;
  debut: string;
  fin: string;
  visibilite: Visibilite;
  notifier: boolean;
  params: Params;
  liste: string; // récompenses du classement ou du calendrier, en texte
}

function depuisModele(i: number): Brouillon {
  const m = MODELES[i];
  const debut = new Date();
  debut.setMinutes(0, 0, 0);
  debut.setHours(debut.getHours() + 1);
  const p = m.params as Partial<ParamsClassement & ParamsCalendrier>;
  return {
    id: null, type: m.type, titre: m.titre, description: m.description,
    debut: versChamp(debut.getTime()), fin: versChamp(debut.getTime() + m.dureeHeures * 3600_000),
    visibilite: "brouillon", notifier: false, params: m.params, liste: (p.recompenses ?? []).join(", "),
  };
}

function depuisEvenement(e: Evenement): Brouillon {
  const p = e.params as Partial<ParamsClassement & ParamsCalendrier>;
  return {
    id: e.id, type: e.type, titre: e.titre, description: e.description, debut: versChamp(e.debut), fin: versChamp(e.fin),
    visibilite: e.visibilite, notifier: e.notifier, params: e.params, liste: (p.recompenses ?? []).join(", "),
  };
}

function paramsFinaux(b: Brouillon): Params {
  if (b.type === "classement" || b.type === "calendrier") return { ...(b.params as object), recompenses: listeNombres(b.liste) } as Params;
  return b.params;
}

function resume(e: Evenement): string {
  const p = e.params;
  switch (e.type) {
    case "boost": {
      const b = p as ParamsBoost;
      return [b.multDefis > 1 && `défis ×${b.multDefis}`, b.multBonus > 1 && `bonus ×${b.multBonus}`].filter(Boolean).join(", ");
    }
    case "objectif": {
      const o = p as ParamsObjectif;
      return `${formatJetons(o.cible)} ${o.mesure === "parties" ? "parties" : "jetons misés"} (${NOMS_JEUX[o.jeu]}) → ${formatJetons(o.recompense)} chacun`;
    }
    case "classement": {
      const c = p as ParamsClassement;
      return `${c.mesure === "gains" ? "gains nets" : "parties"} (${NOMS_JEUX[c.jeu]}) · ${c.recompenses.length} récompense(s)`;
    }
    case "calendrier":
      return `${(p as ParamsCalendrier).recompenses.length} cases · ${formatJetons((p as ParamsCalendrier).recompenses.reduce((a, x) => a + x, 0))} jetons au total`;
  }
}

export function AdminEvenements({ apres }: { apres: () => void }) {
  const { notifier, rafraichir } = useSession();
  const [liste, setListe] = useState<Ligne[] | null>(null);
  const [edition, setEdition] = useState<Brouillon | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const charger = () => void api<{ evenements: Ligne[] }>("/admin/evenements").then((r) => setListe(r.evenements));
  useEffect(charger, []);

  const apresChangement = () => {
    charger();
    apres();
    void rafraichir(); // le bandeau et le lobby de l'admin suivent
  };

  const enregistrer = async () => {
    if (!edition) return;
    const params = paramsFinaux(edition);
    const erreur = validerParams(edition.type, params);
    if (erreur) return notifier(erreur, true);
    setEnvoi(true);
    try {
      const corps = {
        type: edition.type, titre: edition.titre, description: edition.description,
        debut: depuisChamp(edition.debut), fin: depuisChamp(edition.fin), visibilite: edition.visibilite, notifier: edition.notifier, params,
      };
      if (edition.id) await api(`/admin/evenements/${edition.id}`, { methode: "PUT", corps });
      else await api("/admin/evenements", { corps });
      notifier(edition.visibilite === "tous" ? "Événement enregistré et en ligne." : "Événement enregistré (invisible pour les joueurs).");
      setEdition(null);
      apresChangement();
    } catch (e) {
      notifier((e as Error).message, true);
    } finally {
      setEnvoi(false);
    }
  };

  const changerVisibilite = async (e: Ligne, v: Visibilite) => {
    if (v === "tous" && !confirm(`Mettre « ${e.titre} » en ligne pour tous les joueurs ?`)) return;
    try {
      await api(`/admin/evenements/${e.id}/visibilite`, { corps: { visibilite: v } });
      notifier(v === "tous" ? "En ligne pour tous les joueurs." : v === "admins" ? "Visible des admins seulement (test)." : "Repassé en brouillon : invisible.");
      apresChangement();
    } catch (err) {
      notifier((err as Error).message, true);
    }
  };
  const supprimer = async (e: Ligne) => {
    if (!confirm(`Supprimer « ${e.titre} » ?`)) return;
    try {
      await api(`/admin/evenements/${e.id}`, { methode: "DELETE" });
      apresChangement();
    } catch (err) {
      notifier((err as Error).message, true);
    }
  };
  const cloturer = async (e: Ligne) => {
    if (!confirm(`Terminer « ${e.titre} » maintenant et distribuer les récompenses du classement ?`)) return;
    try {
      const r = await api<{ gagnants: number }>(`/admin/evenements/${e.id}/cloturer`, { corps: {} });
      notifier(`Classement clôturé : ${r.gagnants} joueur(s) récompensé(s).`);
      apresChangement();
    } catch (err) {
      notifier((err as Error).message, true);
    }
  };

  const maintenant = Date.now();
  const p = edition?.params as Partial<ParamsBoost & ParamsObjectif & ParamsClassement> | undefined;
  const majParams = (x: Partial<ParamsBoost & ParamsObjectif & ParamsClassement>) => edition && setEdition({ ...edition, params: { ...(edition.params as object), ...x } as Params });

  return (
    <section className="carte-ui encart admin-evenements">
      <div className="rangee" style={{ justifyContent: "space-between", gap: 10 }}>
        <h2 className="surtitre">Événements</h2>
        <div className="rangee" style={{ gap: 6 }}>
          {MODELES.map((m, i) => (
            <button key={m.nom} type="button" className="btn btn-petit" onClick={() => setEdition(depuisModele(i))}>+ {m.nom}</button>
          ))}
        </div>
      </div>
      <p className="muet" style={{ fontSize: 13, margin: 0 }}>
        <b>Brouillon</b> : invisible. <b>Test</b> : visible et actif pour les admins seulement, pour vérifier. <b>En ligne</b> : tous les
        joueurs. Les classements éclairs distribuent leurs récompenses automatiquement à la fin.
      </p>

      {liste && liste.length === 0 && !edition && <p className="muet" style={{ fontSize: 13, margin: 0 }}>Aucun événement pour l'instant. Partez d'un modèle ci-dessus.</p>}
      {liste?.map((e) => {
        const etat = maintenant < e.debut ? `commence dans ${restant(e.debut - maintenant)}` : maintenant < e.fin ? `en cours · encore ${restant(e.fin - maintenant)}` : "terminé";
        return (
          <div key={e.id} className={`ligne-evenement vis-${e.visibilite}`}>
            <div className="pile" style={{ gap: 2, minWidth: 0, flex: "1 1 260px" }}>
              <strong>{e.titre} <span className="muet" style={{ fontWeight: 400 }}>· {NOMS_TYPES[e.type]}</span></strong>
              <span className="muet" style={{ fontSize: 12 }}>
                {dateCourte(e.debut)} → {dateCourte(e.fin)} · {etat} · {resume(e)} · {e.participants + e.cadeaux} participation(s)
                {e.cloture ? " · récompenses distribuées" : ""}
              </span>
            </div>
            <div className="onglets petits" role="group" aria-label={`Visibilité de ${e.titre}`}>
              {VISIBILITES.map((v) => (
                <button key={v.id} type="button" aria-pressed={e.visibilite === v.id} onClick={() => e.visibilite !== v.id && void changerVisibilite(e, v.id)}>{v.nom}</button>
              ))}
            </div>
            <div className="rangee" style={{ gap: 6 }}>
              {!e.cloture && <button type="button" className="btn btn-petit" onClick={() => setEdition(depuisEvenement(e))}>Modifier</button>}
              {e.type === "classement" && !e.cloture && e.visibilite !== "brouillon" && maintenant >= e.debut && (
                <button type="button" className="btn btn-petit" onClick={() => void cloturer(e)}>Clôturer</button>
              )}
              {e.participants + e.cadeaux === 0 && <button type="button" className="btn btn-petit" onClick={() => void supprimer(e)}>Supprimer</button>}
            </div>
          </div>
        );
      })}

      {edition && p && (
        <div className="form-evenement">
          <h3 style={{ fontSize: 20 }}>{edition.id ? "Modifier l'événement" : "Nouvel événement"}</h3>
          <div className="rangee" style={{ gap: 10 }}>
            <label className="champ" style={{ flex: "1 1 180px" }}>
              <span>Type</span>
              <select className="input" value={edition.type} disabled={!!edition.id} onChange={(ev) => {
                const i = MODELES.findIndex((m) => m.type === ev.target.value);
                setEdition({ ...depuisModele(i), titre: edition.titre, description: edition.description, debut: edition.debut, fin: edition.fin });
              }}>
                {(Object.keys(NOMS_TYPES) as TypeEvenement[]).map((t) => <option key={t} value={t}>{NOMS_TYPES[t]}</option>)}
              </select>
            </label>
            <label className="champ" style={{ flex: "2 1 240px" }}>
              <span>Titre</span>
              <input className="input" value={edition.titre} maxLength={60} onChange={(ev) => setEdition({ ...edition, titre: ev.target.value })} />
            </label>
          </div>
          <label className="champ">
            <span>Description (affichée aux joueurs et dans la notification)</span>
            <input className="input" value={edition.description} maxLength={300} onChange={(ev) => setEdition({ ...edition, description: ev.target.value })} />
          </label>
          <div className="rangee" style={{ gap: 10 }}>
            <label className="champ" style={{ flex: "1 1 200px" }}>
              <span>Début</span>
              <input className="input" type="datetime-local" value={edition.debut} onChange={(ev) => setEdition({ ...edition, debut: ev.target.value })} />
            </label>
            <label className="champ" style={{ flex: "1 1 200px" }}>
              <span>Fin</span>
              <input className="input" type="datetime-local" value={edition.fin} onChange={(ev) => setEdition({ ...edition, fin: ev.target.value })} />
            </label>
          </div>

          {edition.type === "boost" && (
            <div className="rangee" style={{ gap: 10 }}>
              <label className="champ" style={{ flex: "1 1 160px" }}>
                <span>Récompenses des défis ×</span>
                <input className="input" type="number" min={1} max={5} step={0.5} value={p.multDefis ?? 1} onChange={(ev) => majParams({ multDefis: Number(ev.target.value) })} />
              </label>
              <label className="champ" style={{ flex: "1 1 160px" }}>
                <span>Bonus quotidien ×</span>
                <input className="input" type="number" min={1} max={5} step={0.5} value={p.multBonus ?? 1} onChange={(ev) => majParams({ multBonus: Number(ev.target.value) })} />
              </label>
            </div>
          )}
          {(edition.type === "objectif" || edition.type === "classement") && (
            <div className="rangee" style={{ gap: 10 }}>
              <label className="champ" style={{ flex: "1 1 160px" }}>
                <span>Ce qui compte</span>
                <select className="input" value={p.mesure} onChange={(ev) => majParams({ mesure: ev.target.value as "parties" })}>
                  <option value="parties">Parties jouées</option>
                  {edition.type === "objectif" ? <option value="mises">Jetons misés</option> : <option value="gains">Gains nets</option>}
                </select>
              </label>
              <label className="champ" style={{ flex: "1 1 160px" }}>
                <span>Jeu</span>
                <select className="input" value={p.jeu} onChange={(ev) => majParams({ jeu: ev.target.value as JeuEvenement })}>
                  {JEUX.map((j) => <option key={j} value={j}>{NOMS_JEUX[j]}</option>)}
                </select>
              </label>
              {edition.type === "objectif" && (
                <>
                  <label className="champ" style={{ flex: "1 1 140px" }}>
                    <span>Cible collective</span>
                    <input className="input" inputMode="numeric" value={p.cible ?? 0} onChange={(ev) => majParams({ cible: Math.trunc(Number(ev.target.value.replace(/\D/g, ""))) })} />
                  </label>
                  <label className="champ" style={{ flex: "1 1 140px" }}>
                    <span>Récompense par participant</span>
                    <input className="input" inputMode="numeric" value={p.recompense ?? 0} onChange={(ev) => majParams({ recompense: Math.trunc(Number(ev.target.value.replace(/\D/g, ""))) })} />
                  </label>
                </>
              )}
            </div>
          )}
          {(edition.type === "classement" || edition.type === "calendrier") && (
            <label className="champ">
              <span>
                {edition.type === "classement"
                  ? "Récompenses par place (1re, 2e, 3e…), séparées par des virgules"
                  : `Jetons de chaque case, jour par jour (${listeNombres(edition.liste).length} case(s) ; l'événement dure ${Math.max(0, Math.ceil((depuisChamp(edition.fin) - depuisChamp(edition.debut)) / 86_400_000))} jour(s))`}
              </span>
              <input className="input" value={edition.liste} onChange={(ev) => setEdition({ ...edition, liste: ev.target.value })} />
            </label>
          )}

          <div className="rangee" style={{ gap: 14, alignItems: "center" }}>
            <label className="champ" style={{ flex: "0 1 220px" }}>
              <span>Visibilité</span>
              <select className="input" value={edition.visibilite} onChange={(ev) => setEdition({ ...edition, visibilite: ev.target.value as Visibilite })}>
                {VISIBILITES.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
              </select>
            </label>
            <label className="case" style={{ flex: "1 1 240px" }}>
              <input type="checkbox" checked={edition.notifier} onChange={(ev) => setEdition({ ...edition, notifier: ev.target.checked })} />
              <span>Envoyer une notification au démarrage (seulement quand il est en ligne)</span>
            </label>
          </div>
          <div className="rangee" style={{ gap: 8 }}>
            <button type="button" className="btn btn-principal" disabled={envoi} onClick={() => void enregistrer()}>{envoi ? "Enregistrement…" : "Enregistrer"}</button>
            <button type="button" className="btn" onClick={() => setEdition(null)}>Annuler</button>
          </div>
        </div>
      )}
    </section>
  );
}
