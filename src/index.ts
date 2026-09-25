/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { UserStore } from "@webpack/common";

import {
    installBotSpoofOverride,
    uninstallBotSpoofOverride
} from "./botRuntime";
import {
    clearNetworkBadgeProvider,
    getNetworkAvatarDecorationForUser,
    getNetworkAvatarDecorationURL,
    getNetworkDisplayNameOverride,
    getNetworkNameplateHook,
    patchNetworkUserProfile,
    registerNetworkBadgeProvider,
    startNetworkRendering,
    stopNetworkRendering
} from "./networkRuntime";
import {
    enqueueMessageHook,
    installOfficialMessages,
    uninstallOfficialMessages
} from "./officialMessages";
import {
    applyProfileChanges,
    clearBadgeProvider,
    getAvatarDecorationForUser,
    getAvatarDecorationURL as getLocalAvatarDecorationURL,
    getDisplayNameOverride as getLocalDisplayNameOverride,
    getNameplateHook as getLocalNameplateHook,
    getNitroSinceHook,
    installCreationDateOverride,
    installNameplateOverrides,
    patchUser,
    patchUserProfile,
    registerBadgeProvider,
    uninstallCreationDateOverride,
    uninstallNameplateOverrides
} from "./profileRuntime";
import { settings } from "./settings";
import managedStyle from "./styles.css?managed";
import {
    refreshRemoteProfiles,
    startNetworkSync,
    stopNetworkSync,
    syncOwnProfileIfNeeded
} from "./sync";
import {
    installProfileTagOverride,
    uninstallProfileTagOverride
} from "./tagRuntime";
import {
    disableUnlockAll,
    enableUnlockAll
} from "./unlockAll";

function getOwnUserId() {
    return UserStore
        .getCurrentUser()
        ?.id ?? null;
}

function isOwnUser(
    userId?: string | null
) {
    const ownId =
        getOwnUserId();

    return (
        !!ownId &&
        !!userId &&
        ownId === userId
    );
}

