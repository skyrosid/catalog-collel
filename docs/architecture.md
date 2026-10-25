# Architecture et sécurité

## Frontières de confiance

L’API est le seul composant disposant d’un accès PostgreSQL. Elle est déployable
indépendamment du bureau. Le renderer React ne reçoit ni secret PostgreSQL ni
jeton de session. Il utilise quatre méthodes typées du pont : `login`, `logout`,
`session` et `collel`. Il n’existe pas de pont HTTP, SQL ou IPC générique.

Le processus principal valide l’émetteur IPC (fenêtre, frame principale et origine),
valide les entrées avec Zod et appelle une origine API fixe. Il refuse les
redirections HTTP et les réponses non conformes au contrat. Les erreurs renvoyées
au renderer sont des codes fonctionnels stables ; les exceptions et secrets ne
traversent pas le pont.

Electron active sandbox, isolation du contexte et sécurité Web, sans Node.js dans
le renderer ni webview. Les permissions, téléchargements, nouvelles fenêtres et
navigations sont bloqués. Les fichiers empaquetés sont servis par le protocole
local `app://catalog`, limité au dossier du renderer, avec une CSP restrictive.
Le renderer n’a pas d’accès réseau en production. Le serveur Vite autorise
uniquement ses propres ressources et son WebSocket local en développement.

Référence : [recommandations de sécurité Electron](https://www.electronjs.org/docs/latest/tutorial/security).

## Identité et sessions

Un utilisateur possède une identité personnelle globale et une ou plusieurs
adhésions explicites à des collels. Le rôle `admin` ou `user` est attaché à
l’adhésion, jamais au compte global : un administrateur de Hevron n’obtient aucun
droit implicite ailleurs. L’API revalide la session et ses adhésions à chaque requête.
`requireMembership` sert de garde commune et peut exiger le rôle administrateur
pour les futures routes d’administration.

Les mots de passe sont hachés avec Argon2id : mémoire 19 MiB, deux itérations,
parallélisme 1, sel généré par la bibliothèque. La création exige au moins 15
caractères. Une connexion inexistante effectue également une vérification de hash ;
la réponse ne distingue pas compte absent et mot de passe erroné. Les requêtes de
connexion sont limitées à cinq par minute et par IP sur une instance d’API.

La session utilise un jeton aléatoire de 256 bits ; seule son empreinte SHA-256 est
stockée en base. Le jeton reste en mémoire dans le processus principal, sans
localStorage, fichier ni cookie. Il disparaît à la fermeture ; la session serveur
est révoquée à la déconnexion et expire après huit heures par défaut (maximum 24).
Une fermeture brutale ou une déconnexion hors réseau laisse la session serveur
expirer naturellement. Les sessions expirées sont purgées aux connexions ; prévoir
un entretien périodique si le volume devient important.

## Isolation PostgreSQL

Deux schémas évitent de confondre données de catalogue et données d’authentification :

- `app.collels` contient les établissements avec RLS activé et forcé. Sans contexte
  de session et de collel valide, aucune ligne n’est visible au rôle d’exécution.
- `private.users`, `private.sessions` et `private.memberships` contiennent l’identité
  et les autorisations. Le rôle d’exécution n’a aucun accès direct à ce schéma.
  Des fonctions `SECURITY DEFINER` bornées permettent la connexion et la résolution
  d’une session. Elles fixent leur `search_path` et révoquent l’exécution publique.

Chaque opération de catalogue s’exécute dans `inTenant` : une transaction réserve
une connexion et configure **localement** l’empreinte de session et le collel. Les
valeurs disparaissent à COMMIT/ROLLBACK. La politique exige le collel courant et
`app.has_access`, qui recontrôle session, expiration, utilisateur actif et adhésion
dans la base. Modifier un identifiant dans le client ou réutiliser un ancien objet
de session ne permet donc pas de franchir cette frontière.

Le propriétaire des objets conserve une politique de maintenance explicite ; il
exécute les migrations et le bootstrap. L’API refuse de démarrer avec ce compte,
un superutilisateur, un rôle `BYPASSRLS`, un rôle disposant de pouvoirs de création
ou de membres hérités. Elle exige `catalog_app`, sans propriété des tables. Les
fonctions d’authentification sont une frontière privilégiée du backend : les
identifiants de ce rôle ne doivent jamais être distribués aux utilisateurs.

Des triggers différés imposent un administrateur **actif** au moins par collel et
une adhésion au moins par utilisateur, y compris lors des suppressions,
rétrogradations et désactivations. Les mutations d’autorisation sont sérialisées
par verrou transactionnel, ce qui privilégie la simplicité et l’intégrité pour ces
opérations peu fréquentes. Le bootstrap crée les trois objets atomiquement.

Référence : [politiques RLS PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## Règles pour les futurs modules

Toute table métier devra porter `collel_id NOT NULL`, un index commençant par le
collel, et des relations composites `(collel_id, id)` empêchant les références
entre établissements. Activer et forcer le RLS avec `app.has_access` et le contexte
transactionnel ; les écritures administrateur devront aussi exiger
`app.has_access(collel_id, 'admin')` dans `USING`/`WITH CHECK`. Accorder uniquement
les privilèges requis. Ne pas ajouter de politique permissive globale.

Chaque route devra revalider la session, exiger l’adhésion et le rôle requis,
valider les entrées et employer une transaction de collel avec SQL paramétré.
Ajouter des tests pour un second établissement, un utilisateur standard et une
autorisation retirée, sans se limiter à masquer les boutons de l’interface.

## Interfaces et erreurs

L’interface est uniquement en hébreu : `lang="he"` et `dir="rtl"` sont fixes.
Un simple objet TypeScript dans `apps/desktop/src/shared/texts.ts` centralise tous
les textes et le titre de fenêtre, avec typage des codes d’erreur. Les espacements
utilisent les axes logiques et les identifiants ont `dir="auto"`.
Les polices système évitent les téléchargements externes. shadcn/ui fournit les
composants locaux, modifiables et configurés par `components.json` ; Tailwind 4
est intégré au build Vite. Aucun état métier ni cache persistant n’est introduit.

L’API limite la taille et la durée des requêtes, ajoute les en-têtes Helmet et
`Cache-Control: no-store`, produit un identifiant de requête et ne retourne pas les
détails SQL ni traces. Les logs n’enregistrent pas les corps, jetons ou cookies.
La frontière React affiche un message localisé en cas d’erreur de rendu.
