# Héberger l’API sur Dokploy

Le programme Electron est installé sur les PC. Dokploy héberge **uniquement l’API**
et, éventuellement, un service PostgreSQL. GitHub Releases distribue les
installeurs et mises à jour. Un sous-domaine stable tel que
`api.votre-domaine.fr` donne à l’API son adresse HTTPS ; ce domaine n’est pas un
secret. La protection des identifiants PostgreSQL vient du fait qu’ils restent
sur le serveur, jamais dans le client de bureau.

## Services et réseau

Créer dans Dokploy un projet dédié avec une application `catalog-api` et un
service PostgreSQL dédié, avec stockage persistant et sauvegardes. Réutiliser une
base PostgreSQL hébergée ailleurs est aussi possible avec TLS vérifié. Ne pas
utiliser la base interne de Dokploy lui-même pour les données de l’application.

Si PostgreSQL est sur Dokploy, placer la base et l’API sur un réseau serveur isolé
commun. Utiliser le **nom d’hôte interne** et le port 5432 fournis par Dokploy,
sans exposer de port PostgreSQL sur Internet. Vérifier que l’API appartient bien
à ce réseau. TLS vérifié est recommandé ; si PostgreSQL n’a pas de TLS sur ce
réseau privé, l’exception doit être explicitement configurée avec
`DATABASE_PRIVATE_NETWORK=true`. Ne jamais employer cette exception pour une
base accessible via Internet ou un réseau non maîtrisé.

## Préparer PostgreSQL

Avec le compte de maintenance, exécuter `infra/postgres/provision.sql` et attribuer
un mot de passe au rôle `catalog_app`. Utiliser ce compte limité pour l’API,
jamais le compte PostgreSQL administrateur créé par Dokploy.

Appliquer les migrations puis lancer le bootstrap avant la première utilisation.
Les deux commandes sont disponibles dans l’image construite :

```sh
node dist/db/migrate.js
node dist/db/bootstrap.js
```

Les exécuter dans un conteneur de maintenance temporaire sur le réseau de la
base, avec `MIGRATION_DATABASE_URL` et les mêmes options TLS/réseau. Le bootstrap
nécessite un terminal interactif. Ne pas conserver `MIGRATION_DATABASE_URL` dans
l’environnement du service API. Le conteneur applicatif ne lance aucune migration
automatiquement ; ne pas lui attribuer de privilèges de propriétaire pour cela.

## Application Dokploy

1. Choisir le dépôt `skyrosid/catalog-hevron` et la branche validée.
2. Choisir le type de build **Dockerfile**.
3. Utiliser `apps/api/Dockerfile` comme chemin et **la racine du dépôt** (`.`) comme
   contexte de build. Le monorepo et le lockfile sont nécessaires à la compilation.
4. Configurer les variables d’exécution ci-dessous, puis déployer.

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://catalog_app:MOT_DE_PASSE@HOTE_POSTGRES_INTERNE:5432/catalog
SESSION_TTL_HOURS=8
DATABASE_TLS=true
```

Avec un certificat privé, monter sa CA en lecture seule et ajouter
`DATABASE_CA_FILE=/run/certs/postgres-ca.pem`. Pour une base sans TLS uniquement
sur le réseau isolé de Dokploy, remplacer les options de transport par :

```dotenv
DATABASE_TLS=false
DATABASE_PRIVATE_NETWORK=true
```

Les secrets doivent être saisis dans l’environnement Dokploy, pas dans Git ni
dans des arguments de build Docker. L’image utilise un utilisateur non privilégié,
contient les seuls fichiers et dépendances de production de l’API et expose le
port interne 3000. Le healthcheck vérifie `/health/ready`. Aucun volume applicatif
n’est requis ; la persistance est assurée par PostgreSQL.

## Domaine et HTTPS

Créer un enregistrement DNS `A` du sous-domaine de l’API vers le serveur Dokploy.
Dans **Domains** de l’application, configurer l’hôte choisi, le chemin `/`, le
**Container Port 3000**, HTTPS et le certificat **Let’s Encrypt**. Aucun préfixe ni
réécriture de chemin n’est nécessaire. Laisser le port API accessible via Traefik,
sans publication directe via « Advanced → Ports ».

Tester `https://api.votre-domaine.fr/health/ready`, puis la connexion utilisateur.
L’API conserve `trustProxy=false` par défaut : le proxy est traité comme l’adresse
cliente pour les limites de requêtes. Avant usage par plusieurs postes, configurer
la limitation partagée sur Traefik ou les seules adresses du proxy de confiance
dans Fastify ; ne pas accepter globalement les en-têtes `X-Forwarded-For`.

Reporter ensuite cette même origine HTTPS dans `API_BASE_URL` pour les builds du
bureau et dans l’environnement GitHub `release`. Conserver ce domaine stable
pour éviter de reconstruire les clients lors d’un déplacement du serveur.

Références : [domaines Dokploy](https://docs.dokploy.com/docs/core/domains),
[connexions PostgreSQL internes](https://docs.dokploy.com/docs/core/databases/connection).

Le conteneur est préparé dans le dépôt ; aucun déploiement, changement DNS ni accès
à votre instance Dokploy n’a été effectué. La construction Docker sera vérifiée
par la CI Linux ; Docker n’est pas disponible dans l’environnement local actuel.
