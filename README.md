# ♟️ Échec du Jour

Un mat en 1 coup, le même pour tout le monde, chaque jour. Trouvez-le le plus vite possible et partagez votre temps.

Inspiré du concept « défi quotidien identique pour tout le monde, résultat partageable en une ligne », mais appliqué aux échecs.

## Comment ça marche

- Chaque jour correspond à une position de mat en 1 coup différente, tirée d'une liste fixe de 200 positions et choisie de façon déterministe à partir de la date (même puzzle pour tout le monde, pas de serveur nécessaire).
- Cliquez sur une pièce de la couleur au trait puis sur une case surlignée pour jouer votre coup.
- Un coup légal qui ne mate pas coûte une pénalité de 3 secondes et le coup est annulé.
- Une fois le mat trouvé, votre temps et votre nombre d'essais sont sauvegardés localement (`localStorage`) et un bouton permet de copier un résumé partageable.

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
