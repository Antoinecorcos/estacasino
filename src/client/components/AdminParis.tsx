import { useEffect, useState } from "react";
import { type Choix, type Rencontre, sommeProbabilites, SPORTS, validerRencontre, type VisibiliteParis } from "../../shared/paris";
import { formatJetons } from "../../shared/regles";
import { api } from "../api";
import { useSession } from "../session";

// Paris sportifs dans l'espace Admin : l'interrupteur de l'option, et la saisie des rencontres.

type Ligne = Rencontre & { nb_paris: number; total_mises: number; mises1: number; misesN: number; mises2: number; verse: number };

const VIS: { id: VisibiliteParis; nom: string }[] = [
  { id: "off", nom: "Désactivé" },
  { id: "admins", nom: "Test (admins)" },
  { id: "tous", nom: "Ouvert à tous" },
];
const versChamp = (ms: number) => {
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const nombre = (t: string) => Number(t.replace(",", "."));
const dateCourte = (ms: number) => new Date(ms).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface Saisie {
  id: number | null;
  sport: string;
  competition: string;
  equipe1: string;
  equipe2: string;
  debut: string;
  cote1: string;
  coteN: string;
  cote2: string;
  ouverte: boolean;
}
const vide = (): Saisie => {
  const d = new Date(Date.now() + 2 * 86_400_000);
  d.setHours(21, 0, 0, 0);
  return { id: null, sport: "Football", competition: "", equipe1: "", equipe2: "", debut: versChamp(d.getTime()), cote1: "", coteN: "", cote2: "", ouverte: false };
};

export function AdminParis() {
  const { notifier, rafraichir } = useSession();
  const [donnees, setDonnees] = useState<{ visibilite: VisibiliteParis; rencontres: Ligne[] } | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const charger = () => void api<{ visibilite: VisibiliteParis; rencontres: Ligne[] }>("/admin/paris").then(setDonnees);
  useEffect(charger, []);
  if (!donnees) return null;

  const action = async (chemin: string, corps: unknown, message: string, methode?: string) => {
    try {
      const r = await api<Record<string, number>>(chemin, { corps, methode });
      notifier(message.replace(/\{(\w+)\}/g, (_, k) => formatJetons(r[k] ?? 0)));
      charger();
    } catch (e) {
      notifier((e as Error).message, true);
    }
  };
  const changerVisibilite = async (v: VisibiliteParis) => {
    if (v === "tous" && !confirm("Ouvrir les paris sportifs à tous les joueurs ? Un lien « Paris » apparaîtra dans le menu.")) return;
    await action("/admin/paris/visibilite", { visibilite: v }, v === "off" ? "Paris sportifs désactivés : invisibles pour tous." : v === "admins" ? "Paris sportifs visibles des admins seulement." : "Paris sportifs ouverts à tous.");
    void rafraichir();
  };
  const enregistrer = async () => {
    if (!saisie) return;
    const corps = {
      sport: saisie.sport, competition: saisie.competition, equipe1: saisie.equipe1, equipe2: saisie.equipe2, debut: new Date(saisie.debut).getTime(),
      cote1: nombre(saisie.cote1), coteN: saisie.coteN.trim() ? nombre(saisie.coteN) : null, cote2: nombre(saisie.cote2), ouverte: saisie.ouverte,
    };
    const err = validerRencontre(corps);
    if (err) return notifier(err, true);
    if (saisie.id) await action(`/admin/paris/rencontres/${saisie.id}`, corps, "Rencontre modifiée.", "PUT");
    else await action("/admin/paris/rencontres", corps, saisie.ouverte ? "Rencontre créée, paris ouverts." : "Rencontre créée (brouillon).");
    setSaisie(null);
  };
  const regler = (r: Ligne, c: Choix) => {
    const libelle = c === "1" ? r.equipe1 : c === "2" ? r.equipe2 : "match nul";
    if (confirm(`Résultat : ${libelle} ? Les gagnants seront payés tout de suite (irréversible).`))
      void action(`/admin/paris/rencontres/${r.id}/regler`, { resultat: c }, "Rencontre réglée : {gagnants} gagnant(s), {verse} jetons versés.");
  };

  const marge = saisie && saisie.cote1 && saisie.cote2 ? sommeProbabilites({ cote1: nombre(saisie.cote1), cote2: nombre(saisie.cote2), coteN: saisie.coteN ? nombre(saisie.coteN) : null }) : null;
  const now = Date.now();

  return (
    <section className="carte-ui encart admin-evenements">
      <div className="rangee" style={{ justifyContent: "space-between", gap: 10 }}>
        <h2 className="surtitre">Paris sportifs</h2>
        <div className="onglets petits" role="group" aria-label="Option paris sportifs">
          {VIS.map((v) => (
            <button key={v.id} type="button" aria-pressed={donnees.visibilite === v.id} onClick={() => donnees.visibilite !== v.id && void changerVisibilite(v.id)}>{v.nom}</button>
          ))}
        </div>
      </div>
      <p className="muet" style={{ fontSize: 13, margin: 0 }}>
        {donnees.visibilite === "off"
          ? "Option désactivée : aucun joueur ne voit les paris (pas de lien, pages introuvables). Vous pouvez préparer les rencontres en attendant."
          : donnees.visibilite === "admins"
            ? "Mode test : seuls les admins voient le lien « Paris » et peuvent parier."
            : "Ouvert à tous les joueurs."}{" "}
        Les paris ferment au coup d'envoi ; saisissez le résultat après le match pour payer les gagnants (mise × cote figée).
      </p>

      {donnees.rencontres.map((r) => {
        const commencee = now >= r.debut;
        return (
          <div key={r.id} className={`ligne-evenement vis-${r.statut === "ouverte" ? "tous" : r.statut === "brouillon" ? "brouillon" : "admins"}`}>
            <div className="pile" style={{ gap: 2, minWidth: 0, flex: "1 1 260px" }}>
              <strong>{r.equipe1} – {r.equipe2} <span className="muet" style={{ fontWeight: 400 }}>· {r.sport}{r.competition ? ` · ${r.competition}` : ""}</span></strong>
              <span className="muet" style={{ fontSize: 12 }}>
                {dateCourte(r.debut)} · cotes {r.cote1} / {r.coteN ?? "–"} / {r.cote2} ·{" "}
                {r.statut === "brouillon" ? "brouillon" : r.statut === "ouverte" ? (commencee ? "en cours, paris fermés" : "paris ouverts") : r.statut === "reglee" ? `réglée (${r.resultat})` : "annulée"}
                {" · "}{r.nb_paris} pari(s), {formatJetons(r.total_mises)} misés (1 : {formatJetons(r.mises1)}{r.coteN ? `, N : ${formatJetons(r.misesN)}` : ""}, 2 : {formatJetons(r.mises2)})
                {r.statut === "reglee" ? ` · ${formatJetons(r.verse)} versés` : ""}
              </span>
            </div>
            {(r.statut === "brouillon" || r.statut === "ouverte") && (
              <div className="rangee" style={{ gap: 6 }}>
                {!commencee && (
                  <button type="button" className="btn btn-petit" onClick={() => void action(`/admin/paris/rencontres/${r.id}/statut`, { statut: r.statut === "ouverte" ? "brouillon" : "ouverte" }, r.statut === "ouverte" ? "Paris suspendus (brouillon)." : "Paris ouverts.")}>
                    {r.statut === "ouverte" ? "Suspendre" : "Ouvrir les paris"}
                  </button>
                )}
                <button type="button" className="btn btn-petit" onClick={() => setSaisie({ id: r.id, sport: r.sport, competition: r.competition, equipe1: r.equipe1, equipe2: r.equipe2, debut: versChamp(r.debut), cote1: String(r.cote1), coteN: r.coteN ? String(r.coteN) : "", cote2: String(r.cote2), ouverte: r.statut === "ouverte" })}>Modifier</button>
                {commencee && (
                  <>
                    <span className="muet" style={{ fontSize: 12 }}>Résultat :</span>
                    <button type="button" className="btn btn-petit btn-principal" onClick={() => regler(r, "1")}>{r.equipe1}</button>
                    {r.coteN && <button type="button" className="btn btn-petit btn-principal" onClick={() => regler(r, "N")}>Nul</button>}
                    <button type="button" className="btn btn-petit btn-principal" onClick={() => regler(r, "2")}>{r.equipe2}</button>
                  </>
                )}
                <button type="button" className="btn btn-petit" onClick={() => confirm("Annuler la rencontre et rembourser toutes les mises ?") && void action(`/admin/paris/rencontres/${r.id}/annuler`, {}, "Rencontre annulée : {rembourses} pari(s) remboursé(s).")}>Annuler</button>
                {r.nb_paris === 0 && <button type="button" className="btn btn-petit" onClick={() => void action(`/admin/paris/rencontres/${r.id}`, undefined, "Rencontre supprimée.", "DELETE")}>Supprimer</button>}
              </div>
            )}
          </div>
        );
      })}

      {saisie ? (
        <div className="form-evenement">
          <h3 style={{ fontSize: 20 }}>{saisie.id ? "Modifier la rencontre" : "Nouvelle rencontre"}</h3>
          <div className="rangee" style={{ gap: 10 }}>
            <label className="champ" style={{ flex: "1 1 140px" }}>
              <span>Sport</span>
              <select className="input" value={saisie.sport} onChange={(e) => setSaisie({ ...saisie, sport: e.target.value })}>
                {SPORTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="champ" style={{ flex: "2 1 200px" }}>
              <span>Compétition (facultatif)</span>
              <input className="input" value={saisie.competition} maxLength={60} placeholder="Ligue 1, Champions League…" onChange={(e) => setSaisie({ ...saisie, competition: e.target.value })} />
            </label>
            <label className="champ" style={{ flex: "1 1 200px" }}>
              <span>Coup d'envoi (les paris ferment)</span>
              <input className="input" type="datetime-local" value={saisie.debut} onChange={(e) => setSaisie({ ...saisie, debut: e.target.value })} />
            </label>
          </div>
          <div className="rangee" style={{ gap: 10 }}>
            <label className="champ" style={{ flex: "2 1 180px" }}>
              <span>Équipe 1 (domicile)</span>
              <input className="input" value={saisie.equipe1} maxLength={40} onChange={(e) => setSaisie({ ...saisie, equipe1: e.target.value })} />
            </label>
            <label className="champ" style={{ flex: "2 1 180px" }}>
              <span>Équipe 2 (extérieur)</span>
              <input className="input" value={saisie.equipe2} maxLength={40} onChange={(e) => setSaisie({ ...saisie, equipe2: e.target.value })} />
            </label>
          </div>
          <div className="rangee" style={{ gap: 10 }}>
            <label className="champ" style={{ flex: "1 1 100px" }}>
              <span>Cote 1</span>
              <input className="input" inputMode="decimal" placeholder="1,85" value={saisie.cote1} onChange={(e) => setSaisie({ ...saisie, cote1: e.target.value })} />
            </label>
            <label className="champ" style={{ flex: "1 1 100px" }}>
              <span>Cote N (vide : pas de nul)</span>
              <input className="input" inputMode="decimal" placeholder="3,40" value={saisie.coteN} onChange={(e) => setSaisie({ ...saisie, coteN: e.target.value })} />
            </label>
            <label className="champ" style={{ flex: "1 1 100px" }}>
              <span>Cote 2</span>
              <input className="input" inputMode="decimal" placeholder="4,20" value={saisie.cote2} onChange={(e) => setSaisie({ ...saisie, cote2: e.target.value })} />
            </label>
          </div>
          {marge !== null && Number.isFinite(marge) && (
            <span className="muet" style={{ fontSize: 12 }}>
              Somme des probabilités : {(marge * 100).toFixed(1)} % ·{" "}
              {marge < 1 ? "attention, les cotes sont plus généreuses que le hasard : les parieurs gagnent en moyenne." : `marge de la maison d'environ ${((1 - 1 / marge) * 100).toFixed(1)} %.`}
            </span>
          )}
          {!saisie.id && (
            <label className="case">
              <input type="checkbox" checked={saisie.ouverte} onChange={(e) => setSaisie({ ...saisie, ouverte: e.target.checked })} />
              <span>Ouvrir les paris tout de suite (sinon : brouillon)</span>
            </label>
          )}
          <div className="rangee" style={{ gap: 8 }}>
            <button type="button" className="btn btn-principal" onClick={() => void enregistrer()}>Enregistrer</button>
            <button type="button" className="btn" onClick={() => setSaisie(null)}>Annuler</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-petit" style={{ alignSelf: "flex-start" }} onClick={() => setSaisie(vide())}>+ Nouvelle rencontre</button>
      )}
    </section>
  );
}
