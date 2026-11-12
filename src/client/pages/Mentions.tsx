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
          Estacasino est un jeu social. Les jetons sont <strong>fictifs et n'ont aucune valeur monétaire</strong>, y compris ceux obtenus
          dans la boutique. Ils ne peuvent pas être revendus, échangés, transférés entre joueurs, remboursés, ni convertis en argent, en
          cadeaux ou en lots. On ne gagne jamais d'argent.
        </p>
        <ul>
          <li>Capital de départ : 10 000 jetons.</li>
          <li>Bonus quotidien : 2 000 jetons, plus 200 par jour consécutif (jusqu'à +3 000).</li>
          <li>Filet de sécurité : 2 000 jetons si votre solde passe sous 500, au plus une fois toutes les 4 heures.</li>
        </ul>

        <h2>Un compte par personne</h2>
        <p>
          Chaque joueur n'a qu'un seul compte. Pour éviter les comptes créés en série, nous gardons une empreinte <strong>hachée</strong>{" "}
          (illisible) de votre appareil, grâce à un cookie technique, et de votre adresse IP. Un seul compte peut être créé par appareil, et
          un nombre limité par connexion et par jour. Les empreintes d'adresse IP sont effacées après 90 jours ; celle de l'appareil d'un
          compte supprimé est conservée un an, puis effacée. L'équipe peut suspendre les comptes multiples.
        </p>

        <h2>Réservé aux adultes</h2>
        <p>L'accès est réservé aux personnes de 18 ans et plus. La date de naissance est demandée à l'inscription.</p>

        <h2>Saisons et classement</h2>
        <p>
          Votre <strong>solde total</strong> est conservé d'une saison à l'autre. Le classement repose uniquement sur vos{" "}
          <strong>gains de la saison</strong> (gains moins mises, plus les récompenses des défis quotidiens), remis à zéro au début de
          chaque saison. Le bonus quotidien, le filet de sécurité et les jetons de la boutique n'y comptent pas. Les parties jouées en
          room privée comptent. Les récompenses de saison sont honorifiques et ne peuvent pas être achetées.
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
        <p>
          <strong>Poker Texas Hold'em</strong> : sans limite, de 2 à 6 joueurs. En partie libre, vous vous asseyez avec une cave prise sur
          votre solde et repartez avec votre tapis. En Sit &amp; Go, chacun paie la même entrée, reçoit le même tapis de tournoi, les
          blindes montent régulièrement et les premiers se partagent les entrées. Les résultats du poker ont leur propre classement.
        </p>
        <p>
          <strong>Machine à sous « Les Années folles »</strong> : 5 rouleaux, 3 rangées, 243 voies de gain. Tours gratuits avec
          multiplicateur croissant (3 BONUS ou plus) et Pluie d'or avec quatre jackpots fixes (6 pièces ou plus). Taux de redistribution
          théorique d'environ 97 %, gain maximum de 5 000 fois la mise par lancer. La table des gains complète est dans le jeu.
        </p>
        <p>Tous les tirages sont réalisés sur nos serveurs avec un générateur aléatoire cryptographique.</p>

        <h2>Boutique</h2>
        <p>
          La boutique vend des cosmétiques (avatars, accessoires, thèmes de table) et des jetons : des packs crédités immédiatement, et un
          forfait saison qui crédite 2 000 jetons chaque fois que votre solde tombe à zéro, jusqu'à la fin de la saison en cours. Les jetons
          achetés restent fictifs et sans valeur, comme tous les autres ; ils sont limités à 5 packs par 24 heures. Les prix sont affichés
          TTC. Le paiement est traité par Stripe. Les contenus numériques étant livrés immédiatement, vous renoncez
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

        <h2>Notifications</h2>
        <p>
          Sur téléphone, vous pouvez activer deux rappels : votre bonus du jour à 10 h, et votre filet de sécurité quand il est de
          nouveau disponible. Nous gardons seulement l'adresse technique fournie par votre téléphone pour vous les envoyer. Vous pouvez
          les couper à tout moment depuis votre profil ou les réglages du téléphone ; elles sont supprimées avec votre compte.
        </p>

        <h2>Données personnelles</h2>
        <p>
          Nous conservons votre pseudo, votre date de naissance, votre mot de passe sous forme chiffrée, votre historique de jeu et vos
          achats. Aucune adresse e-mail n'est demandée. Vous pouvez supprimer votre compte à tout moment depuis votre profil ; les achats sont alors conservés de façon anonyme, pour les obligations comptables.
        </p>
      </article>
    </Page>
  );
}
