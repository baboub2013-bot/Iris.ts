/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    addProfileBadge,
    BadgePosition,
    type ProfileBadge,
    removeProfileBadge
} from "@api/Badges";
import type { UserProfile } from "@vencord/discord-types";
import {
    FluxDispatcher,
    UserStore
} from "@webpack/common";
import virtualMerge from "virtual-merge";

import {
    badgeIcon,
    BADGES,
    BOOST_TIERS,
    DECORATIONS,
    getNativeNitroBadge,
    getNitroSince,
    withNativeNitroBadge
} from "./catalog";
import {
    getSharedProfile,
    type SharedProfile,
    subscribeRemoteProfiles
} from "./sync";

interface AvatarDecorationOverride {
    asset: string;
    skuId: string;
    expires_at: null;
}

interface StoredNameplate {
    skuId: string;
    asset: string;
    label: string;
    palette: string;
}

interface CollectibleNameplate {
    skuId: string;
    label: string;
    palette: string;
    asset: string;
}

interface ResolvedNameplate {
    skuId: string;
    src: string;
    imgAlt: string;

    palette: {
        darkBackground: string;
        lightBackground: string;
        name: string;
    };
}

type NameplateConverter = (
    nameplate: CollectibleNameplate
) => unknown;

interface NameplateCacheEntry {
    key: string;
    converter: unknown;
    value: unknown;
}

interface DecorationCacheEntry {
    key: string;
    value: AvatarDecorationOverride | undefined;
}

interface ProfileMergeCacheEntry {
    key: string;
    value: UserProfile;
}

const COLLECTIBLES_PATH =
    "/assets/collectibles/";

const NETWORK_DECORATION_PREFIX =
    "profile-spoofer-network-";

const DEFAULT_NAMEPLATE_PALETTE =
    "cobalt";

const NAMEPLATE_PALETTES:
    Record<string, ResolvedNameplate["palette"]> =
{
    crimson: {
        darkBackground: "#7A0B17",
        lightBackground: "#D32030",
        name: "crimson"
    },

    berry: {
        darkBackground: "#7D1D56",
        lightBackground: "#C8438E",
        name: "berry"
    },

    sky: {
        darkBackground: "#0866A8",
        lightBackground: "#55A9E8",
        name: "sky"
    },

    teal: {
        darkBackground: "#08776A",
        lightBackground: "#45B7A5",
        name: "teal"
    },

    forest: {
        darkBackground: "#176A37",
        lightBackground: "#46A967",
        name: "forest"
    },

    bubble_gum: {
        darkBackground: "#9D2F72",
        lightBackground: "#F957B3",
        name: "bubble_gum"
    },

    violet: {
        darkBackground: "#730BC8",
        lightBackground: "#972FED",
        name: "violet"
    },

    cobalt: {
        darkBackground: "#0131C2",
        lightBackground: "#4278FF",
        name: "cobalt"
    },

    clover: {
        darkBackground: "#047B20",
        lightBackground: "#63CD5A",
        name: "clover"
    },

    lemon: {
        darkBackground: "#F6CD12",
        lightBackground: "#FED400",
        name: "lemon"
    },

    white: {
        darkBackground: "#FFFFFF",
        lightBackground: "#FFFFFF",
        name: "white"
    },

    black: {
        darkBackground: "#000000",
        lightBackground: "#000000",
        name: "black"
    },

    none: {
        darkBackground: "#5865F2",
        lightBackground: "#7983F5",
        name: "profile-spoofer"
    }
};

const BOOST_MONTHS:
    Record<string, number> =
{
    "1": 1,
    "2": 2,
    "3": 3,
    "6": 6,
    "9": 9,
    "12": 12,
    "15": 15,
    "18": 18,
    "24": 24
};

let networkBadgeProvider:
    ProfileBadge |
    null =
    null;

let unsubscribeRemoteProfiles:
    (() => void) |
    null =
    null;

const nameplateCache =
    new Map<
        string,
        NameplateCacheEntry
    >();

const decorationCache =
    new Map<
        string,
        DecorationCacheEntry
    >();

