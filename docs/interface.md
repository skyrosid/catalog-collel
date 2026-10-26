# Conventions d’interface

L’interface est en hébreu et en RTL. Les textes se trouvent dans
`apps/desktop/src/shared/texts.ts` et les couleurs dans les variables de `styles.css`.

## Mise en page

- `AppHeader` est commun à tous les écrans : hauteur de 72 px, fond ivoire, signature vert profond et bordure inférieure.
- L’en-tête et le contenu utilisent `app-container` : largeur maximale de 1 280 px et mêmes marges latérales.
- `PageHeader` porte l’unique titre principal d’un écran. Le catalogue utilise `CatalogMasthead`, un bandeau vert avec le nom du collel, une illustration locale et le mode d’accès.
- `EmptyState` explique une absence de contenu ; il ne propose pas de fonctions indisponibles.
- `FormActions` aligne les actions des formulaires et des confirmations de la même manière.

## Composants et rythme

- Réutiliser les composants de `components/ui` avant de créer une variante propre à une page.
- Champs et boutons standards : hauteur de 40 px. Actions compactes : variantes `sm` et `icon-sm`.
- Espacements fondés sur des multiples de 4 px ; 24 px entre les sections et dans les cartes, 32 px pour les marges principales sur grand écran.
- Typographie : Heebo pour les contrôles et Frank Ruhl Libre pour les titres. Les polices variables sont embarquées via Fontsource et fonctionnent hors ligne. Titres principaux : 30 px, jusqu’à 48 px dans le bandeau du catalogue. Corps et formulaires : 14 px ; aides et métadonnées : 12 px.
- Rayons : 8 px pour les contrôles, 12 px pour les cartes, fenêtres et menus. Les badges d’état restent arrondis.
- Le vert profond indique l’action principale ; le laiton souligne la reliure et les actions du bandeau. Le rouge indique une erreur ou une action destructive. Les fonds crème et les contours doux conservent un contraste lisible.
- Les icônes décoratives sont masquées aux lecteurs d’écran. Chaque bouton sans texte possède un libellé accessible.
- Les aides des champs sont rattachées au contrôle avec `aria-describedby`.
- Toute fenêtre modale bloque le défilement de la page en arrière-plan. Le défilement reste possible dans une fenêtre longue et ne se propage pas à la page lorsqu’elle atteint ses limites. La place de la barre de défilement reste réservée pour éviter un décalage horizontal à l’ouverture ; la fermeture rétablit le défilement sans déplacer la page.
- Le livret conserve deux pages, une reliure centrale, des repères de rayon distincts et une pagination accessible en haut et en bas. Sous 820 px, les pages se suivent verticalement et la barre de recherche passe sur deux lignes.
- L’administration conserve le même grand bandeau illustré que le catalogue. Le tableau utilise un quadrillage de feuille Excel, des lignes compactes numérotées et les quatre colonnes du fichier d’origine. Le défilement vertical appartient uniquement à la page ; la barre d’actions et les en-têtes restent visibles pendant la consultation du tableau. La hauteur de la barre d’actions est mesurée pour adapter le décalage des en-têtes lorsque les commandes passent sur plusieurs lignes.
- Les titres restent du texte. Le crayon active l’édition de la ligne, avec boutons de sauvegarde et d’annulation, Entrée pour enregistrer et Échap pour annuler. Les commandes de navigation et les autres actions restent désactivées tant qu’une ligne est en cours d’édition. Un échec de sauvegarde conserve la saisie et affiche l’erreur dans la ligne.
- L’édition conserve les largeurs de colonnes et la hauteur initiale de la ligne. Les icônes de sauvegarde et d’annulation occupent la cellule des actions existante ; les raccourcis sont décrits aux lecteurs d’écran sans ajouter de ligne d’aide visible. Une erreur peut afficher une ligne d’alerte sous la saisie.
- La suppression d’un livre ou d’une sélection demande uniquement de choisir Supprimer ou Annuler, sans recopier de titre ni de nombre.
- Un clic sur une cellule de données sélectionne sa ligne sans ouvrir de fiche. Maj+clic étend la sélection sur les lignes et sur leurs cases ; les clics sur les commandes d’édition/suppression sont exclus de cette sélection. Le modificateur est relevé sur l’événement de clic de la case, sans dépendre de l’événement `change` natif. Maj+Espace fonctionne aussi sur les cases. Un intervalle qui dépasserait 100 livres est refusé en entier, avec un message explicite. Le compteur respecte le singulier hébreu.
- La sélection conserve la hauteur de la barre d’actions : le libellé et le compteur utilisent les mêmes dimensions, et la place du bouton de désélection reste réservée lorsqu’il est masqué. Sous 820 px, l’état et les actions occupent deux rangées stables.
- Le changement de page ou du nombre de lignes par page conserve les livres sélectionnés, y compris ceux qui sortent de la page visible. Le compteur et les actions groupées portent sur toute la sélection.
- Une seule barre d’état administrative réunit la plage affichée, le total, le nombre de lignes par page et la pagination. Elle reste accessible au bas de la fenêtre pendant la consultation du tableau.

## Textes

Conserver les explications qui aident à choisir un compte, réussir une action ou comprendre ses conséquences :
activation mémorisée, création du premier administrateur, mots de passe temporaires, permissions et opérations destructives.
Présenter chaque explication une seule fois, au plus près de l’action concernée.
Éviter les slogans, les titres qui répètent le contexte et les listes de fonctions non disponibles.
Les titres et libellés n’ont pas de point final ; les phrases d’aide en ont un.
