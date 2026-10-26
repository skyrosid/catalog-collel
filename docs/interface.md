# Conventions d’interface

L’interface est en hébreu et en RTL. Les textes se trouvent dans
`apps/desktop/src/shared/texts.ts` et les couleurs dans les variables de `styles.css`.

## Mise en page

- `AppHeader` est commun à tous les écrans : hauteur de 72 px, fond ivoire et bordure inférieure.
- L’en-tête et le contenu utilisent `app-container` : largeur maximale de 1 280 px et mêmes marges latérales.
- `PageHeader` porte l’unique titre principal d’un écran. Un sous-titre précise le contexte seulement si nécessaire.
- `EmptyState` explique une absence de contenu ; il ne propose pas de fonctions indisponibles.
- `FormActions` aligne les actions des formulaires et des confirmations de la même manière.

## Composants et rythme

- Réutiliser les composants de `components/ui` avant de créer une variante propre à une page.
- Champs et boutons standards : hauteur de 40 px. Actions compactes : variantes `sm` et `icon-sm`.
- Espacements fondés sur des multiples de 4 px ; 24 px entre les sections et dans les cartes, 32 px pour les marges principales sur grand écran.
- Titres principaux : 30 px, police de titre. Corps et formulaires : 14 px ; aides et métadonnées : 12 px.
- Rayons : 8 px pour les contrôles, 12 px pour les cartes, fenêtres et menus. Les badges d’état restent arrondis.
- Le brun indique l’action principale, le vert un état validé et le rouge une erreur ou une action destructive.
- Les icônes décoratives sont masquées aux lecteurs d’écran. Chaque bouton sans texte possède un libellé accessible.
- Les aides des champs sont rattachées au contrôle avec `aria-describedby`.

## Textes

Conserver les explications qui aident à choisir un compte, réussir une action ou comprendre ses conséquences :
activation mémorisée, création du premier administrateur, mots de passe temporaires, permissions et opérations destructives.
Présenter chaque explication une seule fois, au plus près de l’action concernée.
Éviter les slogans, les titres qui répètent le contexte et les listes de fonctions non disponibles.
Les titres et libellés n’ont pas de point final ; les phrases d’aide en ont un.