const profileMergeCache =
    new WeakMap<
        object,
        ProfileMergeCacheEntry
    >();

function getOwnUserId() {
    return UserStore
        .getCurrentUser()
        ?.id ??
        null;
}

function isSelf(
    userId?:
        string |
        null
) {
    const ownId =
        getOwnUserId();

    return (
        !!ownId &&
        !!userId &&
        ownId === userId
    );
}

function getRemoteProfile(
    userId?:
        string |
        null
):
    SharedProfile |
    null {
    if (
        !userId ||
        isSelf(
            userId
        )
    ) {
        return null;
    }

    return getSharedProfile(
        userId
    );
}

function monthsAgo(
    months: number
) {
    const date =
        new Date();

    date.setMonth(
        date.getMonth() -
        Math.max(
            months,
            0
        )
    );

    return date;
}

/*
 * =====================================================
 * BADGES
 * =====================================================
 */

function badgeDescription(
    id: string,
    profile: SharedProfile
) {
    if (
        id ===
        "legacy_username" &&
        profile.spoofLegacyUsername
            ?.trim()
    ) {
        return (
            "Originally known as " +
            profile.spoofLegacyUsername.trim()
        );
    }

    return BADGES.find(
        badge =>
            badge.id === id
    )?.name ?? id;
}

function buildRemoteBadges(
    userId: string,
    profile: SharedProfile
):
    ProfileBadge[] {
    const result:
        ProfileBadge[] =
        [];

    let index =
        0;

    const selected =
        Array.isArray(
            profile.selectedBadges
        )
            ? profile.selectedBadges
            : [];

    for (
        const id
        of selected
    ) {
        const badge =
            BADGES.find(
                entry =>
                    entry.id === id
            );

        if (
            !badge
        ) {
            continue;
        }

        result.push({
            id:
                `profile-spoofer-network-${userId}-${id}-${index++}`,

            description:
                badgeDescription(
                    id,
                    profile
                ),

            iconSrc:
                badgeIcon(
                    badge.iconHash
                ),

            position:
                BadgePosition.START
        });
    }

    /*
     * Nitro badge: injected as a REAL Discord badge in the
     * profile patch (native hover card), not here.
     */

    const boostTier =
        profile.boostTier ??
        "none";

    const boost =
        BOOST_TIERS.find(
            entry =>
                entry.id ===
                boostTier
        );

    if (
        boostTier !==
        "none" &&
        boost?.iconHash
    ) {
        result.push({
            id:
                `profile-spoofer-network-${userId}-boost-${index++}`,

            description:
                `Server Booster (${boost.name})`,

            iconSrc:
                badgeIcon(
                    boost.iconHash
                ),

            position:
                BadgePosition.END
        });
    }

    return result;
}

export function registerNetworkBadgeProvider() {
    if (
        networkBadgeProvider
    ) {
        return;
    }

    networkBadgeProvider = {
        id:
            "profile-spoofer-network-provider",

        getBadges({
            userId
        }) {
            const profile =
                getRemoteProfile(
                    userId
                );

            if (
                !profile
            ) {
                return [];
            }

            return buildRemoteBadges(
                userId,
                profile
            );
        }
    };

    addProfileBadge(
        networkBadgeProvider
    );
}

export function clearNetworkBadgeProvider() {
    if (
        !networkBadgeProvider
    ) {
        return;
    }

    removeProfileBadge(
        networkBadgeProvider
    );

    networkBadgeProvider =
        null;
}

/*
 * =====================================================
 * AVATAR DECORATIONS
 * =====================================================
 */

function getDecorationKey(
    profile: SharedProfile
) {
    return JSON.stringify({
        selectedDecoration:
            profile.selectedDecoration ??
            "none",

        unlockedDecorationAsset:
            profile.unlockedDecorationAsset ??
            ""
    });
}

