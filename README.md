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

Le classement quotidien et les statistiques personnelles (meilleur temps, série en cours, etc.) sont servis par
un petit backend gratuit : un [Cloudflare Worker](https://workers.cloudflare.com/) + une base
[D1](https://developers.cloudflare.com/d1/) (SQLite serverless), le tout dans [`worker/`](worker). Le site reste
jouable sans ce backend (le classement est simplement masqué si `VITE_API_URL` n'est pas défini).

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
