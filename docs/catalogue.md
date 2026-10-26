# Catalogue des livres

Le visiteur consulte un livret RTL et recherche par titre, auteur ou sujet. Le titre,
l’auteur, le sujet et le rayon sont affichés directement dans des fiches sans clic.
L’administrateur dispose d’une feuille quadrillée, avec en-têtes fixes, numéros de
ligne et colonnes dans l’ordre du fichier Excel : rayon, titre, sujet, auteur.
Le titre n’ouvre aucune fiche ; le bouton crayon permet de modifier directement
les quatre champs de la ligne, sans changer la largeur des colonnes ni sa hauteur.
Les icônes de sauvegarde et d’annulation remplacent les actions habituelles dans
la même cellule. Entrée enregistre, Échap annule. Une erreur de
validation ou un conflit conserve la saisie ; il faut enregistrer ou annuler
avant de changer la recherche, le tri ou la page.
La barre d’actions permet de déplacer, modifier l’auteur/le sujet ou supprimer
plusieurs livres. La sélection est conservée entre les pages et lors d’un changement
du nombre de lignes affichées, jusqu’à 100 livres, même pour les livres hors de la page visible ;
un nouveau tri, une nouvelle recherche ou un rafraîchissement la réinitialise.
Un clic sur une ligne la sélectionne sans ouvrir de fiche. Maj+clic étend la sélection
sur les lignes ou leurs cases à cocher ; Maj+Espace fonctionne aussi sur les cases.
Les plages qui dépasseraient la limite sont rejetées en entier.
Les pages proposent 12, 24 ou 48 livres. Le classement initial est alphabétique par titre ; le sujet,
l’auteur et l’emplacement sont également disponibles.

## Fiches et classement physique

Le titre est obligatoire. L’auteur, le sujet et l’emplacement peuvent rester vides
lorsque l’information n’est pas connue ; l’interface le signale. Le repère de rayon
est du texte : `ב - 6`, `49-א` et `80- 88` restent intacts. L’emplacement visible et
le modèle Excel utilisent uniquement le numéro de rayon du fichier du collel,
sans ajouter de champ physique supposé. La recherche ignore les voyelles et accents
hébreux et accepte plusieurs mots, y compris répartis entre titre, auteur et sujet.

Un doublon exact dans le catalogue importé possède les mêmes titre, auteur, sujet et rayon
dans le même collel. Deux éditions ou exemplaires qui diffèrent sur ces champs
peuvent coexister. Les modifications et déplacements augmentent un numéro de
version : une fiche modifiée ou supprimée depuis son affichage provoque un conflit
explicite, sans écraser la modification précédente. Un déplacement groupé est
transactionnel ; une seule fiche périmée annule l’ensemble de ce déplacement.
Les modifications et suppressions groupées sont également transactionnelles :
les fiches sont verrouillées et toutes les versions sont vérifiées avant toute
écriture. Une fiche périmée, absente ou appartenant à un autre collel annule
l’ensemble de l’action. La suppression individuelle ou groupée utilise une fenêtre
avec les boutons Supprimer et Annuler, sans saisie de confirmation. Le titre du
livre ou le nombre de livres concernés est indiqué dans la fenêtre.
La modification ne touche que les champs explicitement cochés.

## Import Excel

Le bouton d’import ouvre le sélecteur natif Electron. Le fichier reste local
pendant l’analyse et l’aperçu. Seules les fiches validées sont transmises à l’API
lorsque l’administrateur confirme l’import.

Le format existant du collel est accepté directement :

| Colonne    | Donnée                           | Obligatoire dans chaque fiche |
| ---------- | -------------------------------- | ----------------------------- |
| `מספר מדף` | Repère de rayon, texte ou nombre | Non                           |
| `שם ספר`   | Titre                            | Oui                           |
| `הנושא`    | Sujet                            | Non                           |
| `שם מחבר`  | Auteur                           | Non                           |

Les quatre en-têtes sont requis dans la première ligne, dans n’importe quel ordre.
Les variantes `מדף`, `שם הספר`, `נושא`, `מחבר` sont reconnues. Le bouton de modèle
enregistre un fichier vide avec ces quatre colonnes, une ligne d’en-tête figée et le RTL.

Limites : `.xlsx`, 5 Mo, 10 000 lignes de livres, un seul onglet de données, sans
formule, date, hyperlien ou cellule d’erreur dans les colonnes importées. Les lignes
vides sont ignorées. Les anomalies sont rattachées au numéro de ligne Excel et
bloquent l’import entier ; les informations facultatives absentes sont comptées
dans l’aperçu mais ne bloquent pas l’opération. L’aperçu affiche les cinq premières
fiches et le nombre total de livres reconnus.

L’API valide de nouveau toutes les fiches et importe le lot dans une transaction.
Les doublons exacts sont ignorés, y compris ceux du fichier lui-même. Le résultat
indique les ajouts et les doublons ; les fiches existantes ne sont jamais remplacées.
On peut donc relancer un import dont la réponse a été perdue sans créer de doublons.
Le fichier d’exemple du collel a été vérifié en local avec ses 2 215 fiches ; il
n’est pas inclus dans le dépôt ni chargé automatiquement dans une base distante.

## API et déploiement

Appliquer `pnpm db:migrate` avec le compte de maintenance avant de déployer cette
version. La migration `005_catalog.sql` crée `app.books`, ses index et ses politiques
RLS. Chaque livre porte `collel_id` ; sa clé primaire est `(collel_id, id)`. La
suppression d’un collel supprime aussi ses livres.

Les routes sont sous `/v1/collels/:collelId/books` : liste et fiche en GET, ajout en
POST, modification en PATCH et suppression en DELETE sur `/:id`, déplacement en
POST `/move`, import en POST `/import`.
Les actions groupées passent par POST `/bulk` et sont limitées à 100 références
uniques avec leur numéro de version. Les écritures exigent le rôle administrateur
dans le service et dans PostgreSQL. La session et ses droits sont revérifiés à
chaque requête ; un administrateur d’un autre collel ou le super-administrateur
de plateforme ne reçoit aucun accès implicite.

Le renderer utilise uniquement les capacités typées du preload. La lecture Excel
et les dialogues de fichier restent dans le processus principal. Aucun chemin de
fichier arbitraire ni jeton de session n’est exposé au renderer.

Les tests `catalog.db.test.ts` utilisent les migrations réelles et des rôles
PostgreSQL distincts avec PGlite. Ils vérifient CRUD, recherche, pagination, tri,
doublons, conflits de version, transaction de déplacement, droits visiteur et
isolation entre collels. Les tests desktop vérifient le format hébreu, les repères
composés, les cellules absentes, les erreurs de ligne et le modèle Excel.