function buildRemoteDecoration(
    userId: string,
    profile: SharedProfile
):
    AvatarDecorationOverride |
    undefined {
    const selected =
        profile.selectedDecoration
            ?.trim();

    if (
        selected &&
        selected !==
        "none"
    ) {
        const decoration =
            DECORATIONS.find(
                entry =>
                    entry.id ===
                    selected
            );

        if (
            decoration?.asset
        ) {
            return {
                asset:
                    decoration.asset,

                skuId:
                    `${NETWORK_DECORATION_PREFIX}${userId}`,

                expires_at:
                    null
            };
        }
    }

    const unlockedAsset =
        profile.unlockedDecorationAsset
            ?.trim();

    if (
        unlockedAsset
    ) {
        return {
            asset:
                unlockedAsset,

            skuId:
                `${NETWORK_DECORATION_PREFIX}${userId}`,

            expires_at:
                null
        };
    }

    return undefined;
}

export function getNetworkAvatarDecorationForUser(
    userId?:
        string |
        null
):
    AvatarDecorationOverride |
    undefined {
    if (
        !userId
    ) {
        return undefined;
    }

    const profile =
        getRemoteProfile(
            userId
        );

    if (
        !profile
    ) {
        return undefined;
    }

    const key =
        getDecorationKey(
            profile
        );

    const cached =
        decorationCache.get(
            userId
        );

    if (
        cached &&
        cached.key === key
    ) {
        return cached.value;
    }

    const value =
        buildRemoteDecoration(
            userId,
            profile
        );

    decorationCache.set(
        userId,
        {
            key,
            value
        }
    );

    return value;
}

export function getNetworkAvatarDecorationURL(
    data: {
        avatarDecoration?: {
            asset?: string;
            skuId?: string;
        } | null;

        canAnimate?: boolean;
    } | null | undefined
):
    string |
    undefined {
    const decoration =
        data?.avatarDecoration;

    if (
        !decoration?.skuId
            ?.startsWith(
                NETWORK_DECORATION_PREFIX
            ) ||
        !decoration.asset
            ?.trim()
    ) {
        return undefined;
    }

    const suffix =
        data?.canAnimate === false
            ? "?passthrough=false"
            : "";

    return (
        "https://cdn.discordapp.com/" +
        `avatar-decoration-presets/${decoration.asset.trim()}.png${suffix}`
    );
}

/*
 * =====================================================
 * NAMEPLATES
 * =====================================================
 */

function normalizeNameplateAsset(
    value: unknown
):
    string {
    if (
        typeof value !==
        "string"
    ) {
        return "";
    }

    let asset =
        value.trim();

    if (
        !asset
    ) {
        return "";
    }

    if (
        /^https?:\/\//i.test(
            asset
        )
    ) {
        const index =
            asset.indexOf(
                COLLECTIBLES_PATH
            );

        if (
            index === -1
        ) {
            return "";
        }

        asset =
            asset.slice(
                index +
                COLLECTIBLES_PATH.length
            );
    }

    asset =
        asset
            .split("?")[0]
            .replace(
                /^\/+/,
                ""
            )
            .replace(
                /[^/]+\.(?:png|webp|gif|apng|jpe?g|webm|mp4)$/i,
                ""
            );

    if (
        !asset
    ) {
        return "";
    }

    if (
        !asset.endsWith(
            "/"
        )
    ) {
        asset += "/";
    }

    return asset;
}

function normalizeNameplatePalette(
    value: unknown
):
    string {
    const palette =
        typeof value ===
            "string"
            ? value
                .trim()
                .toLowerCase()
            : "";

    if (
        !palette ||
        palette === "none"
    ) {
        return DEFAULT_NAMEPLATE_PALETTE;
    }

    if (
        palette ===
        "bubblegum"
    ) {
        return "bubble_gum";
    }

    return palette;
}

function getStoredNameplate(
    profile: SharedProfile
):
    StoredNameplate |
    undefined {
    const raw =
        profile.nameplate
            ?.trim();

    if (
        !raw ||
        raw === "none"
    ) {
        return undefined;
    }

    let parsed:
        Record<string, unknown>;

    try {
        parsed =
            JSON.parse(
                raw
            ) as Record<
                string,
                unknown
            >;
    } catch {
        return undefined;
    }

    const skuId =
        String(
            parsed.skuId ??
            parsed.sku_id ??
            ""
        ).trim();

    const asset =
        normalizeNameplateAsset(
            parsed.asset
        ) ||
        normalizeNameplateAsset(
            parsed.preview
        );

    if (
        !skuId ||
        !asset
    ) {
        return undefined;
    }

    return {
        skuId,
        asset,

        label:
            typeof parsed.label ===
                "string"
                ? parsed.label
                : "",

        palette:
            normalizeNameplatePalette(
                parsed.palette
            )
    };
}

