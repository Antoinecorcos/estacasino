import { Page } from "../components/Elements";

// Texte de base à faire relire par un avocat avant l'ouverture publique.
export function Mentions() {
  return (
    <Page etroite>
      <article className="prose">
        <div className="surtitre">Mentions et règles</div>
        <h1 style={{ fontSize: 40, color: "var(--ivoire)" }}>Les règles de la maison</h1>

        <h2>Des jetons sans valeur</h2>
        <p>
          Estacasino est un jeu social. Les jetons sont <strong>fictifs et n'ont aucune valeur monétaire</strong>. Ils ne peuvent pas être
          achetés, vendus, échangés, transférés entre joueurs, ni convertis en argent, en cadeaux ou en lots. On ne mise jamais d'argent et
          on ne gagne jamais d'argent.
        </p>
        <ul>
          <li>Capital de départ : 10 000 jetons.</li>
          <li>Bonus quotidien : 2 000 jetons, plus 200 par jour consécutif (jusqu'à +3 000).</li>
          <li>Filet de sécurité : 2 000 jetons si votre solde passe sous 500, au plus une fois toutes les 4 heures.</li>
        </ul>

        <h2>Réservé aux adultes</h2>
        <p>L'accès est réservé aux personnes de 18 ans et plus. La date de naissance est demandée à l'inscription.</p>

        <h2>Saisons et classement</h2>
        <p>
          Votre <strong>solde total</strong> est conservé d'une saison à l'autre. Le classement repose uniquement sur vos{" "}
          <strong>gains de la saison</strong> (gains moins mises), remis à zéro au début de chaque saison. Les parties jouées en room
          privée comptent. Les récompenses de saison sont honorifiques et ne peuvent pas être achetées.
        </p>

        <h2>Règles des jeux</h2>
        <p>
          <strong>Blackjack</strong> : sabot de 6 jeux, le croupier tire jusqu'à 16 et reste à 17, blackjack payé 3 pour 2, doubler sur les
          deux premières cartes, séparer une fois, pas d'assurance. Le croupier vérifie son blackjack quand sa carte visible est un As ou
          vaut 10.
        </p>
        <p>
          <strong>Roulette</strong> : roulette européenne (un seul zéro). Plein payé 35 pour 1, douzaines et colonnes 2 pour 1, chances
          simples (rouge, noir, pair, impair, manque, passe) 1 pour 1, perdues sur le zéro.
        </p>
        <p>Tous les tirages sont réalisés sur nos serveurs avec un générateur aléatoire cryptographique.</p>

        <h2>Boutique</h2>
        <p>
          La boutique vend uniquement des cosmétiques (avatars et accessoires). Aucun achat ne donne de jetons ni d'avantage en jeu. Les
          prix sont affichés TTC. Le paiement est traité par Stripe. Les contenus numériques étant livrés immédiatement, vous renoncez
          expressément à votre droit de rétractation au moment de l'achat.
        </p>

        <h2>Rooms privées</h2>
        <p>
          Toute personne disposant du code d'une room peut la rejoindre : l'hôte est responsable de la diffusion de son code. Une room
          sans joueur ferme après 15 minutes.
        </p>

        <h2>Jouer avec modération</h2>
        <p>
          Même sans argent en jeu, prenez des pauses. Si le jeu prend trop de place dans votre vie, vous pouvez contacter{" "}
          <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noreferrer">Joueurs Info Service</a> au 09 74 75 13 13 (appel non
          surtaxé).
        </p>

        <h2>Données personnelles</h2>
        <p>
          Nous conservons votre pseudo, votre date de naissance, votre mot de passe sous forme chiffrée, votre historique de jeu et vos
          achats. Aucune adresse e-mail n'est demandée. Vous pouvez demander la suppression de votre compte à l'équipe Estacasino.
        </p>
        <p className="muet" style={{ fontSize: 13 }}>[ÉDITEUR DU SITE, ADRESSE, HÉBERGEUR : à compléter avant l'ouverture publique.]</p>
      </article>
    </Page>
  );
}
