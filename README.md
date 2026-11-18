# ♟️ Échec du Jour

Un mat en 1 coup, le même pour tout le monde, chaque jour. Trouvez-le le plus vite possible et partagez votre temps.

Inspiré du concept « défi quotidien identique pour tout le monde, résultat partageable en une ligne », mais appliqué aux échecs.

## Comment ça marche

- Chaque jour correspond à une position de mat en 1 coup différente, tirée d'une liste fixe de 200 positions et choisie de façon déterministe à partir de la date (même puzzle pour tout le monde).
- Un écran de démarrage affiche le trait (Blancs/Noirs) et demande un pseudo ; rien (plateau, chrono) ne se lance avant d'avoir cliqué sur « Démarrer ».
- Jouez votre coup en cliquant une pièce puis une case surlignée, ou en la glissant-déposant directement sur sa case d'arrivée.
- Un coup légal qui ne mate pas coûte une pénalité de 3 secondes et le coup est annulé.
- Une fois le mat trouvé : le temps et le nombre d'essais sont sauvegardés localement (`localStorage`), un bouton permet de copier un résumé partageable, et le score est envoyé au classement du jour (voir ci-dessous).

## Classement (backend)

Le classement quotidien, le classement mensuel par points et les statistiques personnelles (meilleur temps, série
en cours, etc.) sont servis par un petit backend gratuit : un [Cloudflare Worker](https://workers.cloudflare.com/)
+ une base [D1](https://developers.cloudflare.com/d1/) (SQLite serverless), le tout dans [`worker/`](worker). Le
site reste jouable sans ce backend (le classement est simplement masqué si `VITE_API_URL` n'est pas défini).

Le classement mensuel attribue des points à chaque puzzle quotidien résolu : le 1ᵉʳ du jour gagne autant de points
qu'il y a de joueurs ce jour-là, le 2ᵉ un point de moins, etc. Les points sont cumulés sur tout le mois calendaire.

### Déployer le backend

```bash
cd worker
npm install
npx wrangler login                 # connecte ton compte Cloudflare (gratuit)
npx wrangler d1 create echec-du-jour  # recopier le database_id dans wrangler.toml
npm run db:init:remote             # crée les tables
npm run deploy                     # déploie le Worker, affiche son URL (https://xxx.workers.dev)
```

Renseigner ensuite cette URL dans la variable `VITE_API_URL` au moment du build du frontend (voir
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

### Bot WhatsApp (top 3 de la veille, chaque matin)

Un déclencheur planifié (Cron Trigger Cloudflare) tourne chaque jour et poste le top 3 de la veille dans un
groupe WhatsApp, à 8h heure de Paris (été comme hiver, sans réglage à changer). Désactivé par défaut : tant que
les variables ci-dessous ne sont pas définies, le Worker ne tente rien.

L'envoi passe par [Green-API](https://green-api.com/) (service tiers, car l'API officielle de WhatsApp ne permet
pas de poster dans un groupe). Le plan gratuit **« Developer »** (jusqu'à 3 discussions) suffit pour un seul
groupe.

1. Créer un compte sur [console.green-api.com](https://console.green-api.com), créer une instance **Developer**
   (gratuite).
2. Dans WhatsApp sur le téléphone qui servira de « bot » (ton propre numéro, par exemple) : `Appareils liés` →
   `Lier un appareil`, puis scanner le QR code affiché dans la console Green-API pour cette instance.
3. Relever dans la console les 3 valeurs `apiUrl`, `idInstance` et `apiTokenInstance` de l'instance.
4. Retrouver l'identifiant du groupe cible (`chatId`, de la forme `xxxxxxxxxxxxxxxxx@g.us`) en appelant une fois :
   `GET {apiUrl}/waInstance{idInstance}/getChats/{apiTokenInstance}` et en repérant le groupe par son nom dans
   la réponse.
5. Déclarer ces 4 valeurs comme secrets du Worker (jamais commitées) :
   ```bash
   cd worker
   npx wrangler secret put GREEN_API_URL             # ex: https://1234.api.green-api.com
   npx wrangler secret put GREEN_API_ID_INSTANCE
   npx wrangler secret put GREEN_API_TOKEN
   npx wrangler secret put GREEN_API_GROUP_CHAT_ID    # ex: 120363043968066561@g.us
   npm run deploy
   ```

Le message est envoyé par le téléphone lié (il doit rester allumé et connecté à Internet). Aucune donnée
supplémentaire n'est stockée : le message est reconstruit à la volée à partir du classement du jour déjà en base.

## Développement

```bash
npm install
npm run dev       # serveur de développement
npm run build     # build de production (dist/)
npm run preview   # prévisualiser le build
```

## Génération des puzzles

Les 200 positions de `src/puzzles.json` sont générées automatiquement par `scripts/generate-puzzles.mjs` :
des parties aléatoires sont jouées avec [chess.js](https://github.com/jhlywa/chess.js) (le moteur de règles),
et toute position où le camp au trait a un coup légal menant à l'échec et mat est retenue. Comme la validation
repose entièrement sur le moteur de règles, chaque puzzle généré est garanti correct.

```bash
node scripts/generate-puzzles.mjs
```

## Déploiement

Le site est statique (aucun backend) et se déploie automatiquement sur GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) à chaque push sur `main`. Pensez à activer
GitHub Pages avec la source « GitHub Actions » dans les réglages du dépôt.

## Crédits

Les icônes des pièces (`src/pieceIcons.ts`) sont le jeu **« cburnett »** par Colin M.L. Burnett, repris du dépôt
public [lichess-org/lila](https://github.com/lichess-org/lila) (également utilisé par Wikipedia), sous licence
libre au choix parmi CC BY-SA 3.0 / GFDL / BSD / GPL.
