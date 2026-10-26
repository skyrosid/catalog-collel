# Exploitation et configuration

## PostgreSQL hébergé

Utiliser une base dédiée, PostgreSQL 16 ou ultérieur recommandé, UTF-8 et accès
réseau limité au serveur d’API. L’hébergeur doit permettre la création d’un rôle
d’exécution séparé, les fonctions PL/pgSQL, le RLS, les triggers de contrainte et
les verrous consultatifs. Exécuter les migrations via une connexion directe ou un
pool en mode session ; ne pas utiliser un pool en mode transaction pour la
commande de migration qui prend un verrou de session.

Le script `infra/postgres/provision.sql` ne contient pas de mot de passe. Créer le
rôle, attribuer son secret dans la console sécurisée du fournisseur ou avec
`\password`, puis utiliser ce rôle dans `DATABASE_URL`. Le rôle de maintenance doit
posséder les objets créés ; les deux rôles ne doivent pas être membres l’un de
l’autre. Ne pas attribuer de privilèges par défaut supplémentaires à `catalog_app`.

`DATABASE_TLS=true` active la vérification du certificat et du nom de serveur.
`DATABASE_CA_FILE` permet d’ajouter la chaîne CA de l’hébergeur. Il n’y a aucun mode
`rejectUnauthorized=false`. Les options `ssl*` dans l’URL sont refusées pour éviter
qu’elles ne remplacent cette configuration.
La seule exception distante sans TLS est une connexion déclarée explicitement
sur réseau privé isolé (`DATABASE_PRIVATE_NETWORK=true`), par exemple entre deux
services Dokploy ; voir [le guide Dokploy](dokploy.md).

Les migrations sont transactionnelles, ordonnées par nom et enregistrées avec une
empreinte SHA-256 dans `public.schema_migrations`. Ne jamais modifier une migration
appliquée : en ajouter une nouvelle. Les fichiers `apps/api/migrations` doivent être
présents à côté de `dist` pour les commandes de maintenance en environnement déployé.
Le binaire de l’API n’applique aucune migration automatiquement.

## Variables de l’API

| Variable                   | Usage                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`                 | `production` sur le serveur                                                  |
| `HOST`                     | `127.0.0.1` par défaut ; `0.0.0.0` dans un conteneur derrière le proxy       |
| `PORT`                     | Port d’écoute, 3000 par défaut                                               |
| `DATABASE_URL`             | Connexion du seul rôle `catalog_app`                                         |
| `DATABASE_TLS`             | `true` pour TLS vérifié ; exception locale ou réseau privé explicite         |
| `DATABASE_PRIVATE_NETWORK` | `true` uniquement pour un réseau serveur isolé sans TLS ; `false` par défaut |
| `DATABASE_CA_FILE`         | Fichier CA PEM optionnel                                                     |
| `SESSION_TTL_HOURS`        | Durée absolue de session, 8 par défaut, de 1 à 24 heures                     |
| `MIGRATION_DATABASE_URL`   | Maintenance uniquement, à retirer du processus d’API                         |

Stocker les secrets dans le gestionnaire de secrets de l’hébergeur. Les fichiers
`.env` locaux sont ignorés par Git. Ne pas utiliser de préfixe `VITE_` pour les
secrets. Le bureau ne connaît que `API_BASE_URL`, valeur publique intégrée au build.

## API HTTPS

Pour travailler sur l’API en local avec les external credentials Dokploy,
conserver l’URL externe dans `apps/api/.env` et utiliser :

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
DATABASE_TLS=false
DATABASE_PRIVATE_NETWORK=false
DATABASE_ALLOW_INSECURE_REMOTE=true
```

Le bureau local conserve `API_BASE_URL=http://127.0.0.1:3000`. L’option
`DATABASE_ALLOW_INSECURE_REMOTE` autorise explicitement la connexion PostgreSQL
distante sans TLS en développement ; elle est refusée dans les autres modes.
Sur Dokploy, l’API de production conserve l’hôte PostgreSQL interne et
`DATABASE_PRIVATE_NETWORK=true` si ce réseau privé n’utilise pas TLS.
Les migrations effectuées depuis le poste local concernent la même base distante.

Terminer TLS sur un proxy de confiance ; aucune ouverture directe du port API sur
Internet. Les en-têtes de proxy ne sont volontairement pas acceptés par défaut :
`trustProxy=false`. Derrière un proxy, les limites par IP s’appliqueront initialement
à son adresse. Configurer explicitement les IP de proxy autorisées dans Fastify
avant de différencier les clients et tester les en-têtes forgés. Le limiteur en
mémoire convient à une instance ; un déploiement multi-instance exige une limite
partagée, au proxy ou avec un stockage central. Ne pas activer CORS sans besoin :
le client Electron appelle l’API depuis son processus principal.

`GET /health/live` indique la vie du processus ; `GET /health/ready` vérifie le pool
PostgreSQL et renvoie 503 s’il est indisponible. Les deux routes ne divulguent pas
de version ni de secret. L’API se ferme proprement sur SIGINT/SIGTERM et ferme le pool.

Prévoir sauvegardes chiffrées et tests de restauration, rotation des secrets,
limites de connexions, journaux protégés, alertes sur erreurs/disponibilité et revue
régulière des dépendances. Les opérations administratives sensibles nécessiteront
un journal d’audit lors de leur implémentation.

## État de livraison

La migration `004_optional_admin_password.sql` rend le changement de mot de passe
facultatif pour les administrateurs de collels, y compris après une réinitialisation.
Elle retire aussi cette obligation aux comptes existants, sans changer leurs mots
de passe ni fermer leurs sessions. Le changement volontaire reste accessible depuis
le menu du compte.

La migration `003_delete_collel.sql` ajoute la suppression définitive depuis la
plateforme, réservée au super administrateur. L’interface exige de ressaisir
l’identifiant du collel avant confirmation. Ses activations et ses comptes propres
sont supprimés ; les identités encore autorisées dans un autre collel sont conservées.

Le dépôt contient une application compilable, une API, les migrations, un outil
de bootstrap et les tests. Aucun serveur ni compte cloud n’a été configuré, aucune
base réelle n’a reçu de migration. Le pipeline CI est défini et sera exécuté après
publication sur GitHub. La création et la gestion des comptes par les
administrateurs seront développées dans une étape ultérieure.

Les tests PGlite vérifient le moteur SQL et les permissions, pas la pile réseau,
le certificat du fournisseur ni les transactions simultanées. Avant production,
valider sur la base cible le rôle réel, le RLS, les suppressions concurrentes du
dernier administrateur, les sauvegardes et le fonctionnement du pool.
