import { type FormEvent, useState } from "react";
import {
  ALPHABET_CODE,
  BLACKJACK_LIMITES_DEFAUT,
  formatJetons,
  type Jeu,
  PALIERS_MISE_MAX,
  PALIERS_MISE_MIN,
  ROULETTE_LIMITES_DEFAUT,
} from "../../shared/regles";
import { api } from "../api";
import { LIGUES, trouverLigue } from "../../shared/ligues";
import { DefisDuJour } from "../components/Defis";
import { BadgeLigue } from "../components/Ligue";
import { Carte, Page } from "../components/Elements";
import { Lien, naviguer } from "../router";
import { useSession } from "../session";

function salutation(): string {
  const h = new Date().getHours();
  return h >= 5 && h < 18 ? "Bonjour" : "Bonsoir";
}

function MiniRoue() {
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="56" cy="56" r="54" fill="#1a1d1f" />
      {Array.from({ length: 18 }, (_, i) => {
        const a1 = (i * 20 * Math.PI) / 180;
        const a2 = ((i + 1) * 20 * Math.PI) / 180;
        const p = (a: number, r: number) => `${56 + r * Math.sin(a)} ${56 - r * Math.cos(a)}`;
        return <path key={i} d={`M56 56 L${p(a1, 48)} A48 48 0 0 1 ${p(a2, 48)} Z`} fill={i === 0 ? "#1f7a52" : i % 2 ? "#b8433b" : "#141618"} />;
      })}
      <circle cx="56" cy="56" r="26" fill="#0b0d0e" style={{ stroke: "var(--accent)" }} strokeWidth="2" />
      <circle cx="56" cy="56" r="7" style={{ fill: "var(--accent)" }} />
    </svg>
  );
}