function resolvePaletteObject(
    name: string
):
    ResolvedNameplate["palette"] {
    return (
        NAMEPLATE_PALETTES[
        name
        ] ??
        {
            darkBackground:
                "#000000",

            lightBackground:
                "#000000",

            name
        }
    );
}

function buildRemoteNameplate(
    profile: SharedProfile,
    convert: unknown
):
    unknown {
    const stored =
        getStoredNameplate(
            profile
        );

    if (
        !stored
    ) {
        return null;
    }

    const collectible:
        CollectibleNameplate =
    {
        skuId:
            stored.skuId,

        label:
            stored.label,

        palette:
            stored.palette,

        asset:
            stored.asset
    };

    if (
        typeof convert ===
        "function"
    ) {
        try {
            const converted =
                (
                    convert as
                    NameplateConverter
                )(
                    collectible
                );

            if (
                converted &&
                typeof converted ===
                "object"
            ) {
                const record =
                    converted as
                    Record<string, unknown>;

                if (
                    !record.skuId
                ) {
                    return {
                        ...record,

                        skuId:
                            collectible.skuId
                    };
                }

                return converted;
            }
        } catch {
            // fallback below
        }
    }

    const fallback:
        ResolvedNameplate =
    {
        skuId:
            collectible.skuId,

        src:
            collectible.asset,

        imgAlt:
            collectible.label,

        palette:
            resolvePaletteObject(
                collectible.palette
            )
    };

    return fallback;
}

export function getNetworkNameplateHook(
    originalNameplate:
        unknown,

    user?: {
        id?: string;
    } | null,

    convert?:
        unknown
):
    unknown {
    const userId =
        user?.id;

    if (
        !userId
    ) {
        return originalNameplate;
    }

    const profile =
        getRemoteProfile(
            userId
        );

    if (
        !profile
    ) {
        return originalNameplate;
    }

    const key =
        profile.nameplate ??
        "";

    const cached =
        nameplateCache.get(
            userId
        );

    if (
        cached &&
        cached.key === key &&
        cached.converter === convert
    ) {
        return (
            cached.value ??
            originalNameplate
        );
    }

    const value =
        buildRemoteNameplate(
            profile,
            convert
        );

    nameplateCache.set(
        userId,
        {
            key,
            converter:
                convert,
            value
        }
    );

    return (
        value ??
        originalNameplate
    );
}

/*
 * =====================================================
 * DISPLAY NAME
 * =====================================================
 */

export function getNetworkDisplayNameOverride(
    user?: {
        id?: string;
    } | null
):
    string |
    null {
    const profile =
        getRemoteProfile(
            user?.id
        );

    if (
        !profile
    ) {
        return null;
    }

    return (
        profile.spoofDisplayName
            ?.trim() ||
        profile.spoofUsername
            ?.trim() ||
        null
    );
}

/*
 * =====================================================
 * PROFILE
 * =====================================================
 */

function getProfilePatchKey(
    profile: SharedProfile
) {
    return JSON.stringify({
        spoofBio:
            profile.spoofBio ??
            "",

        spoofPronouns:
            profile.spoofPronouns ??
            "",

        spoofLegacyUsername:
            profile.spoofLegacyUsername ??
            "",

        profileEffect:
            profile.profileEffect ??
            "none",

        profileFrame:
            profile.profileFrame ??
            "none",

        replaceRealBadges:
            profile.replaceRealBadges ??
            false,

        nitroTier:
            profile.nitroTier ??
            "none",

        boostTier:
            profile.boostTier ??
            "none"
    });
}

