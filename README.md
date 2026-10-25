# Catalog Hevron

Fondations d’une application de bureau de gestion des bibliothèques de collels.
Le premier établissement sera le Collel Hevron ; les comptes et autorisations sont
conçus pour plusieurs établissements dès cette version. Aucune gestion d’ouvrages,
de prêts ou de lecteurs n’est encore implémentée.

## Choix techniques

- **Node.js 24 LTS, pnpm 10 et TypeScript strict** ; monorepo de trois packages,
  sans orchestrateur supplémentaire.
- **Electron et electron-vite** ; processus principal, preload et interface séparés.
- **React 19, Tailwind CSS 4 et shadcn/ui** ; composants conservés dans le dépôt,
  thème par variables CSS, interface en hébreu, RTL et contrôles accessibles.
- **API Fastify 5** indépendante ; contrats et validation Zod partagés avec le client.
- **PostgreSQL** distant en production ; pilote `pg`, SQL paramétré, migrations SQL
  versionnées et contrôle d’intégrité par empreinte. Aucun ORM à ce stade.
- **Argon2id** pour les mots de passe ; sessions opaques révocables et expirables.
- **ESLint, Prettier, Vitest et CI Linux/Windows** ; tests du SQL et des politiques
  PostgreSQL avec PGlite, dépendance de développement uniquement.

## Organisation

```text
apps/
  desktop/
    src/main/         # Fenêtre sécurisée, IPC, client HTTP et jeton en mémoire
    src/preload/      # Capacités explicites exposées via contextBridge
    src/renderer/     # React en hébreu, Tailwind et composants shadcn/ui
    src/shared/       # Configuration centralisée des textes de l’interface
  api/
    src/auth/         # Mots de passe, sessions et garde des permissions
    src/db/           # Pool, transactions de collel, migrations et bootstrap
    migrations/       # Schémas, privilèges, fonctions et politiques RLS
    test/             # Tests API et isolation PostgreSQL
packages/contracts/   # DTO, schémas Zod et contrat du pont Electron
infra/postgres/       # Provisionnement du rôle PostgreSQL de l’API
docs/                 # Architecture, sécurité et procédure d’exploitation
```

Le flux de données est : **React → pont preload → processus principal Electron
→ API HTTPS → PostgreSQL**. Les identifiants PostgreSQL restent sur le serveur.

## Démarrage

Installer Node.js **24.x** et pnpm **10.33.0**. Les versions sont déclarées dans
`.node-version` et `package.json` ; le lockfile est versionné.

```sh
pnpm install --frozen-lockfile
```

Créer les fichiers de configuration, par exemple sous PowerShell :

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/desktop/.env.example apps/desktop/.env
```

Configurer un serveur PostgreSQL dédié, en ligne pour la production. Les exemples
`localhost` servent uniquement au développement. Aucune base ni ressource cloud
n’est automatiquement créée et aucun secret n’est fourni.

1. Avec le compte de maintenance de l’hébergeur, exécuter
   `infra/postgres/provision.sql`, puis attribuer un mot de passe aléatoire au rôle
   `catalog_app` via la console du fournisseur ou `\password catalog_app` dans psql.
2. Dans `apps/api/.env`, renseigner `DATABASE_URL` avec ce rôle et
   `MIGRATION_DATABASE_URL` avec un compte distinct propriétaire des objets.
   En ligne, utiliser `DATABASE_TLS=true` et, si nécessaire, `DATABASE_CA_FILE`.
   Retirer les paramètres `ssl*` de l’URL : la vérification TLS est configurée
   explicitement. Une base sur un réseau privé isolé Dokploy peut utiliser
   l’exception explicite décrite dans [le guide Dokploy](docs/dokploy.md).
3. Appliquer les migrations et créer le premier collel avec son administrateur :

```sh
pnpm db:migrate
pnpm db:bootstrap
```

Le bootstrap demande le nom du collel (Hevron par défaut), l’identifiant personnel,
le nom affiché et un mot de passe masqué d’au moins 15 caractères. Il crée le collel,
l’utilisateur et son rôle administrateur dans une seule transaction. Il ne crée
aucun compte de démonstration et n’écrase jamais un compte existant. Il peut être
réutilisé pour créer un autre établissement avec un nouvel administrateur.

4. Pour développer, conserver `API_BASE_URL=http://127.0.0.1:3000` dans
   `apps/desktop/.env`, puis lancer :

```sh
pnpm dev
```

Le bureau s’ouvre sur la connexion. L’API écoute sur `127.0.0.1:3000` par défaut.
On peut aussi lancer chaque application séparément après compilation des contrats :