export function Lobby() {
  const { moi, rafraichir, notifier } = useSession();
  const [code, setCode] = useState("");
  const [erreurCode, setErreurCode] = useState<string | null>(null);
  const [creation, setCreation] = useState<Jeu | null>(null);
  const [limites, setLimites] = useState(BLACKJACK_LIMITES_DEFAUT);
  if (!moi) return null;

  const rejoindre = async (e: FormEvent) => {
    e.preventDefault();
    setErreurCode(null);
    const c = code.toUpperCase();
    try {
      await api(`/rooms/${c}`);
      naviguer(`/room/${c}`);
    } catch (err) {
      setErreurCode((err as Error).message);
    }
  };

  const creer = async () => {
    if (!creation) return;
    try {
      const r = await api<{ code: string }>("/rooms", { corps: { jeu: creation, ...limites } });
      naviguer(`/room/${r.code}`);
    } catch (err) {
      notifier((err as Error).message, true);
    }
  };

  const recupererBonus = async () => {
    try {
      const r = await api<{ montant: number; serie: number }>("/bonus/quotidien", { corps: {} });
      notifier(`+${formatJetons(r.montant)} jetons. Série de ${r.serie} jour${r.serie > 1 ? "s" : ""}.`);
    } catch (err) {
      notifier((err as Error).message, true);
    }
    await rafraichir();
  };

  const recupererFilet = async () => {
    try {
      const r = await api<{ montant: number }>("/bonus/filet", { corps: {} });
      notifier(`La maison vous offre un deuxième souffle : +${formatJetons(r.montant)} jetons.`);
    } catch (err) {
      notifier((err as Error).message, true);
    }
    await rafraichir();
  };

  const finSaison = moi.saison ? Math.max(0, Math.ceil((moi.saison.fin - Date.now()) / 86_400_000)) : null;

  return (
    <Page>
      <div className="pile" style={{ gap: 32 }}>
        <div className="rangee" style={{ justifyContent: "space-between", gap: 24, alignItems: "flex-end" }}>
          <div className="pile" style={{ gap: 6 }}>
            <h1 style={{ fontSize: "clamp(34px, 5vw, 48px)", lineHeight: 1.05 }}>
              {salutation()}, {moi.pseudo}.
            </h1>
            <p className="italique accent" style={{ fontSize: 18 }}>
              Le croupier a déjà mélangé. Deux fois, par précaution.
            </p>
          </div>
          <div className="rangee" style={{ gap: 12 }}>
            <div className="carte-ui" style={{ padding: "14px 18px", minWidth: 180 }}>
              <div className="surtitre">Solde total</div>
              <div className="num" style={{ fontSize: 28, fontWeight: 800 }}>{formatJetons(moi.solde)}</div>
              <div className="muet" style={{ fontSize: 12 }}>Vos jetons pour jouer</div>
            </div>
            {moi.saison && (
              <div className="carte-ui" style={{ padding: "14px 18px", minWidth: 200, borderColor: "var(--accent)" }}>
                <div className="rangee" style={{ justifyContent: "space-between", gap: 8 }}>
                  <div className="surtitre accent">Gains de la saison</div>
                  <BadgeLigue id={moi.ligue.id} />
                </div>
                <div className="num accent" style={{ fontSize: 28, fontWeight: 800 }}>
                  {moi.saison.gains > 0 ? "+" : ""}
                  {formatJetons(moi.saison.gains)}
                </div>
                <div className="muet" style={{ fontSize: 12 }}>
                  {moi.saison.rang
                    ? `Compte pour le classement · ${moi.saison.rang}e`
                    : `Classé après ${moi.saison.minParties} parties (${moi.saison.parties} jouées)`}
                </div>
                <Lien href="/profil" className="lien-discret">Voir l'historique de la saison</Lien>
                {moi.ligue.suivante && moi.saison.parties >= moi.saison.minParties && (
                  <div className="progression-ligue" title={`Ligue ${moi.ligue.suivante.nom} à ${formatJetons(moi.ligue.suivante.seuil)} jetons de gains`}>
                    <div className="jauge"><i style={{ width: `${Math.max(0, Math.min(100, (100 * moi.saison.gains) / moi.ligue.suivante.seuil))}%` }} /></div>
                    <span className="muet">{moi.ligue.suivante.nom} à {formatJetons(moi.ligue.suivante.seuil)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rangee" style={{ gap: 24, alignItems: "flex-start" }}>
          <section className="pile" style={{ gap: 14, flex: "999 1 560px", minWidth: 0 }}>
            <h2 className="surtitre">Les tables</h2>
            <div className="grille-jeux">
              <article className="carte-ui carte-jeu">
                <div className="visuel" aria-hidden="true">
                  <div style={{ transform: "rotate(-8deg)" }}><Carte carte={{ r: "A", c: "S" }} petite /></div>
                  <div style={{ transform: "rotate(6deg)" }}><Carte carte={{ r: "K", c: "H" }} petite /></div>
                </div>
                <div className="corps">
                  <h3 style={{ fontSize: 26 }}>Blackjack</h3>
                  <p className="muet" style={{ fontSize: 14, flex: 1 }}>Seul face au croupier, ou jusqu'à 5 à la même table. Blackjack payé 3 pour 2.</p>
                  <div className="boutons-jeu">
                    <button type="button" className="btn btn-principal" onClick={() => naviguer("/blackjack")}>Jouer seul</button>
                    <button type="button" className="btn btn-contour" onClick={() => { setCreation("blackjack"); setLimites(BLACKJACK_LIMITES_DEFAUT); document.getElementById("code")?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
                      Table entre amis
                    </button>
                  </div>
                </div>
              </article>
              <article className="carte-ui carte-jeu">
                <div className="visuel"><MiniRoue /></div>
                <div className="corps">
                  <h3 style={{ fontSize: 26 }}>Roulette</h3>
                  <p className="muet" style={{ fontSize: 14, flex: 1 }}>Seul, vous lancez la bille. À La Grande Roue, tout le monde mise ensemble, un tirage toutes les 30 secondes.</p>
                  <div className="boutons-jeu">
                    <button type="button" className="btn btn-principal" onClick={() => naviguer("/roulette/solo")}>Jouer seul</button>
                    <button type="button" className="btn btn-contour" onClick={() => naviguer("/roulette")}>La Grande Roue</button>
                  </div>
                </div>
              </article>
            </div>
            <h2 className="surtitre" style={{ marginTop: 6 }}>Prochainement</h2>
            <div className="prochainement">
              <div className="carte-ui bientot-mini" aria-label="Poker Hold'em, bientôt disponible">
                <span className="italique">Poker Hold'em</span>
                <span className="muet">De 2 à 8 joueurs, rooms et tournois</span>
              </div>
              <div className="carte-ui bientot-mini" aria-label="Machine à sous, bientôt disponible">
                <span className="italique">Machine à sous</span>
                <span className="muet">Une seule machine, très soignée</span>
              </div>
            </div>
          </section>

          <aside className="pile" style={{ gap: 14, flex: "1 1 320px", minWidth: 0 }}>
            <h2 className="surtitre">Jouer entre amis</h2>
            <form className="carte-ui encart" onSubmit={rejoindre}>
              <label htmlFor="code" style={{ fontWeight: 600 }}>Code de room (5 lettres)</label>
              <div className="rangee" style={{ gap: 8, flexWrap: "nowrap" }}>
                <input
                  id="code" className="code-saisie" value={code} maxLength={5} placeholder="VXKTR" autoComplete="off" autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value.toUpperCase().split("").filter((ch) => ALPHABET_CODE.includes(ch)).join(""))}
                />
                <button type="submit" className="btn" disabled={code.length !== 5} style={{ minHeight: 54 }}>Rejoindre</button>
              </div>
              {erreurCode && <div className="erreur" role="alert">{erreurCode}</div>}
              <div style={{ height: 1, background: "var(--ligne)" }} />
              {creation ? (
                <div className="pile" style={{ gap: 12 }}>
                  <div className="onglets" role="group" aria-label="Jeu de la room">
                    {(["blackjack", "roulette"] as const).map((j) => (
                      <button key={j} type="button" aria-pressed={creation === j} onClick={() => { setCreation(j); setLimites(j === "blackjack" ? BLACKJACK_LIMITES_DEFAUT : ROULETTE_LIMITES_DEFAUT); }}>
                        {j === "blackjack" ? "Blackjack" : "Roulette"}
                      </button>
                    ))}
                  </div>
                  <div className="rangee" style={{ gap: 10 }}>
                    <div className="champ" style={{ flex: 1 }}>
                      <label htmlFor="mise-min">Mise minimum</label>
                      <select id="mise-min" className="input" value={limites.min} onChange={(e) => setLimites({ ...limites, min: Number(e.target.value) })}>
                        {PALIERS_MISE_MIN.filter((v) => v <= limites.max).map((v) => <option key={v} value={v}>{formatJetons(v)}</option>)}
                      </select>
                    </div>
                    <div className="champ" style={{ flex: 1 }}>
                      <label htmlFor="mise-max">{creation === "roulette" ? "Maximum par tour" : "Mise maximum"}</label>
                      <select id="mise-max" className="input" value={limites.max} onChange={(e) => setLimites({ ...limites, max: Number(e.target.value) })}>
                        {PALIERS_MISE_MAX.filter((v) => v >= limites.min).map((v) => {
                          const requise = LIGUES.find((l) => l.miseMaxRoom >= v);
                          const bloquee = v > trouverLigue(moi.ligue.id).miseMaxRoom;
                          return (
                            <option key={v} value={v} disabled={bloquee}>
                              {formatJetons(v)}{bloquee && requise ? ` (ligue ${requise.nom})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                  <p className="muet" style={{ fontSize: 13 }}>
                    Toute personne qui a le code peut entrer : partagez-le avec qui vous voulez. La room ferme après 15 minutes sans joueur.
                  </p>
                  <div className="rangee" style={{ gap: 8 }}>
                    <button type="button" className="btn btn-principal" style={{ flex: 1 }} onClick={() => void creer()}>Ouvrir la room</button>
                    <button type="button" className="btn" onClick={() => setCreation(null)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="btn btn-principal" onClick={() => { setCreation("blackjack"); setLimites(BLACKJACK_LIMITES_DEFAUT); }}>
                    Créer une room
                  </button>
                  <p className="muet" style={{ fontSize: 13 }}>Vos amis entrent le code depuis leur compte Estacasino.</p>
                </>
              )}
            </form>

            <div className="carte-ui encart" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Bonus du jour</div>
                <div className="muet" style={{ fontSize: 13 }}>
                  {moi.bonus.disponible
                    ? `${formatJetons(moi.bonus.montant)} jetons · série de ${moi.bonus.serie} jour${moi.bonus.serie > 1 ? "s" : ""}`
                    : "Récupéré. Revenez demain pour prolonger la série."}
                </div>
              </div>
              <button type="button" className="btn btn-contour btn-petit" disabled={!moi.bonus.disponible} onClick={() => void recupererBonus()}>
                Récupérer
              </button>
            </div>

            <DefisDuJour />

            {moi.solde < moi.filet.seuil && (
              <div className="carte-ui encart" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Filet de sécurité</div>
                  <div className="muet" style={{ fontSize: 13 }}>
                    {moi.filet.disponible
                      ? `${formatJetons(moi.filet.montant)} jetons pour repartir.`
                      : `Disponible à ${new Date(moi.filet.prochain).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`}
                  </div>
                </div>
                <button type="button" className="btn btn-contour btn-petit" disabled={!moi.filet.disponible} onClick={() => void recupererFilet()}>
                  Récupérer
                </button>
              </div>
            )}
            {moi.saison && (
              <p className="muet" style={{ fontSize: 13 }}>
                {finSaison !== null && finSaison <= 120
                  ? `${moi.saison.nom} · fin dans ${finSaison} jour${finSaison === 1 ? "" : "s"}.`
                  : `${moi.saison.nom} · la saison de lancement. Classé dès ${moi.saison.minParties} parties.`}
              </p>
            )}
          </aside>
        </div>
      </div>
    </Page>
  );
}