export default definePlugin({
    name: "Iris",

    description:
        "Locally customise and spoof Discord profile elements.",

    authors: [
        {
            name: "Iris",
            id: 0n
        }
    ],

    tags: [
        "Appearance",
        "Customisation"
    ],

    dependencies: [
        "BadgeAPI"
    ],

    settings,

    managedStyle,

    patches: [
        {
            find:
                ".getCurrentUser()",

            replacement: {
                match:
                    /getUser\((\i)\)\{([\s\S]+?)return (\i);/,

                replace:
                    "getUser($1){$2return $self.patchUserResult($3);"
            }
        },

        {
            find:
                ".useName(",

            replacement: {
                match:
                    /(?<=function \i\(\i\)\{)(?=let)/,

                replace:
                    "const _psName=$self.getDisplayNameOverride(arguments[0]);if(_psName!=null)return _psName;"
            }
        },

        {
            find:
                ".getGlobalName(",

            replacement: {
                match:
                    /getGlobalName\((\i)\)\{/,

                replace:
                    "getGlobalName($1){const _psName=$self.getDisplayNameOverride($1);if(_psName!=null)return _psName;"
            }
        },

        {
            find:
                "UserProfileStore",

            replacement: {
                match:
                    /(?<=getUserProfile\(\i\){return )(.+?)(?=})/,

                replace:
                    "$self.profilePatchHook($1)"
            }
        },

        {
            find:
                "isAvatarDecorationAnimating:",

            group:
                true,

            replacement: [
                {
                    match:
                        /(?<=\.avatarDecoration,guildId:\i\}\)\),)(?<=user:(\i).+?)/,

                    replace:
                        "psAvatarDecoration=$self.getAvatarDecorationHook($1),"
                },

                {
                    match:
                        /(?<={avatarDecoration:).{1,20}?(?=,)(?<=avatarDecorationOverride:(\i).+?)/,

                    replace:
                        "$1??psAvatarDecoration??($&)"
                },

                {
                    match:
                        /(?<=size:\i\}\),\[)/,

                    replace:
                        "psAvatarDecoration,"
                }
            ]
        },

        {
            find:
                ".DISPLAY_NAME_STYLES_COACHMARK)",

            replacement: {
                match:
                    /(?<=\i\)\({avatarDecoration:)\i(?=,)(?<=currentUser:(\i).+?)/,

                replace:
                    "$self.getAvatarDecorationHook($1)??$&"
            }
        },

        ...[
            "#{intl::GUILD_COMMUNICATION_DISABLED_ICON_TOOLTIP_BODY}",
            "#{intl::COLLECTIBLES_NAMEPLATE_PREVIEW_A11Y}",
            "#{intl::COLLECTIBLES_PROFILE_PREVIEW_A11Y}"
        ].map(
            find => ({
                find,

                replacement: {
                    match:
                        /(?<=userValue:)((\i(?:\.author)?)\?\.avatarDecoration)/,

                    replace:
                        "$self.getAvatarDecorationHook($2)??$1"
                }
            })
        ),

        {
            find:
                "getAvatarDecorationURL:",

            replacement: {
                match:
                    /(?<=function \i\((\i)\)\{)(?=.{0,20}let{avatarDecoration)/,

                replace:
                    "const _psDecorationUrl=$self.getAvatarDecorationURL(arguments[0]);if(_psDecorationUrl)return _psDecorationUrl;"
            }
        },

        {
            /*
             * Send queue for the composer.
             *
             *   log("Queueing message to be sent LogId:...")
             *   queue.enqueue(payload, callback)
             *
             * Wrapped so a message typed in the local Discord
             * conversation never enters the queue, and is
             * confirmed locally instead. Every other channel
             * is enqueued untouched.
             */
            find:
                "Queueing message to be sent",

            replacement: {
                match:
                    /(\i\.info\(`Queueing message to be sent LogId:\$\{\i\}`\),)(\i\.\i)\.enqueue\((\i),/,

                replace:
                    "$1$self.enqueueMessageHook($2,$3,"
            }
        },

        {
            /*
             * Discord's Xb(): start date of the current user's
             * Nitro subscription, shown in the native Nitro card.
             * Reads the REAL subscription first:
             *
             *   n=p(e?.id);return t??n
             *
             * Wrapped so the spoofed "Subscriber since" date is
             * used (self only: Xb() is the current user's).
             */
            find:
                "2026-08-nitro-tenure-badge-withheld-state",

            replacement: {
                match:
                    /(\.premiumSince:null\},\[\i\]\),\i=\i\(\i\?\.id\);return )(\i\?\?\i)(?=\})/,

                replace:
                    "$1$self.getNitroSinceHook($2)"
            }
        },

        {
            find:
                "collectibles?.nameplate)??",

            replacement: {
                match:
                    /return\s*(\(0,\i\.\i\))\((\i)\?\.collectibles\?\.nameplate\)\?\?(\i)(\??\.nameplate)/,

                replace:
                    "return $self.getNameplateHook($1($2?.collectibles?.nameplate)??$3$4,$3,$1)"
            }
        }
    ],

    flux: {
        CONNECTION_OPEN() {
            void applyProfileChanges();

            void syncOwnProfileIfNeeded(
                true
            );

            refreshRemoteProfiles(
                false
            );
        }
    },

    start() {
        registerBadgeProvider();

        registerNetworkBadgeProvider();

        installCreationDateOverride();

        installNameplateOverrides();

        /*
         * Profile Tag: own user record only.
         */
        installProfileTagOverride();

        /*
         * Local bot spoofer: own user record only.
         */
        installBotSpoofOverride();

        /*
         * Local fake DM with the official Discord account.
         */
        installOfficialMessages();

        startNetworkRendering();

        startNetworkSync();

        if (
            settings.store.unlockAll
        ) {
            enableUnlockAll();
        }

        void applyProfileChanges();

        if (
            settings.store.debugLogs
        ) {
            console.info(
                "[Iris.ts] Started"
            );
        }
    },

    stop() {
        stopNetworkSync();

        stopNetworkRendering();

        clearNetworkBadgeProvider();

        clearBadgeProvider();

        uninstallCreationDateOverride();

        uninstallNameplateOverrides();

        uninstallProfileTagOverride();

        uninstallBotSpoofOverride();

        uninstallOfficialMessages();

        disableUnlockAll();

        if (
            settings.store.debugLogs
        ) {
            console.info(
                "[Iris.ts] Stopped"
            );
        }
    },

    patchUserResult<
        T extends {
            id?: string;
        } | null | undefined
    >(
        user: T
    ): T {
        if (
            !user?.id ||
            !isOwnUser(
                user.id
            )
        ) {
            return user;
        }

        return patchUser(
            user as any
        ) as T;
    },

    getDisplayNameOverride(
        user?: {
            id?: string;
        } | null
    ) {
        if (
            !user?.id
        ) {
            return null;
        }

        if (
            isOwnUser(
                user.id
            )
        ) {
            return getLocalDisplayNameOverride(
                user
            );
        }

        return getNetworkDisplayNameOverride(
            user
        );
    },

    profilePatchHook(
        profile:
            Parameters<
                typeof patchUserProfile
            >[0]
    ) {
        if (
            !profile
        ) {
            return profile;
        }

        if (
            profile.userId &&
            isOwnUser(
                profile.userId
            )
        ) {
            return patchUserProfile(
                profile
            );
        }

        return patchNetworkUserProfile(
            profile
        );
    },

    getAvatarDecorationHook(
        user?: {
            id?: string;
        } | null
    ) {
        if (
            !user?.id
        ) {
            return undefined;
        }

        if (
            isOwnUser(
                user.id
            )
        ) {
            return getAvatarDecorationForUser(
                user.id
            );
        }

        return getNetworkAvatarDecorationForUser(
            user.id
        );
    },

    getAvatarDecorationURL(
        data:
            Parameters<
                typeof getLocalAvatarDecorationURL
            >[0]
    ) {
        const remote =
            getNetworkAvatarDecorationURL(
                data
            );

        if (
            remote
        ) {
            return remote;
        }

        return getLocalAvatarDecorationURL(
            data
        );
    },

    enqueueMessageHook,

    getNitroSinceHook,

    getNameplateHook(
        originalNameplate:
            unknown,

        user?: {
            id?: string;
        } | null,

        convert?:
            unknown
    ) {
        if (
            !user?.id
        ) {
            return originalNameplate;
        }

        if (
            isOwnUser(
                user.id
            )
        ) {
            return getLocalNameplateHook(
                originalNameplate,
                user,
                convert
            );
        }

        return getNetworkNameplateHook(
            originalNameplate,
            user,
            convert
        );
    },

    toolboxActions: {
        "Refresh Iris.ts"() {
            void applyProfileChanges();

            void syncOwnProfileIfNeeded(
                true
            );

            refreshRemoteProfiles(
                true
            );
        }
    }
});
