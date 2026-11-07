import { useEffect, useState } from "react";
import type { ConfigAvatar } from "../../shared/avatar";
import { trouverProduit } from "../../shared/boutique";
import { formatJetons, formatPrix } from "../../shared/regles";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Page } from "../components/Elements";
import { useSession } from "../session";

interface Resume {
  joueurs: number;
  inscritsSemaine: number;
  actifsSemaine: number;
  achats: { n: number; total: number };
  jetonsEnCirculation: number;
}
interface LigneJoueur {
  id: string;
  pseudo: string;
  solde: number;
  role: string;
  suspendu: number;
  cree_le: number;
  supprime_le: number | null;
}
interface Fiche {
  joueur: LigneJoueur & { avatar: ConfigAvatar; theme: string; suspendu_motif: string | null; date_naissance: string; bonus_serie: number };
  saison: { nom: string; stats: { gains_nets: number; mains: number } | null } | null;
  transactions: { montant: number; type: string; jeu: string | null; room: string | null; le: number }[];
  achats: { produit: string; montant_centimes: number; stripe_session: string; le: number }[];
  inventaire: { piece: string; origine: string; le: number }[];
  sessionsActives: number;
}
interface Entree {
  action: string;
  details: string | null;
  le: number;
  admin: string;
  joueur: string | null;
}

const date = (ms: number) => new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const LIBELLES_ACTION: Record<string, string> = {
  mot_de_passe_provisoire: "Mot de passe provisoire",
  suspension: "Suspension",
  reactivation: "Réactivation",
};

function statut(j: LigneJoueur): string {
  if (j.supprime_le) return "Supprimé";
  if (j.suspendu) return "Suspendu";
  return j.role === "admin" ? "Admin" : "Actif";
}