```sh
pnpm --filter @catalog/contracts build
pnpm --filter @catalog/api dev
pnpm --filter @catalog/desktop dev
```

Après modification des contrats partagés, relancer `pnpm dev` pour les recompiler.

## Vérifications et livraison

```sh
pnpm check           # Typage, lint, tests API/desktop/SQL, build et formatage
pnpm test:db         # Politiques PostgreSQL et invariants, sans serveur externe
pnpm build          # Contrats, API et application Electron
pnpm format         # Formatage du code
```

Les tests SQL exécutent la migration réelle avec des rôles PostgreSQL distincts :
accès inter-collels, absence de contexte, tables privées, session expirée/révoquée,
autorisation retirée et dernier administrateur. PGlite possède une seule connexion ;
les vérifications concurrentes et TLS doivent aussi être réalisées sur un serveur
PostgreSQL de préproduction avant déploiement.

Pour préparer un installeur local, renseigner l’URL HTTPS publique de l’API dans
`apps/desktop/.env.production`, puis exécuter `pnpm package:desktop` sur le système
cible. Les artefacts sont placés dans `apps/desktop/release`. La configuration
electron-builder inclut l’ASAR et le durcissement des fuses. Le mécanisme Windows
de mise à jour via GitHub Releases est intégré ; les secrets de signature et
l’origine HTTPS restent à configurer avant distribution.
L’URL de l’API est publique et fixée à la compilation. Le bureau empaqueté refuse HTTP.

L’API compilée se lance avec `pnpm --filter @catalog/api start`. Son déploiement est
indépendant de celui du bureau ; voir [le guide d’exploitation](docs/operations.md).
Pour votre serveur, suivre [le guide Dokploy](docs/dokploy.md).

## Prochaines étapes

1. Provisionner l’API HTTPS et PostgreSQL en ligne ; appliquer les migrations,
   configurer sauvegardes, supervision, secrets et restauration, puis créer Hevron.
2. Ajouter l’administration des utilisateurs, invitations, réinitialisation des mots
   de passe et journal d’audit, en conservant les invariants d’autorisation.
3. Définir le modèle métier du catalogue ; chaque table propre à un collel devra
   utiliser `collel_id`, des relations tenant compte du collel et des politiques RLS.
4. Implémenter ensuite les ouvrages et la recherche, avec revue des textes hébreux
   et des parcours RTL par les futurs utilisateurs.
5. Valider les accès concurrents et l’installation réelle, puis signer et distribuer
   l’application avec une stratégie de mise à jour de sécurité.

Voir [l’architecture et les garanties de sécurité](docs/architecture.md).

## Modifier les textes

Tous les textes de l’interface, messages d’erreur et titre de fenêtre se modifient
dans **`apps/desktop/src/shared/texts.ts`**. Il s’agit d’un simple objet TypeScript
typé, sans bibliothèque de traduction ni sélecteur de langue. L’interface est
uniquement en hébreu, avec `lang="he"` et `dir="rtl"` permanents. Les identifiants
personnels conservent `dir="auto"` pour accepter aussi les caractères latins.

## Compiler et générer l’installeur Windows

Depuis la racine du dépôt, avec Node.js 24 et pnpm 10.33.0 :

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

`pnpm build` génère le bureau dans `apps/desktop/out`, le serveur dans
`apps/api/dist` et les contrats dans `packages/contracts/dist`. Il ne crée pas
d’installeur. Pour ouvrir le bureau compilé en local :

```powershell
pnpm --filter @catalog/desktop preview
```

Pour générer l’installeur, créer `apps/desktop/.env.production` contenant l’origine
HTTPS réelle de l’API, sans chemin ni identifiants :

```dotenv
API_BASE_URL=https://votre-api.example.com
```

Puis, **sur Windows** :

```powershell
pnpm package:desktop
```

Cette commande recompile les trois modules et génère un installeur NSIS `.exe`
dans `apps/desktop/release`. L’API et PostgreSQL sont hébergés séparément :
l’installeur embarque uniquement le client de bureau. Aucun accès à PostgreSQL
n’est nécessaire pour compiler, mais l’API et sa base doivent être configurées
pour se connecter avec un compte réel. La distribution publique nécessitera
une signature de code. Le workflow GitHub produit des releases brouillons signées ;
les postes téléchargent les nouvelles versions en arrière-plan et proposent le
redémarrage en hébreu. Voir [la procédure de mise à jour](docs/updates.md).
