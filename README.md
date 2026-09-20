# ProfileSpoofer

> [!WARNING]
> ## 🚧 EARLY DEVELOPMENT / UNSTABLE
> ProfileSpoofer is still under active development.
>
> Bugs, broken Discord patches, visual glitches, crashes, incomplete features and regressions should be expected.
>
> Some bugs may affect multiple parts of the plugin at the same time.
>
> **Do not expect production-level stability yet.**
>
> Discord updates may break features without warning.

ProfileSpoofer is a custom Vencord userplugin for locally customizing Discord profile elements.

> This might be the best profile spoofer for Vencord.

It also includes **ProfileSpoofer Network**, an optional system allowing ProfileSpoofer users to share their customized profiles with other users of the plugin.

Users without ProfileSpoofer continue to see the normal Discord profile.

## Before / After

<table>
  <tr>
    <td align="center"><strong>Before</strong></td>
    <td align="center"><strong>After</strong></td>
  </tr>
  <tr>
    <td><img src="./assets/readme/before.webp" alt="ProfileSpoofer before" width="320"></td>
    <td><img src="./assets/readme/after.webp" alt="ProfileSpoofer after" width="320"></td>
  </tr>
</table>

## Extra previews

### Custom badge tooltip

<img src="./assets/readme/custom-badge-tooltip.webp" alt="Custom badge tooltip" width="260">

### Nitro tenure — local client rendering

ProfileSpoofer does not only place a visual badge over the profile. It locally supplies the Nitro tenure data Discord's own client reads, so the native Nitro screens can render the selected tier, subscriber-since date and badge-evolution flow. Nothing is changed server-side and other Discord users still see the real profile.

<table>
  <tr>
    <td align="center"><img src="./assets/readme/nitro-tenure-milestones.webp" alt="Discord Nitro tenure milestone picker showing Opal" width="420"><br><strong>Native milestone picker</strong></td>
    <td align="center"><img src="./assets/readme/nitro-opal-overview.webp" alt="Discord Nitro overview rendering a Nitro Opal tenure card" width="420"><br><strong>Native Nitro Opal card</strong></td>
    <td align="center"><img src="./assets/readme/nitro-badge-evolving.webp" alt="Discord Nitro badge evolution popup" width="220"><br><strong>Badge evolution flow</strong></td>
  </tr>
</table>

### Legacy username tooltip

<img src="./assets/readme/legacy-username-tooltip.webp" alt="Legacy username tooltip" width="320">

### Cosmetics panel

<img src="./assets/readme/cosmetics-panel.webp" alt="ProfileSpoofer cosmetics panel" width="280">

### Settings panel

<img src="./assets/readme/settings-panel.webp" alt="ProfileSpoofer settings panel" width="600">

## Features

- Custom username
- Custom display name
- Custom bio
- Custom pronouns
- Legacy username customization
- Account creation date customization
- Discord-style profile badges
- Nitro tenure customization
- Server boost tenure customization
- Avatar decorations
- Profile effects
- Nameplates
- Profile frames
- Custom badges
- Collectibles Unlock All
- ProfileSpoofer Network
- Shared profiles between ProfileSpoofer users
- Debug tools

## Current limitations

- **Gift badges are not supported yet.** I simply haven't bothered implementing them for now.
- Discord updates may break patches without warning.
- Some features are still experimental.
- ProfileSpoofer Network is still under development.
- Custom media handling is still limited.

## ProfileSpoofer Network

ProfileSpoofer Network allows users to optionally publish supported ProfileSpoofer profile settings.

Other ProfileSpoofer clients can retrieve those settings and render the customized profile locally.

ProfileSpoofer Network does not modify the user's actual Discord profile.

### Privacy

ProfileSpoofer does **not** require your Discord account token, password or cookies.

Network authentication uses Discord OAuth2.

Profile sharing is optional.

Only supported ProfileSpoofer profile fields are published when sharing is enabled.

Custom user-provided media can be disabled by receiving users.

## Installation

> ProfileSpoofer currently targets custom Vencord development builds.

Copy this repository into:

`Vencord/src/userplugins/ProfileSpoofer`

Then build Vencord normally.

## Network database

ProfileSpoofer Network uses a database for authentication sessions and shared profiles.

The initial database schema is available at:

`migration/0001_init.sql`

This migration is used by the experimental ProfileSpoofer Network backend.

The network backend is still under development and its setup may change between development releases.

## Development status

Current status: **Experimental / Development**

Expect:

- Bugs
- Broken patches after Discord updates
- UI inconsistencies
- Incomplete features
- Regressions
- Features changing between versions
- Occasional Discord client crashes

Bug reports are welcome.

## Reporting bugs

When reporting a bug, please include:

- Vencord version
- Discord Stable / PTB / Canary
- ProfileSpoofer version or commit
- What you expected
- What actually happened
- Relevant console logs
- Screenshots if useful

Do not include Discord tokens, cookies, OAuth session tokens or other private credentials.

## Disclaimer

ProfileSpoofer is not affiliated with Discord or Vencord.

ProfileSpoofer only changes the local Discord client experience.

It does not grant real Discord badges, Nitro, collectibles, permissions or other server-side account features.

## License

GPL-3.0-or-later
