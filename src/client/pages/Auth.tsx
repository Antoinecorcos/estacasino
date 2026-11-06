import { type FormEvent, useState } from "react";
import { AVATARS_DEPART } from "../../shared/avatar";
import { MDP_MIN } from "../../shared/regles";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Carte, Page } from "../components/Elements";
import { Lien, naviguer } from "../router";
import { useSession } from "../session";

export function Accueil() {
  return (
    <main className="page">
      <div className="conteneur">
        <section className="hero">
          <div className="pile" style={{ gap: 20 }}>
            <div className="surtitre">Club de jeu privé · jetons fictifs</div>
            <h1>
              Esta<em className="italique">casino</em>
            </h1>
            <p className="italique accent" style={{ fontSize: 24 }}>
              Jetons sans valeur. Ego, par contre…
            </p>
            <p style={{ color: "var(--ivoire-2)", fontSize: 17, maxWidth: 520 }}>
              Blackjack et roulette entre amis ou en solo, avec des jetons gratuits qui ne valent rien, sauf votre place au classement
              de la saison.
            </p>
            <div className="rangee" style={{ gap: 12 }}>
              <Lien href="/inscription" className="btn btn-principal">
                Prendre place
              </Lien>
              <Lien href="/connexion" className="btn">
                J'ai déjà un compte
              </Lien>
            </div>
          </div>
          <div className="visuel-hero" aria-hidden="true">
            <div style={{ position: "relative", width: 300, height: 260 }}>
              <div style={{ position: "absolute", left: 20, top: 30, transform: "rotate(-10deg)" }}>
                <Carte carte={{ r: "A", c: "S" }} />
              </div>
              <div style={{ position: "absolute", left: 70, top: 18, transform: "rotate(4deg)" }}>
                <Carte carte={{ r: "K", c: "H" }} />
              </div>
              <div style={{ position: "absolute", right: 10, top: 70 }}>
                <Avatar config={AVATARS_DEPART[2].config} taille={150} />
              </div>
              <div style={{ position: "absolute", left: 40, bottom: 0 }}>
                <Avatar config={AVATARS_DEPART[1].config} taille={110} />
              </div>
            </div>
          </div>
        </section>
        <section className="principes">
          <div className="pile" style={{ gap: 6 }}>
            <div className="surtitre accent">Des rooms entre amis</div>
            <p className="muet">Créez une room, donnez le code de 5 lettres, et toute la bande est à table.</p>
          </div>
          <div className="pile" style={{ gap: 6 }}>
            <div className="surtitre accent">Des saisons</div>
            <p className="muet">Chaque saison, le classement repart à zéro. Vos jetons, eux, restent à vous.</p>
          </div>
          <div className="pile" style={{ gap: 6 }}>
            <div className="surtitre accent">Rien à gagner</div>
            <p className="muet">On ne mise jamais d'argent et on n'achète jamais de jetons. On joue pour la gloire.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function CodeSecours({ code, suite }: { code: string; suite: () => void }) {
  const [note, setNote] = useState(false);
  return (
    <div className="pile" style={{ gap: 16 }}>
      <h1 style={{ fontSize: 34 }}>Votre code de secours</h1>
      <p className="muet">
        Notez-le précieusement : c'est le seul moyen de récupérer votre compte si vous oubliez votre mot de passe. Il ne sera plus
        jamais affiché.
      </p>
      <div className="code-secours">{code}</div>
      <button type="button" className="btn btn-petit" onClick={() => void navigator.clipboard?.writeText(code)}>
        Copier le code
      </button>
      <label className="case">
        <input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} />
        J'ai noté mon code de secours en lieu sûr.
      </label>
      <button type="button" className="btn btn-principal btn-large" disabled={!note} onClick={suite}>
        Entrer dans le salon
      </button>
    </div>
  );
}

export function Inscription() {
  const { rafraichir } = useSession();
  const [pseudo, setPseudo] = useState("");
  const [mdp, setMdp] = useState("");
  const [naissance, setNaissance] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [cgu, setCgu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await api<{ codeSecours: string }>("/auth/inscription", { corps: { pseudo, mdp, dateNaissance: naissance, avatar, cgu } });
      setCode(r.codeSecours);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Page>
      <div className="carte-ui formulaire">
        {code ? (
          <CodeSecours
            code={code}
            suite={() => {
              void rafraichir();
              naviguer("/", true);
            }}
          />
        ) : (
          <form className="pile" style={{ gap: 18 }} onSubmit={envoyer}>
            <div className="pile" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 34 }}>Prendre place</h1>
              <p className="muet">10 000 jetons offerts à l'arrivée. Ils n'ont aucune valeur, et c'est très bien comme ça.</p>
            </div>
            <fieldset className="pile" style={{ gap: 10, border: "none", padding: 0, margin: 0 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Votre avatar</legend>
              <div className="choix-avatars">
                {AVATARS_DEPART.map((a, i) => (
                  <button key={a.nom} type="button" className="choix-avatar" aria-pressed={avatar === i} onClick={() => setAvatar(i)}>
                    <Avatar config={a.config} taille={72} />
                    {a.nom}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="champ">
              <label htmlFor="pseudo">Pseudo</label>
              <input id="pseudo" className="input" value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required minLength={3} maxLength={16} pattern="[A-Za-z0-9_.\-]{3,16}" />
              <span className="aide">3 à 16 caractères : lettres, chiffres, « _ », « - » ou « . ». Il doit être unique.</span>
            </div>
            <div className="champ">
              <label htmlFor="mdp">Mot de passe</label>
              <input id="mdp" type="password" className="input" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" required minLength={MDP_MIN} />
              <span className="aide">{MDP_MIN} caractères minimum.</span>
            </div>
            <div className="champ">
              <label htmlFor="naissance">Date de naissance</label>
              <input id="naissance" type="date" className="input" value={naissance} onChange={(e) => setNaissance(e.target.value)} required />
              <span className="aide">Estacasino est réservé aux personnes de 18 ans et plus.</span>
            </div>
            <label className="case">
              <input type="checkbox" checked={cgu} onChange={(e) => setCgu(e.target.checked)} required />
              <span>
                J'ai 18 ans ou plus, j'accepte les <Lien href="/mentions">conditions d'utilisation</Lien> et je comprends que les jetons sont
                fictifs et sans aucune valeur.
              </span>
            </label>
            {erreur && <div className="erreur" role="alert">{erreur}</div>}
            <button type="submit" className="btn btn-principal btn-large" disabled={envoi}>
              {envoi ? "Un instant…" : "Créer mon compte"}
            </button>
            <p className="muet" style={{ fontSize: 14, textAlign: "center" }}>
              Déjà membre ? <Lien href="/connexion">Se connecter</Lien>
            </p>
          </form>
        )}
      </div>
    </Page>
  );
}

export function Connexion() {
  const { rafraichir } = useSession();
  const [pseudo, setPseudo] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api("/auth/connexion", { corps: { pseudo, mdp } });
      await rafraichir();
      naviguer("/", true);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Page>
      <form className="carte-ui formulaire" onSubmit={envoyer}>
        <div className="pile" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 34 }}>Bon retour.</h1>
          <p className="italique accent">Votre table habituelle vous attend. Enfin, n'importe laquelle.</p>
        </div>
        <div className="champ">
          <label htmlFor="c-pseudo">Pseudo</label>
          <input id="c-pseudo" className="input" value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required />
        </div>
        <div className="champ">
          <label htmlFor="c-mdp">Mot de passe</label>
          <input id="c-mdp" type="password" className="input" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" required />
        </div>
        {erreur && <div className="erreur" role="alert">{erreur}</div>}
        <button type="submit" className="btn btn-principal btn-large" disabled={envoi}>
          {envoi ? "Un instant…" : "Se connecter"}
        </button>
        <div className="rangee" style={{ justifyContent: "space-between", gap: 10, fontSize: 14 }}>
          <Lien href="/mot-de-passe-oublie">Mot de passe oublié ?</Lien>
          <Lien href="/inscription">Créer un compte</Lien>
        </div>
      </form>
    </Page>
  );
}

export function MotDePasseOublie() {
  const { rafraichir } = useSession();
  const [pseudo, setPseudo] = useState("");
  const [code, setCode] = useState("");
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauCode, setNouveauCode] = useState<string | null>(null);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    try {
      const r = await api<{ codeSecours: string }>("/auth/reinitialiser", { corps: { pseudo, codeSecours: code, mdp } });
      setNouveauCode(r.codeSecours);
    } catch (err) {
      setErreur((err as Error).message);
    }
  };

  return (
    <Page>
      <div className="carte-ui formulaire">
        {nouveauCode ? (
          <CodeSecours
            code={nouveauCode}
            suite={() => {
              void rafraichir();
              naviguer("/", true);
            }}
          />
        ) : (
          <form className="pile" style={{ gap: 18 }} onSubmit={envoyer}>
            <div className="pile" style={{ gap: 6 }}>
              <h1 style={{ fontSize: 34 }}>Mot de passe oublié</h1>
              <p className="muet">
                Utilisez le code de secours reçu à la création de votre compte. Un nouveau code vous sera donné ensuite.
              </p>
            </div>
            <div className="champ">
              <label htmlFor="o-pseudo">Pseudo</label>
              <input id="o-pseudo" className="input" value={pseudo} onChange={(e) => setPseudo(e.target.value)} autoComplete="username" required />
            </div>
            <div className="champ">
              <label htmlFor="o-code">Code de secours</label>
              <input id="o-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" required autoComplete="off" />
            </div>
            <div className="champ">
              <label htmlFor="o-mdp">Nouveau mot de passe</label>
              <input id="o-mdp" type="password" className="input" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" required minLength={MDP_MIN} />
            </div>
            {erreur && <div className="erreur" role="alert">{erreur}</div>}
            <button type="submit" className="btn btn-principal btn-large">
              Réinitialiser
            </button>
            <p className="muet" style={{ fontSize: 13 }}>
              Code de secours perdu ? Contactez l'équipe Estacasino : nous pourrons réinitialiser votre mot de passe manuellement.
            </p>
          </form>
        )}
      </div>
    </Page>
  );
}
