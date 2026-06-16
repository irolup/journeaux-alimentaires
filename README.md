# Journaux alimentaires

Application web statique pour calculer les apports nutritionnels d'un journal alimentaire quotidien. Les données proviennent directement du [Fichier canadien sur les éléments nutritifs (FCÉN)](https://www.canada.ca/fr/sante-canada/services/aliments-nutrition/saine-alimentation/donnees-nutritionnelles/fichier-canadien-elements-nutritifs.html).

**Site en ligne :** [https://irolup.github.io/journeaux-alimentaires/](https://irolup.github.io/journeaux-alimentaires/)

## Fonctionnalités

- Recherche d'aliments dans le FCÉN (~6000 aliments)
- Saisie de portions en **grammes** ou en **mesures** (tasse, ml, 50g, etc.)
- Calcul des nutriments par entrée (protéines, glucides, lipides, minéraux, vitamines)
- **Totaux journaliers**
- **Résumé multi-jours** avec période personnalisable (nombre de jours)
- Colonnes configurables dans le tableau de résumé
- **Export CSV** (résumé et détails des totaux par jour)
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

Ouvrir [http://localhost:5173](http://localhost:5173).

### Tester le build comme sur GitHub Pages

```bash
npm run build:pages
npm run preview:pages
```

Ouvrir l'URL affichée (ex. `http://localhost:4173/journeaux-alimentaires/`).

## Déploiement GitHub Pages

Le déploiement est automatisé par GitHub Actions (`.github/workflows/deploy.yml`) à chaque push sur `main`.

1. **Settings → Actions → General** : autoriser les workflows et permissions **Read and write**
2. **Settings → Pages** : la source est gérée par le workflow (ne pas utiliser les modèles Jekyll / Static HTML)
3. Pousser sur `main` — ou lancer manuellement **Actions → Deploy to GitHub Pages → Run workflow**

## Calcul des nutriments

Les valeurs du FCÉN sont exprimées **pour 100 g** de portion comestible :

- **Grammes** : `quantité / 100`
- **Mesure** (tasse, ml, etc.) : `quantité × facteur_de_conversion` (fourni par le FCÉN)

## Notes

- Les données du journal sont stockées dans le navigateur : elles ne se synchronisent pas entre appareils
- Une connexion internet est requise pour interroger l'API FCÉN
- Si le nom du dépôt change, modifier `base` dans `frontend/vite.config.ts` et le script `build:pages`