export function Admin() {
  const { moi, notifier } = useSession();
  const [resume, setResume] = useState<Resume | null>(null);
  const [q, setQ] = useState("");
  const [liste, setListe] = useState<LigneJoueur[]>([]);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [journal, setJournal] = useState<Entree[]>([]);
  const [provisoire, setProvisoire] = useState<string | null>(null);
  const [motif, setMotif] = useState("");

  const chercher = (texte: string) => void api<{ joueurs: LigneJoueur[] }>(`/admin/joueurs?q=${encodeURIComponent(texte)}`).then((r) => setListe(r.joueurs));
  const ouvrir = (id: string) => {
    setProvisoire(null);
    setMotif("");
    void api<Fiche>(`/admin/joueurs/${id}`).then(setFiche);
  };
  const recharger = () => {
    void api<Resume>("/admin/resume").then(setResume);
    void api<{ journal: Entree[] }>("/admin/journal").then((r) => setJournal(r.journal));
  };

  useEffect(() => {
    if (moi?.role !== "admin") return;
    recharger();
    chercher("");
  }, [moi?.role]);
  useEffect(() => {
    const t = setTimeout(() => chercher(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  if (moi?.role !== "admin") {
    return (
      <Page etroite>
        <h1 style={{ fontSize: 34 }}>Accès réservé</h1>
        <p className="muet">Cette page est réservée à l'équipe Estacasino.</p>
      </Page>
    );
  }

  const motDePasse = async () => {
    if (!fiche || !confirm(`Générer un mot de passe provisoire pour ${fiche.joueur.pseudo} ? Il sera déconnecté partout.`)) return;
    try {
      const r = await api<{ mdp: string }>(`/admin/joueurs/${fiche.joueur.id}/mdp`, { corps: {} });
      setProvisoire(r.mdp);
      recharger();
    } catch (e) {
      notifier((e as Error).message, true);
    }
  };
  const suspendre = async (suspendu: boolean) => {
    if (!fiche) return;
    try {
      await api(`/admin/joueurs/${fiche.joueur.id}/suspendre`, { corps: { suspendu, motif } });
      notifier(suspendu ? "Compte suspendu." : "Compte réactivé.");
      ouvrir(fiche.joueur.id);
      chercher(q);
      recharger();
    } catch (e) {
      notifier((e as Error).message, true);
    }
  };

  const tuiles: [string, string][] = resume
    ? [
        ["Joueurs", formatJetons(resume.joueurs)],
        ["Inscrits (7 j)", formatJetons(resume.inscritsSemaine)],
        ["Actifs (7 j)", formatJetons(resume.actifsSemaine)],
        ["Achats", `${resume.achats.n} · ${formatPrix(resume.achats.total)}`],
        ["Jetons en circulation", formatJetons(resume.jetonsEnCirculation)],
      ]
    : [];

  return (
    <Page>
      <div className="pile" style={{ gap: 24 }}>
        <div className="pile" style={{ gap: 6 }}>
          <div className="surtitre">Administration</div>
          <h1 style={{ fontSize: 40 }}>Coulisses</h1>
        </div>
        <div className="tuiles-admin">
          {tuiles.map(([l, v]) => (
            <div key={l} className="carte-ui tuile-admin">
              <span className="surtitre">{l}</span>
              <b className="num">{v}</b>
            </div>
          ))}
        </div>

        <div className="grille-admin">
          <section className="carte-ui encart">
            <label htmlFor="admin-q" style={{ fontWeight: 600 }}>Chercher un joueur</label>
            <input id="admin-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudo…" autoComplete="off" />
            <div style={{ overflowX: "auto" }}>
              <table className="tableau">
                <thead>
                  <tr>
                    <th scope="col">Pseudo</th>
                    <th scope="col" style={{ textAlign: "right" }}>Solde</th>
                    <th scope="col">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {liste.map((j) => (
                    <tr key={j.id} className={fiche?.joueur.id === j.id ? "moi" : undefined}>
                      <td>
                        <button type="button" className="btn-lien" onClick={() => ouvrir(j.id)}>{j.pseudo}</button>
                      </td>
                      <td className="num" style={{ textAlign: "right" }}>{formatJetons(j.solde)}</td>
                      <td className={j.suspendu || j.supprime_le ? "muet" : undefined}>{statut(j)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {liste.length === 0 && <p className="muet" style={{ padding: 12 }}>Aucun joueur trouvé.</p>}
            </div>
          </section>

          <section className="carte-ui encart">
            {!fiche ? (
              <p className="muet">Choisissez un joueur pour voir sa fiche.</p>
            ) : (
              <div className="pile" style={{ gap: 16 }}>
                <div className="rangee" style={{ gap: 14, flexWrap: "nowrap" }}>
                  <Avatar config={fiche.joueur.avatar} taille={64} />
                  <div className="pile" style={{ gap: 2 }}>
                    <h2 style={{ fontSize: 26 }}>{fiche.joueur.pseudo}</h2>
                    <span className="muet" style={{ fontSize: 13 }}>
                      {statut(fiche.joueur)} · inscrit le {date(fiche.joueur.cree_le)} · né(e) le {fiche.joueur.date_naissance} · {fiche.sessionsActives} session(s) active(s)
                    </span>
                    {fiche.joueur.suspendu_motif && <span className="accent" style={{ fontSize: 13 }}>Motif : {fiche.joueur.suspendu_motif}</span>}
                  </div>
                </div>
                <div className="rangee" style={{ gap: 24 }}>
                  <div className="stat"><span className="surtitre">Solde</span><b>{formatJetons(fiche.joueur.solde)}</b></div>
                  {fiche.saison && (
                    <div className="stat">
                      <span className="surtitre">{fiche.saison.nom}</span>
                      <b>{fiche.saison.stats ? `${formatJetons(fiche.saison.stats.gains_nets)} · ${fiche.saison.stats.mains} partie${fiche.saison.stats.mains > 1 ? "s" : ""}` : "—"}</b>
                    </div>
                  )}
                  <div className="stat"><span className="surtitre">Série bonus</span><b>{fiche.joueur.bonus_serie} j</b></div>
                </div>

                {!fiche.joueur.supprime_le && (
                  <div className="pile" style={{ gap: 10 }}>
                    <div className="rangee" style={{ gap: 8 }}>
                      <button type="button" className="btn btn-petit" onClick={() => void motDePasse()}>Mot de passe provisoire</button>
                      {fiche.joueur.role !== "admin" &&
                        (fiche.joueur.suspendu ? (
                          <button type="button" className="btn btn-petit btn-contour" onClick={() => void suspendre(false)}>Réactiver le compte</button>
                        ) : (
                          <>
                            <input className="input" style={{ height: 36, flex: 1, minWidth: 160 }} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de suspension (visible par le joueur)" aria-label="Motif de suspension" />
                            <button type="button" className="btn btn-petit" onClick={() => void suspendre(true)}>Suspendre</button>
                          </>
                        ))}
                    </div>
                    {provisoire && (
                      <div className="succes">
                        Mot de passe provisoire : <strong className="num" style={{ userSelect: "all" }}>{provisoire}</strong>. Transmettez-le au joueur : il ne sera plus affiché.
                      </div>
                    )}
                  </div>
                )}

                <div className="pile" style={{ gap: 6 }}>
                  <h3 className="surtitre">Achats ({fiche.achats.length})</h3>
                  {fiche.achats.length === 0 ? (
                    <p className="muet" style={{ fontSize: 13 }}>Aucun achat.</p>
                  ) : (
                    fiche.achats.map((a) => (
                      <div key={a.stripe_session} className="ligne-admin">
                        <span>{trouverProduit(a.produit)?.nom ?? a.produit}</span>
                        <span className="num">{formatPrix(a.montant_centimes)}</span>
                        <span className="muet">{date(a.le)}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="pile" style={{ gap: 6 }}>
                  <h3 className="surtitre">Derniers mouvements de jetons</h3>
                  <div className="liste-defilante">
                    {fiche.transactions.map((t, i) => (
                      <div key={i} className="ligne-admin">
                        <span>{t.type}{t.jeu ? ` · ${t.jeu}` : ""}{t.room ? ` · ${t.room}` : ""}</span>
                        <span className="num" style={{ color: t.montant >= 0 ? "var(--accent)" : "var(--carmin-clair)" }}>
                          {t.montant > 0 ? "+" : ""}
                          {formatJetons(t.montant)}
                        </span>
                        <span className="muet">{date(t.le)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="carte-ui encart">
          <h2 className="surtitre">Journal des actions d'administration</h2>
          {journal.length === 0 ? (
            <p className="muet" style={{ fontSize: 13 }}>Aucune action pour l'instant.</p>
          ) : (
            journal.map((e, i) => (
              <div key={i} className="ligne-admin">
                <span>
                  <strong>{e.admin}</strong> · {LIBELLES_ACTION[e.action] ?? e.action}
                  {e.joueur ? ` · ${e.joueur}` : ""}
                  {e.details ? ` · ${(JSON.parse(e.details) as { motif?: string }).motif ?? ""}` : ""}
                </span>
                <span className="muet">{date(e.le)}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </Page>
  );
}
