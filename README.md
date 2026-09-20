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

It also includes **ProfileSpoofer Network**, an optional system allowing ProfileSpoofer users to share their customized profiles with other users of the plugin.

Users without ProfileSpoofer continue to see the normal Discord profile.

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