export function patchNetworkUserProfile(
    profile:
        UserProfile |
        null |
        undefined
):
    UserProfile |
    null |
    undefined {
    if (
        !profile?.userId ||
        isSelf(
            profile.userId
        )
    ) {
        return profile;
    }

    const shared =
        getRemoteProfile(
            profile.userId
        );

    if (
        !shared
    ) {
        return profile;
    }

    const key =
        getProfilePatchKey(
            shared
        );

    const cached =
        profileMergeCache.get(
            profile as object
        );

    if (
        cached &&
        cached.key === key
    ) {
        return cached.value;
    }

    const patches:
        Partial<UserProfile> &
        Record<string, unknown> =
        {};

    const bio =
        shared.spoofBio
            ?.trim();

    if (
        bio
    ) {
        patches.bio =
            bio;
    }

    const pronouns =
        shared.spoofPronouns
            ?.trim();

    if (
        pronouns
    ) {
        patches.pronouns =
            pronouns;
    }

    const legacy =
        shared.spoofLegacyUsername
            ?.trim();

    if (
        legacy
    ) {
        patches.legacyUsername =
            legacy;
    }

    const effect =
        shared.profileEffect
            ?.trim();

    if (
        effect &&
        effect !==
        "none"
    ) {
        patches.profileEffect = {
            skuId:
                effect
        };

        patches.profileEffectId =
            effect;
    }

    const frame =
        shared.profileFrame
            ?.trim();

    if (
        frame &&
        frame !==
        "none"
    ) {
        patches.profileFrame = {
            skuId:
                frame
        };
    }

    if (
        shared.replaceRealBadges
    ) {
        patches.badges =
            [];
    }

    const nitroTier =
        shared.nitroTier ??
        "none";

    if (
        nitroTier !==
        "none"
    ) {
        patches.premiumType =
            Math.max(
                Number(
                    profile.premiumType ??
                    0
                ),
                2
            );

        const since =
            getNitroSince(
                nitroTier
            );

        if (
            since
        ) {
            patches.premiumSince =
                since;

            const badge =
                getNativeNitroBadge(
                    nitroTier,
                    since
                );

            if (
                badge
            ) {
                patches.badges =
                    withNativeNitroBadge(
                        patches.badges ??
                        profile.badges,
                        badge
                    ) as UserProfile["badges"];
            }
        }
    }

    const boostTier =
        shared.boostTier ??
        "none";

    const boostMonths =
        BOOST_MONTHS[
        boostTier
        ];

    if (
        boostTier !==
        "none" &&
        typeof boostMonths ===
        "number"
    ) {
        patches.premiumGuildSince =
            monthsAgo(
                boostMonths
            );
    }

    if (
        Object.keys(
            patches
        ).length ===
        0
    ) {
        return profile;
    }

    const merged =
        virtualMerge(
            profile,
            patches as UserProfile
        );

    profileMergeCache.set(
        profile as object,
        {
            key,
            value:
                merged
        }
    );

    return merged;
}

/*
 * =====================================================
 * REFRESH
 * =====================================================
 */

function refreshRemoteUsers(
    userIds: string[]
) {
    for (
        const userId
        of userIds
    ) {
        nameplateCache.delete(
            userId
        );

        decorationCache.delete(
            userId
        );

        const user =
            UserStore.getUser(
                userId
            );

        if (
            user
        ) {
            try {
                FluxDispatcher.dispatch({
                    type:
                        "USER_UPDATE",

                    user
                });
            } catch {
                // ignore
            }
        }

        try {
            FluxDispatcher.dispatch({
                type:
                    "USER_PROFILE_UPDATE",

                userId
            });
        } catch {
            // ignore
        }
    }
}

export function startNetworkRendering() {
    if (
        unsubscribeRemoteProfiles
    ) {
        return;
    }

    unsubscribeRemoteProfiles =
        subscribeRemoteProfiles(
            refreshRemoteUsers
        );
}

export function stopNetworkRendering() {
    unsubscribeRemoteProfiles?.();

    unsubscribeRemoteProfiles =
        null;

    nameplateCache.clear();
    decorationCache.clear();
}
