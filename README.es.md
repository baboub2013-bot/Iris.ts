# Iris.ts

![Version](https://img.shields.io/badge/version-v0.1.9-5865F2?style=flat-square)

<p align="right">
  <a href="./README.md"><img src="https://flagcdn.com/w20/gb.png" width="20" height="15" alt="English"></a>
  <a href="./README.fr.md"><img src="https://flagcdn.com/w20/fr.png" width="20" height="15" alt="Français"></a>
  <a href="./README.es.md"><img src="https://flagcdn.com/w20/es.png" width="20" height="15" alt="Español"></a>
</p>

> [!WARNING]
> ## 🚧 DESARROLLO TEMPRANO / INESTABLE
> Iris.ts sigue en desarrollo activo.
>
> Se esperan bugs, parches de Discord rotos, fallos visuales, crashes, funciones incompletas y regresiones.
>
> Algunos errores pueden afectar a varias partes del plugin a la vez.
>
> **Todavía no esperes estabilidad de producción.**
>
> Las actualizaciones de Discord pueden romper funciones sin aviso.
>
> Experimenté muchos crashes durante la depuración de este plugin. Es posible que aún queden bastantes crashes o regresiones, especialmente después de una actualización de Discord.

Iris.ts es un userplugin de Vencord para personalizar localmente elementos del perfil de Discord.

Modifica localmente los datos de perfil que leen las funciones compatibles del cliente Discord; no es solo una imagen superpuesta. Por eso la interfaz nativa puede mostrar el nivel Nitro elegido, las insignias de perfil y los cosméticos compatibles desde el estado local seleccionado.

**Unlock All** también desbloquea localmente opciones cosméticas compatibles en el selector propio de Discord. Nunca concede objetos, Nitro, insignias ni permisos reales; las personas sin Iris.ts siguen viendo la cuenta normal.

También incluye **Iris Network**, un sistema opcional para compartir perfiles personalizados entre usuarios del plugin.

Los usuarios sin Iris.ts siguen viendo el perfil normal de Discord.

## Antes / Después

<table>
  <tr>
    <td align="center"><strong>Antes</strong></td>
    <td align="center"><strong>Después</strong></td>
  </tr>
  <tr>
    <td><img src="./assets/readme/before.webp" alt="Iris.ts antes" width="320"></td>
    <td><img src="./assets/readme/after.webp" alt="Iris.ts después" width="320"></td>
  </tr>
</table>

## Vistas previas adicionales

### Tooltip de insignia personalizada

<img src="./assets/readme/custom-badge-tooltip.webp" alt="Tooltip de insignia personalizada" width="260">

### Antigüedad Nitro — renderizado local del cliente

Iris.ts no solo coloca una insignia visual sobre el perfil. Proporciona localmente los datos de antigüedad Nitro que lee el cliente Discord, para que las pantallas nativas de Nitro puedan mostrar el nivel seleccionado, la fecha «Subscriber since» y el flujo de evolución de la insignia. Nada cambia del lado del servidor y otros usuarios de Discord siguen viendo el perfil real.

<table>
  <tr>
    <td align="center"><img src="./assets/readme/nitro-tenure-milestones.webp" alt="Selector de hitos Nitro de Discord mostrando Opal" width="420"><br><strong>Selector de hitos nativo</strong></td>
    <td align="center"><img src="./assets/readme/nitro-opal-overview.webp" alt="Vista Nitro de Discord mostrando una tarjeta Nitro Opal" width="420"><br><strong>Tarjeta Nitro Opal nativa</strong></td>
    <td align="center"><img src="./assets/readme/nitro-badge-evolving.webp" alt="Popup de evolución de insignia Nitro de Discord" width="220"><br><strong>Flujo de evolución de insignia</strong></td>
  </tr>
</table>

### Tooltip de nombre de usuario antiguo

<img src="./assets/readme/legacy-username-tooltip.webp" alt="Tooltip de nombre de usuario antiguo" width="320">

### Panel de cosméticos

<img src="./assets/readme/cosmetics-panel.webp" alt="Panel de cosméticos de Iris.ts" width="280">

### Panel de ajustes

<img src="./assets/readme/settings-panel.webp" alt="Panel de ajustes de Iris.ts" width="600">

### Spoofer de perfil de bot

Crea un perfil local con estilo de bot, presentación nativa **Bot / App** e insignias de aplicación nativas, incluyendo **Uses Commands** y **Supports AutoMod**. No se crea ni se modifica nada en los servidores de Discord.

<p align="center">
  <img src="./assets/readme/bot-profile-preview.png" alt="Perfil local de bot de Iris.ts con insignia App" width="500">
</p>

## Funciones

- Nombre de usuario personalizado
- Nombre para mostrar personalizado
- Biografía personalizada
- Pronombres personalizados
- Nombre de usuario antiguo personalizado
- Fecha de creación de cuenta personalizada
- Insignias de perfil estilo Discord
- Niveles de insignia Gifting Patron *(Patron, Champion, Luminary, Icon, Hero y Legend)*
- Series de insignias experimentales — Game Variety, Game Time, Streaming y Account Age *(10 niveles cada una)*
- Etiquetas de perfil *(el uso se mejorará más adelante)*
- Antigüedad Nitro personalizada
- Antigüedad de boost de servidor personalizada
- Decoraciones de avatar
- Efectos de perfil
- Nameplates
- Marcos de perfil
- Insignias personalizadas
- Unlock All para coleccionables
- Iris Network
- Perfiles compartidos entre usuarios de Iris.ts
- Herramientas de depuración
- Spoofer local de perfil de bot con insignias nativas *(Uses Commands y Supports AutoMod)*

## Todas las insignias compatibles con Iris.ts

<p align="center">
  <img src="./assets/readme/supported-badges-preview.png" alt="Vista previa de perfil de Iris.ts con insignias compatibles" width="600">
</p>

Todas las insignias de abajo se renderizan solo localmente. No conceden insignias reales de Discord ni ventajas de cuenta.

- **Principales:** Discord Staff, Partner, HypeSquad Events, HypeSquad Bravery, Brilliance y Balance, Bug Hunter nivel 1 y 2, Early Supporter, Moderator Programs Alumni, Early Verified Bot Developer, Active Developer, nombre de usuario antiguo, Quest y Orbs.
- **Antigüedad Nitro:** Nitro, Bronze, Silver, Gold, Platinum, Diamond, Emerald, Ruby y Opal.
- **Antigüedad de boost de servidor:** 1, 2, 3, 6, 9, 12, 15, 18 y 24 meses.
- **Gifting Patron:** Patron, Champion, Luminary, Icon, Hero y Legend.
- **Series experimentales:** los 10 niveles de Game Variety, Game Time, Streaming y Account Age.

## Próximamente

> **Nota:** Todas las ideas de « Próximamente » se implementarán **antes** de la actualización para móvil.

- Spoofer de mensajes oficiales de Discord *(solo local)*
- Port Android para Revenge (ver [mobile/](./mobile/))

## Registro de cambios

### v0.1.9

- Cambio de marca completo del proyecto a Iris.ts.

### v0.1.8

- Se corrigió el cierre de Discord que podía ocurrir al guardar los ajustes de Iris.ts.
- Se rediseñó la interfaz de Iris.ts.

### v0.1.7

- Se añadió este registro de cambios.

### v0.1.6

- Se terminó el spoofer local de perfil de bot.
- Se añadieron las insignias de aplicación nativas **Uses Commands** y **Supports AutoMod**.
- Se añadieron la vista previa del perfil de bot y la página de votación de la comunidad.
- Se documentó el cierre actual de Discord relacionado con guardar.

### v0.1.5

- Se añadió el spoofer de mensajes oficiales de Discord solo local a la hoja de ruta.

### v0.1.4

- Se añadió la vista previa del perfil con las insignias compatibles.

## Voto de la comunidad

¿Crees que Iris.ts es el mejor spoofer de Discord? [Vota en la página de la comunidad](https://baboub2013-bot.github.io/Iris.ts/) o reacciona directamente en la [encuesta de GitHub](https://github.com/baboub2013-bot/Iris.ts/issues/1).

## Limitaciones actuales

- Las actualizaciones de Discord pueden romper parches sin aviso.
- Algunas funciones siguen siendo experimentales.
- Iris Network sigue en desarrollo.
- La gestión de medios personalizados aún es limitada.


## Iris Network

Iris Network permite publicar opcionalmente los ajustes de perfil compatibles.

Otros clientes de Iris.ts pueden obtener esos ajustes y renderizar el perfil personalizado localmente.

Iris Network no modifica el perfil real de Discord del usuario.

### Privacidad

Iris.ts **no** requiere tu token de Discord, contraseña ni cookies.

La autenticación de red usa Discord OAuth2.

Compartir el perfil es opcional.

Solo se publican los campos de perfil compatibles al activar el uso compartido.

Los usuarios receptores pueden ocultar los medios personalizados.

## Instalación

> Iris.ts actualmente se dirige a builds de desarrollo de Vencord.

Copia el **contenido de** `src/` en:

`Vencord/src/userplugins/Iris.ts`

Después compila Vencord normalmente.

## Estructura del proyecto

- `src/` — código fuente del plugin Vencord
- `assets/readme/` — vistas previas del README
- `database/migrations/` — esquema de base de datos de Iris Network

## Base de datos de red

Iris Network usa una base de datos para sesiones de autenticación y perfiles compartidos.

El esquema inicial está disponible en:

`database/migrations/0001_init.sql`

Esta migración se usa en el backend experimental de Iris Network.

El backend de red sigue en desarrollo y su configuración puede cambiar entre versiones.

## Estado de desarrollo

Estado actual: **Experimental / Desarrollo**

Puedes esperar:

- Bugs
- Parches rotos tras actualizaciones de Discord
- Incoherencias de interfaz
- Funciones incompletas
- Regresiones
- Funciones que cambian entre versiones
- Crashes ocasionales de Discord

Los reportes de bugs son bienvenidos. **Incluye los logs de consola relevantes cuando sea posible**: hacen mucho más fácil localizar crashes y parches de Discord rotos.

## Reportar bugs

Al reportar un bug, incluye si es posible:

- Versión de Vencord
- Discord Stable / PTB / Canary
- Versión o commit de Iris.ts
- Lo que esperabas
- Lo que ocurrió realmente
- Logs de consola relevantes
- Capturas si son útiles

No incluyas tokens, cookies, sesiones OAuth ni otros datos sensibles.

## Aviso

Iris.ts no está afiliado con Discord ni con Vencord.

Iris.ts solo cambia la experiencia del cliente Discord local.

No concede insignias reales de Discord, Nitro, coleccionables, permisos ni otras ventajas de servidor.

## Licencia

GPL-3.0-or-later
