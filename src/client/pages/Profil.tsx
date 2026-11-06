import { type FormEvent, useEffect, useState } from "react";
import { type Categorie, CATEGORIES, type ConfigAvatar, cleePiece, PIECES } from "../../shared/avatar";
import { MDP_MIN } from "../../shared/regles";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Page } from "../components/Elements";
import { Lien, naviguer } from "../router";
import { useSession } from "../session";

export function Profil() {
  const { moi, rafraichir, notifier } = useSession();
  const [config, setConfig] = useState<ConfigAvatar | null>(null);
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [codeSecours, setCodeSecours] = useState<string | null>(null);

  useEffect(() => {
    if (moi && !config) setConfig(moi.avatar);
  }, [moi, config]);
  if (!moi || !config) return null;

  const possede = (cat: Categorie, id: string) => moi.inventaire.includes(cleePiece(cat, id));
  const modifie = JSON.stringify(config) !== JSON.stringify(moi.avatar);

  const enregistrer = async () => {
    try {
      await api("/moi/avatar", { methode: "PUT", corps: { avatar: config } });
      await rafraichir();
      notifier("Avatar enregistré. Très réussi.");
    } catch (e) {
      notifier((e as Error).message, true);
    }
  };

  const changerMdp = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api("/moi/mdp", { corps: { ancien, mdp: nouveau } });
      setAncien("");
      setNouveau("");
      notifier("Mot de passe modifié.");
    } catch (err) {
      notifier((err as Error).message, true);
    }
  };

  const regenererCode = async () => {
    if (!confirm("Générer un nouveau code de secours ? L'ancien ne fonctionnera plus.")) return;
    const r = await api<{ codeSecours: string }>("/moi/code-secours", { corps: {} });
    setCodeSecours(r.codeSecours);
  };

  const deconnexion = async () => {
    await api("/auth/deconnexion", { corps: {} });
    await rafraichir();
    naviguer("/", true);
  };

  return (
    <Page>
      <div className="pile" style={{ gap: 32 }}>
        <div className="rangee" style={{ justifyContent: "space-between", gap: 16 }}>
          <div className="pile" style={{ gap: 6 }}>
            <div className="surtitre">Votre profil</div>
            <h1 style={{ fontSize: 40 }}>{moi.pseudo}</h1>
          </div>
          <button type="button" className="btn btn-petit" onClick={() => void deconnexion()}>Se déconnecter</button>
        </div>

        <section className="carte-ui" style={{ padding: 24 }}>
          <div className="editeur">
            <div className="pile" style={{ gap: 14, alignItems: "center" }}>
              <Avatar config={config} taille={220} titre="Votre avatar" />
              <div className="rangee" style={{ gap: 8, justifyContent: "center" }}>
                <button type="button" className="btn btn-principal" disabled={!modifie} onClick={() => void enregistrer()}>Enregistrer</button>
                <button type="button" className="btn" disabled={!modifie} onClick={() => setConfig(moi.avatar)}>Annuler</button>
              </div>
            </div>
            <div className="pile" style={{ gap: 18 }}>
              {CATEGORIES.map((cat) => (
                <div key={cat.id} className="pile" style={{ gap: 8 }}>
                  <h2 className="surtitre">{cat.nom}</h2>
                  <div className="choix-pieces">
                    {PIECES.filter((p) => p.categorie === cat.id).map((p) => {
                      const dispo = p.gratuit || possede(cat.id, p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="choix-piece"
                          aria-pressed={config[cat.id] === p.id}
                          disabled={!dispo}
                          title={dispo ? undefined : "Disponible dans la boutique"}
                          onClick={() => setConfig({ ...config, [cat.id]: p.id })}
                        >
                          {p.couleur && <span className="pastille-couleur" style={{ background: p.couleur }} />}
                          {p.nom}
                          {!dispo && <span className="muet" style={{ fontSize: 12 }}>· boutique</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="muet" style={{ fontSize: 13 }}>
                Les pièces verrouillées se trouvent dans la <Lien href="/boutique">boutique</Lien>.
              </p>
            </div>
          </div>
        </section>

        <div className="rangee" style={{ gap: 24, alignItems: "flex-start" }}>
          <form className="carte-ui encart" style={{ flex: "1 1 320px" }} onSubmit={changerMdp}>
            <h2 style={{ fontSize: 24 }}>Mot de passe</h2>
            <div className="champ">
              <label htmlFor="p-ancien">Mot de passe actuel</label>
              <input id="p-ancien" type="password" className="input" value={ancien} onChange={(e) => setAncien(e.target.value)} autoComplete="current-password" required />
            </div>
            <div className="champ">
              <label htmlFor="p-nouveau">Nouveau mot de passe</label>
              <input id="p-nouveau" type="password" className="input" value={nouveau} onChange={(e) => setNouveau(e.target.value)} autoComplete="new-password" required minLength={MDP_MIN} />
            </div>
            <button type="submit" className="btn">Modifier</button>
          </form>
          <div className="carte-ui encart" style={{ flex: "1 1 320px" }}>
            <h2 style={{ fontSize: 24 }}>Code de secours</h2>
            <p className="muet" style={{ fontSize: 14 }}>
              Il permet de réinitialiser votre mot de passe en cas d'oubli. Si vous l'avez perdu, générez-en un nouveau.
            </p>
            {codeSecours ? (
              <>
                <div className="code-secours">{codeSecours}</div>
                <p className="accent" style={{ fontSize: 14 }}>Notez-le maintenant : il ne sera plus affiché.</p>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => void regenererCode()}>Générer un nouveau code</button>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
