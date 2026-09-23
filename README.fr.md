# Iris.ts

![Version](https://img.shields.io/badge/version-v0.1.10-5865F2?style=flat-square)

<p align="right">
  <a href="./README.md"><img src="https://flagcdn.com/w20/gb.png" width="20" height="15" alt="English"></a>
  <a href="./README.fr.md"><img src="https://flagcdn.com/w20/fr.png" width="20" height="15" alt="Français"></a>
  <a href="./README.es.md"><img src="https://flagcdn.com/w20/es.png" width="20" height="15" alt="Español"></a>
</p>

> [!WARNING]
> ## 🚧 DÉVELOPPEMENT PRÉCOCE / INSTABLE
> Iris.ts est encore en développement actif.
>
> Des bugs, patches Discord cassés, glitches visuels, crashes, fonctions incomplètes et régressions sont à prévoir.
>
> Certaines erreurs peuvent toucher plusieurs parties du plugin en même temps.
>
> **Ne t’attends pas encore à une stabilité de production.**
>
> Les mises à jour Discord peuvent casser des fonctions sans prévenir.
>
> J’ai rencontré beaucoup de crashes pendant le débogage de ce plugin. Il peut encore en rester pas mal, surtout après une mise à jour Discord.

Iris.ts est un userplugin Vencord qui permet de personnaliser localement des éléments de profil Discord.

Il modifie localement les données de profil que les fonctionnalités compatibles du client Discord lisent — ce n’est pas juste une image par-dessus. C’est pour ça que l’interface native peut afficher le palier Nitro choisi, les badges de profil et les cosmétiques compatibles depuis l’état local sélectionné.

**Unlock All** débloque aussi localement des choix cosmétiques compatibles dans le sélecteur Discord. Il ne donne jamais de vrais objets, Nitro, badges ou permissions ; les utilisateurs sans Iris.ts voient toujours le compte normal.

Il comprend aussi **Iris Network**, un système optionnel pour partager les profils personnalisés entre utilisateurs du plugin.

Les utilisateurs sans Iris.ts continuent de voir le profil Discord normal.

## Avant / Après

<table>
  <tr>
    <td align="center"><strong>Avant</strong></td>
    <td align="center"><strong>Après</strong></td>
  </tr>
  <tr>
    <td><img src="./assets/readme/before.webp" alt="Iris.ts avant" width="320"></td>
    <td><img src="./assets/readme/after.webp" alt="Iris.ts après" width="320"></td>
  </tr>
</table>

## Aperçus supplémentaires

### Tooltip de badge personnalisé

<img src="./assets/readme/custom-badge-tooltip.webp" alt="Tooltip de badge personnalisé" width="260">

### Ancienneté Nitro — rendu local du client

Iris.ts ne pose pas seulement un badge visuel sur le profil. Il fournit localement les données d’ancienneté Nitro que le client Discord lit, afin que les écrans Nitro natifs puissent afficher le palier choisi, la date « Subscriber since » et le flux d’évolution du badge. Rien ne change côté serveur et les autres utilisateurs Discord voient toujours le vrai profil.

<table>
  <tr>
    <td align="center"><img src="./assets/readme/nitro-tenure-milestones.webp" alt="Sélecteur des paliers Nitro Discord montrant Opal" width="420"><br><strong>Sélecteur de paliers natif</strong></td>
    <td align="center"><img src="./assets/readme/nitro-opal-overview.webp" alt="Vue Nitro Discord affichant une carte Nitro Opal" width="420"><br><strong>Carte Nitro Opal native</strong></td>
    <td align="center"><img src="./assets/readme/nitro-badge-evolving.webp" alt="Popup d’évolution du badge Nitro Discord" width="220"><br><strong>Flux d’évolution du badge</strong></td>
  </tr>
</table>

### Tooltip d’ancien pseudo

<img src="./assets/readme/legacy-username-tooltip.webp" alt="Tooltip d’ancien pseudo" width="320">

### Panneau cosmétiques

<img src="./assets/readme/cosmetics-panel.webp" alt="Panneau cosmétiques Iris.ts" width="280">

### Panneau des réglages

<img src="./assets/readme/settings-panel.webp" alt="Panneau des réglages Iris.ts" width="600">

### Spoofer de profil bot

Crée un profil local de style bot avec une présentation native **Bot / App** et les badges d’application natifs **Uses Commands** et **Supports AutoMod**. Rien n’est créé ou modifié sur les serveurs Discord.

<p align="center">
  <img src="./assets/readme/bot-profile-preview.png" alt="Profil bot local Iris.ts avec badge App" width="500">
</p>

## Fonctionnalités

- Pseudo personnalisé
- Nom d’affichage personnalisé
- Bio personnalisée
- Pronoms personnalisés
- Ancien pseudo personnalisé
- Date de création du compte personnalisée
- Badges de profil style Discord
- Paliers de badge Gifting Patron *(Patron, Champion, Luminary, Icon, Hero et Legend)*
- Séries de badges expérimentales — Game Variety, Game Time, Streaming et Account Age *(10 paliers chacune)*
- Tags de profil *(l’utilisation sera améliorée plus tard)*
- Ancienneté Nitro personnalisée
- Ancienneté de boost serveur personnalisée
- Décorations d’avatar
- Effets de profil
- Nameplates
- Cadres de profil
- Badges personnalisés
- Unlock All pour les collectibles
- Iris Network
- Profils partagés entre utilisateurs d’Iris.ts
- Outils de debug
- Spoofer de profil bot local avec badges de bot natifs *(Uses Commands et Supports AutoMod)*

## Tous les badges pris en charge par Iris.ts

<p align="center">
  <img src="./assets/readme/supported-badges-preview.png" alt="Aperçu de profil Iris.ts avec les badges pris en charge" width="600">
</p>

Tous les badges ci-dessous sont affichés uniquement localement. Ils ne donnent pas de vrais badges Discord ou d’avantages sur le compte.

- **Classiques :** Discord Staff, Partner, HypeSquad Events, HypeSquad Bravery, Brilliance et Balance, Bug Hunter niveau 1 et 2, Early Supporter, Moderator Programs Alumni, Early Verified Bot Developer, Active Developer, ancien pseudo, Quest et Orbs.
- **Ancienneté Nitro :** Nitro, Bronze, Silver, Gold, Platinum, Diamond, Emerald, Ruby et Opal.
- **Ancienneté de boost serveur :** 1, 2, 3, 6, 9, 12, 15, 18 et 24 mois.
- **Gifting Patron :** Patron, Champion, Luminary, Icon, Hero et Legend.
- **Séries expérimentales :** les 10 paliers de Game Variety, Game Time, Streaming et Account Age.

## À venir

> **Note :** Toutes les idées « À venir » seront implémentées **avant** la mise à jour téléphone.

- Spoofer de messages Discord officiels *(local uniquement)* · <kbd>Abandonné... pour maintenant.</kbd>
- Port Android pour Revenge (voir [mobile/](./mobile/))

## Changelog

### v0.1.10

- Spoofer de messages Discord officiels marqué « Abandonné... pour maintenant. »

### v0.1.9

- Rebrand complet du projet en Iris.ts.

### v0.1.8

- Correction du crash Discord qui pouvait arriver lors de la sauvegarde des réglages Iris.ts.
- Refonte de l’interface d’Iris.ts.

### v0.1.7

- Ajout de ce changelog.

### v0.1.6

- Spoofer de profil bot local terminé.
- Ajout des badges d’application natifs **Uses Commands** et **Supports AutoMod**.
- Ajout de l’aperçu du profil bot et de la page de vote communautaire.
- Documentation du crash Discord actuel lié à la sauvegarde.

### v0.1.5

- Ajout du spoofer de messages Discord officiels local-only à la roadmap.

### v0.1.4

- Ajout de l’aperçu de profil avec les badges pris en charge.

## Vote de la communauté

Tu penses qu’Iris.ts est le meilleur spoofer Discord ? [Vote sur la page communautaire](https://baboub2013-bot.github.io/Iris.ts/) ou réagis directement sur le [sondage GitHub](https://github.com/baboub2013-bot/Iris.ts/issues/1).

## Limitations actuelles

- Les mises à jour Discord peuvent casser des patches sans prévenir.
- Certaines fonctions sont encore expérimentales.
- Iris Network est encore en développement.
- La gestion des médias personnalisés reste limitée.


## Iris Network

Iris Network permet de publier optionnellement les réglages de profil pris en charge.

Les autres clients d’Iris.ts peuvent récupérer ces réglages et afficher le profil personnalisé localement.

Iris Network ne modifie pas le vrai profil Discord de l’utilisateur.

### Confidentialité

Iris.ts ne demande **jamais** ton token Discord, mot de passe ou cookies.

L’authentification réseau utilise Discord OAuth2.

Le partage de profil est optionnel.

Seuls les champs de profil pris en charge sont publiés quand le partage est activé.

Les médias personnalisés peuvent être masqués par les utilisateurs qui les reçoivent.

## Installation

> Iris.ts cible actuellement les builds Vencord de développement.

Copie le **contenu de** `src/` dans :

`Vencord/src/userplugins/Iris.ts`

Puis build Vencord normalement.

## Structure du projet

- `src/` — source du plugin Vencord
- `assets/readme/` — aperçus du README
- `database/migrations/` — schéma de base de données d’Iris Network

## Base de données réseau

Iris Network utilise une base de données pour les sessions d’authentification et les profils partagés.

Le schéma initial est disponible ici :

`database/migrations/0001_init.sql`

Cette migration est utilisée par le backend expérimental d’Iris Network.

Le backend réseau est toujours en développement et son installation peut changer entre les versions.

## État du développement

Statut actuel : **Expérimental / Développement**

À prévoir :

- Bugs
- Patches cassés après les mises à jour Discord
- Incohérences d’interface
- Fonctions incomplètes
- Régressions
- Fonctions qui évoluent entre les versions
- Crashes occasionnels de Discord

Les rapports de bugs sont les bienvenus. **Ajoute les logs de console pertinents quand c’est possible** : ça aide énormément à retrouver les crashes et les patches Discord cassés.

## Signaler un bug

Quand tu signales un bug, inclus si possible :

- Version de Vencord
- Discord Stable / PTB / Canary
- Version ou commit Iris.ts
- Ce que tu attendais
- Ce qui s’est réellement passé
- Les logs de console pertinents
- Des captures si utile

N’inclus jamais de token, cookies, session OAuth ou autre donnée sensible.

## Avertissement

Iris.ts n’est affilié ni à Discord ni à Vencord.

Iris.ts change uniquement l’expérience du client Discord local.

Il ne donne pas de vrais badges Discord, Nitro, collectibles, permissions ou autres avantages serveur.

## Licence

GPL-3.0-or-later
