# Journaux alimentaires

Application web statique pour calculer les apports nutritionnels d'un journal alimentaire quotidien. Les données proviennent directement du [Fichier canadien sur les éléments nutritifs (FCÉN)](https://www.canada.ca/fr/sante-canada/services/aliments-nutrition/saine-alimentation/donnees-nutritionnelles/fichier-canadien-elements-nutritifs.html).

Hébergement prévu sur **GitHub Pages** — pas de backend, pas de base de données, pas de connexion.

## Fonctionnalités

- Recherche d'aliments dans le FCÉN (~6000 aliments)
- Saisie de portions en **grammes** ou en **mesures** (tasse, ml, 50g, etc.)
- Calcul des nutriments par entrée (protéines, glucides, lipides, minéraux, vitamines)
- **Totaux journaliers**
- Données du journal sauvegardées localement dans le navigateur (`localStorage`)

## Stack

- React 19, TypeScript, Vite
- API FCÉN : `https://food-nutrition.canada.ca/api/canadian-nutrient-file/`

## Développement local

```bash
cd frontend
npm install
npm run dev
```

Ouvrir `http://localhost:5173`.

## Déploiement GitHub Pages

1. Pousser le code sur GitHub (branche `main` ou `master`)
2. Aller dans **Settings → Pages → Build and deployment**
3. Choisir **GitHub Actions** comme source
4. Le workflow `.github/workflows/deploy.yml` build et déploie automatiquement

L'app sera disponible à : `https://<votre-utilisateur>.github.io/journeaux-alimentaires/`

> Si le nom du dépôt est différent, modifier `base` dans `frontend/vite.config.ts` et le script `build:pages`.

## Structure du projet

```
frontend/
├── src/
│   ├── pages/DiaryPage.tsx       # Interface principale
│   ├── services/
│   │   ├── cnf.service.ts        # Appels API FCÉN
│   │   ├── nutrition.service.ts  # Calcul des nutriments
│   │   └── diary.service.ts      # Journal (localStorage)
│   └── types/                    # Types TypeScript
└── vite.config.ts
```

## Calcul des nutriments

Les valeurs du FCÉN sont exprimées **pour 100 g** de portion comestible :

- **Grammes** : `quantité / 100`
- **Mesure** (tasse, ml, etc.) : `quantité × facteur_de_conversion` (fourni par le FCÉN)
