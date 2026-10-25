# Build et mises à jour Windows

## Choix : GitHub Releases et electron-updater

Le dépôt public `skyrosid/catalog-hevron` permet de distribuer l’installeur et les
métadonnées de mise à jour sans ajouter de serveur de téléchargement. Le client
utilise `electron-updater` et le format NSIS, déjà utilisé par electron-builder.
Il n’utilise pas le module `autoUpdater` natif d’Electron, dont le circuit Windows
classique repose sur Squirrel et ne correspond pas à notre installeur NSIS.

Après installation, la version Windows vérifie GitHub cinq secondes après le
démarrage, puis toutes les six heures pendant son exécution. Une version stable
plus récente est téléchargée en arrière-plan. Une boîte de dialogue en hébreu
propose de redémarrer pour installer ou de continuer le travail. Aucun redémarrage
n’est forcé. En choisissant « plus tard », la proposition revient au prochain
lancement ; les téléchargements valides sont réutilisés depuis le cache.

Les versions de développement, les brouillons GitHub et les préversions ne sont
pas proposés aux postes. Les retours à une version inférieure sont désactivés.
Une panne réseau ou GitHub n’empêche pas l’application de démarrer. Le mécanisme
est actuellement activé pour **Windows** uniquement ; les cibles macOS/Linux
restent préparées au packaging mais leurs mises à jour ne sont pas activées.

Référence : [guide electron-builder 26](https://www.electron.build/v26/docs/features/auto-update/).

## Compiler localement

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm --filter @catalog/desktop preview
```

Pour un installeur local, configurer `apps/desktop/.env.production` avec :

```dotenv
API_BASE_URL=https://votre-api.example.com
```

Puis lancer `pnpm package:desktop`. Les fichiers sont dans `apps/desktop/release` :
installeur `.exe`, fichier différentiel `.blockmap` et manifeste `latest.yml`.
Cette commande utilise `--publish never` : elle ne téléverse rien sur GitHub.
Sans certificat, elle produit un installeur de test non signé. Pour une livraison
aux utilisateurs, utiliser le pipeline signé décrit ci-dessous.

## Configurer la publication signée

Dans les paramètres GitHub du dépôt, créer l’environnement **`release`** et, si
souhaité, lui ajouter une approbation manuelle. Y définir :

| Type     | Nom                        | Valeur                                                                                    |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Variable | `API_BASE_URL`             | Origine HTTPS publique de l’API, sans chemin                                              |
| Secret   | `WINDOWS_CSC_LINK`         | Certificat Authenticode PFX encodé en base64, ou emplacement accepté par electron-builder |
| Secret   | `WINDOWS_CSC_KEY_PASSWORD` | Mot de passe du certificat                                                                |

Le certificat doit être reconnu par Windows ; un service de signature hébergé
peut aussi être intégré ultérieurement. Le pipeline actuel utilise le circuit
PFX d’electron-builder. Prévoir le certificat et vérifier sa compatibilité avec
ce circuit avant la première distribution.

Le workflow `.github/workflows/release.yml` refuse de publier sans origine HTTPS
ni secrets de signature, exécute toutes les vérifications, exige la signature
effective et crée une **release brouillon** avec l’installeur et ses métadonnées.
Le jeton GitHub fourni par Actions sert uniquement à publier depuis la CI. Aucun
jeton GitHub ni certificat privé n’est intégré au client Electron.

Le nom d’éditeur du certificat est intégré par electron-builder aux métadonnées
internes ; `verifyUpdateCodeSignature` reste activé pour vérifier les mises à jour
Windows. Utiliser une identité de signature stable. Le renouvellement ou
changement d’éditeur doit être préparé avant expiration du certificat existant.

## Publier une nouvelle version

1. Mettre à jour `version` dans `apps/desktop/package.json`, par exemple `0.1.1`.
   La version du bureau pilote les mises à jour, indépendamment de l’API.
2. Mettre à jour le lockfile avec `pnpm install`, committer et pousser les sources.
3. Dans GitHub Actions, lancer manuellement **Windows release** sur la branche
   validée, en indiquant exactement cette version.
4. Contrôler le brouillon créé pour `v0.1.1`, ses fichiers `.exe`, `.blockmap` et
   `latest.yml`, puis tester l’installeur et son certificat.
5. Publier la release stable. Les postes installés détecteront alors la nouvelle
   version au prochain contrôle, sans réinstaller manuellement l’application.

Ne pas publier uniquement le `.exe` : les métadonnées doivent provenir du **même
build**, sans modification de leur empreinte. Pour corriger une version diffusée,
publier une version supérieure ; ne pas remplacer silencieusement un ancien
installeur et ne pas compter sur un downgrade.

Tester la première chaîne de mise à jour sur un poste Windows avec deux versions
signées successives avant de la déployer à tous les utilisateurs. Le dépôt contient
le mécanisme et le workflow, mais aucune release n’a été publiée et aucun
certificat ni environnement GitHub n’a été configuré automatiquement.

## Code privé et confidentialité

Les installeurs du dépôt public sont téléchargeables publiquement. Cela ne donne
aucun accès aux catalogues : l’API exige toujours une authentification personnelle
et les autorisations du collel. Aucun catalogue ni secret n’est publié avec une
release. Si le code source devient privé, garder un dépôt public séparé pour les
releases ou utiliser un stockage HTTPS dédié ; ne jamais embarquer de jeton
personnel pour télécharger des releases privées.

Le déploiement de l’API et les migrations PostgreSQL constituent un circuit séparé.
Maintenir la compatibilité des contrats avec les versions de bureau encore
installées et appliquer des migrations de base rétrocompatibles.
