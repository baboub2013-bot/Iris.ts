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
import type {
    User,
    UserProfile
} from "@vencord/discord-types";
import { waitFor } from "@webpack";
import {
    FluxDispatcher,
    GuildMemberStore,
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
import { settings } from "./settings";

/*
 * =====================================================
 * TYPES
 * =====================================================
 */

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

/*
 * Formats measured on YOUR client (console report, real
 * users with a nameplate in the member list):
 *
 * user.collectibles.nameplate  (stored on the user record)
 * {
 *     skuId: "1462116614131548265",
 *     label: "COLLECTIBLES_GOTHICA_NEVERMORE_NP_A11Y",
 *     palette: "white",
 *     asset: "nameplates/gothica/nevermore/"
 * }
 *
 * user.nameplate  (resolved, what the renderer reads)
 * {
 *     skuId: "1462116614131548265",
 *     src: "nameplates/gothica/nevermore/",
 *     imgAlt: "COLLECTIBLES_GOTHICA_NEVERMORE_NP_A11Y",
 *     palette: { darkBackground, lightBackground, name }
 * }
 *
 * member.collectibles was null for those users.
 */
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

interface NameplateCache {
    key: string;

    converter: unknown;

    value: unknown;
}

/*
 * =====================================================
 * CONSTANTS
 * =====================================================
 */

const BADGE_DESCRIPTIONS:
    Record<string, string> =
{
    staff:
        "Discord Staff",

    partner:
        "Partnered Server Owner",

    hypesquad_events:
        "HypeSquad Events",

    bug_hunter_1:
        "Discord Bug Hunter",

    hypesquad_bravery:
        "HypeSquad Bravery",

    hypesquad_brilliance:
        "HypeSquad Brilliance",

    hypesquad_balance:
        "HypeSquad Balance",

    early_supporter:
        "Early Nitro Supporter",

    bug_hunter_2:
        "Discord Bug Hunter",

    verified_developer:
        "Early Verified Bot Developer",

    moderator_alumni:
        "Moderator Programs Alumni",

    active_developer:
        "Active Developer",

    legacy_username:
        "Originally known as #0000",

    quest_completed:
        "Quest Completed",

    orbs_apprentice:
        "Collected the Orb Profile Badge"
};

const BOOST_META:
    Record<string, number> =
{
    none: -1,

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

/*
 * =====================================================
 * STATE
 * =====================================================
 */

let ownUserId:
    string |
    null =
    null;

let badgeProvider:
    ProfileBadge |
    null =
    null;

/*
 * =====================================================
 * USER ID
 * =====================================================
 */

function getOwnUserId():
    string |
    null {
    if (
        ownUserId
    ) {
        return ownUserId;
    }

    ownUserId =
        UserStore
            .getCurrentUser()
            ?.id ??
        null;

    return ownUserId;
}

function isSelf(
    userId?:
        string |
        null
):
    boolean {
    const id =
        getOwnUserId();

    return (
        !!id &&
        !!userId &&
        id === userId
    );
}

/*
 * =====================================================
 * GENERIC HELPERS
 * =====================================================
 */

function selectedBadgeIds():
    string[] {
    const selected =
        settings.store
            .selectedBadges;

    return Array.isArray(
        selected
    )
        ? selected
        : [];
}

function badgeDescription(
    id: string
):
    string {
    if (
        id ===
        "legacy_username"
    ) {
        const legacy =
            settings.store
                .spoofLegacyUsername
                ?.trim();

        if (
            legacy
        ) {
            return (
                "Originally known as " +
                legacy
            );
        }
    }

    return (
        BADGE_DESCRIPTIONS[id] ??
        BADGES.find(
            badge =>
                badge.id === id
        )?.name ??
        id
    );
}

function monthsAgo(
    months: number
):
    Date {
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

function buildBadges():
    ProfileBadge[] {
    const result:
        ProfileBadge[] =
        [];

    let index =
        0;

    /*
     * Custom badges.
     */
    if (
        settings.store
            .customBadgesEnabled ??
        true
    ) {
        for (
            const badge
            of settings.store
                .customBadges ??
            []
        ) {
            if (
                !badge?.enabled ||
                !badge.name
                    ?.trim() ||
                !badge.image
                    ?.trim()
            ) {
                continue;
            }

            result.push({
                id:
                    `iris-custom-${badge.id}-${index++}`,

                description:
                    badge.tooltip
                        ?.trim() ||
                    badge.name
                        .trim(),

                iconSrc:
                    badge.image
                        .trim(),

                position:
                    BadgePosition.END,

                props: {
                    style: {
                        width: "20px",
                        height: "20px",
                        objectFit: "contain",
                        borderRadius: "3px"
                    }
                }
            });
        }
    }

    /*
     * Fake Discord badges.
     *
     * VISUAL ONLY.
     *
     * We DO NOT spoof publicFlags because doing that
     * triggers Discord Staff internals and produces
     * the infamous NOT STAFF thing.
     */
    for (
        const id
        of selectedBadgeIds()
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
                `iris-${id}-${index++}`,

            description:
                badgeDescription(
                    id
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
     * Nitro badge: injected as a REAL Discord badge in
     * patchUserProfile (native hover card), not here.
     */

    /*
     * Booster badge.
     */
    const boostTier =
        settings.store
            .boostTier ??
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
                `iris-boost-${index++}`,

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

export function registerBadgeProvider() {
    if (
        badgeProvider
    ) {
        return;
    }

    /*
     * Cache the real current account ID before
     * any profile UI starts requesting badges.
     */
    getOwnUserId();

    badgeProvider = {
        id:
            "iris-provider",

        getBadges({
            userId
        }) {
            /*
             * ABSOLUTE self-only check.
             */
            if (
                !isSelf(
                    userId
                )
            ) {
                return [];
            }

            return buildBadges();
        }
    };

    addProfileBadge(
        badgeProvider
    );
}

export function clearBadgeProvider() {
    if (
        !badgeProvider
    ) {
        return;
    }

    removeProfileBadge(
        badgeProvider
    );

    badgeProvider =
        null;
}

/*
 * =====================================================
 * AVATAR DECORATION
 * =====================================================
 */

function getAvatarDecorationOverride():
    AvatarDecorationOverride |
    undefined {
    const selected =
        settings.store
            .selectedDecoration
            ?.trim();

    if (
        !selected ||
        selected ===
        "none"
    ) {
        /*
         * Decoration picked in Discord's own editor with
         * Unlock All (not part of decorations.json).
         */
        const unlockedAsset =
            settings.store
                .unlockedDecorationAsset
                ?.trim();

        if (
            unlockedAsset
        ) {
            return {
                asset:
                    unlockedAsset,

                skuId:
                    "iris-unlocked",

                expires_at:
                    null
            };
        }

        return undefined;
    }

    const decoration =
        DECORATIONS.find(
            entry =>
                entry.id ===
                selected
        );

    if (
        !decoration?.asset
    ) {
        return undefined;
    }

    return {
        asset:
            decoration.asset,

        skuId:
            `iris-${decoration.id}`,

        expires_at:
            null
    };
}

export function getAvatarDecorationForUser(
    userId?:
        string |
        null
) {
    if (
        !isSelf(
            userId
        )
    ) {
        return undefined;
    }

    return (
        getAvatarDecorationOverride()
    );
}

export function getAvatarDecorationURL(
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

    /*
     * We only process decorations created by
     * Iris.ts.
     *
     * Never hijack a real decoration belonging
     * to another user.
     */
    if (
        !decoration?.skuId
            ?.startsWith(
                "iris-"
            )
    ) {
        return undefined;
    }

    const override =
        getAvatarDecorationOverride();

    if (
        !override ||
        decoration.skuId !==
        override.skuId ||
        decoration.asset !==
        override.asset
    ) {
        return undefined;
    }

    const suffix =
        data?.canAnimate ===
            false

            ? "?passthrough=false"

            : "";

    return (
        "https://cdn.discordapp.com/" +
        `avatar-decoration-presets/${override.asset}.png${suffix}`
    );
}

/*
 * =====================================================
 * NAMEPLATE
 * =====================================================
 *
 * Member list resolver (patched in index.tsx):
 *
 *   return convert(member?.collectibles?.nameplate) ?? user.nameplate
 *
 * convert() takes the camelCase collectible
 * { skuId, label, palette, asset } and returns the
 * resolved { skuId, src, imgAlt, palette: {...} }.
 *
 * ROOT CAUSE of the invisible nameplate: the previous
 * version fed the converter snake_case `sku_id`, so the
 * resolved object came out WITHOUT `skuId`
 * (your report: { src, imgAlt, palette }), and the
 * renderer drew nothing. Now the converter gets the exact
 * camelCase input and `skuId` is enforced on the result.
 */

const COLLECTIBLES_PATH =
    "/assets/collectibles/";

/*
 * Palette colors for the fallback resolved object
 * (used only if Discord's converter is not available).
 */
const NAMEPLATE_PALETTES:
    Record<
        string,
        {
            darkBackground: string;
            lightBackground: string;
            name: string;
        }
    > =
{
    crimson: {
        darkBackground: "#900007",
        lightBackground: "#E7040F",
        name: "crimson"
    },

    berry: {
        darkBackground: "#893A99",
        lightBackground: "#B11FCF",
        name: "berry"
    },

    sky: {
        darkBackground: "#0080B7",
        lightBackground: "#56CCFF",
        name: "sky"
    },

    teal: {
        darkBackground: "#086460",
        lightBackground: "#7DEED7",
        name: "teal"
    },

    forest: {
        darkBackground: "#2D5401",
        lightBackground: "#6AA624",
        name: "forest"
    },

    bubble_gum: {
        darkBackground: "#DC3E97",
        lightBackground: "#F957B3",
        name: "bubble_gum"
    },

    bubblegum: {
        darkBackground: "#DC3E97",
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
        name: "iris"
    }
};

/*
 * Fallback palette if the shop entry had none.
 * Must be one of Discord's palette names (string).
 */
const DEFAULT_NAMEPLATE_PALETTE =
    "cobalt";

/*
 * Cached result.
 *
 * The resolver can run inside a store selector
 * (useStateFromStores / useSyncExternalStore).
 * Returning a NEW object on every call makes React think
 * the snapshot changed forever, which loops and ends in
 * "Well, this is awkward". We return the SAME object
 * until the saved setting changes.
 */
const nameplateCache =
    new Map<
        unknown,
        NameplateCache
    >();

/*
 * Accepts every shape the selector may have stored and
 * returns Discord's raw asset directory format:
 *
 *   "nameplates/nameplates/twilight/"
 *
 * - full CDN URL  -> path after /assets/collectibles/
 * - file path     -> parent directory
 * - no trailing / -> trailing / added
 */
function normalizeNameplateAsset(
    value:
        unknown
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
        asset +=
            "/";
    }

    return asset;
}

function normalizeNameplatePalette(
    value:
        unknown
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
        palette ===
        "none"
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

function getStoredNameplate():
    StoredNameplate |
    undefined {
    const raw =
        settings.store
            .nameplate
            ?.trim();

    if (
        !raw ||
        raw ===
        "none"
    ) {
        return undefined;
    }

    let parsed:
        Record<
            string,
            unknown
        >;

    try {
        parsed =
            JSON.parse(
                raw
            ) as
            Record<
                string,
                unknown
            >;
    } catch {
        /*
         * Old settings that only stored a SKU cannot be
         * rendered: the renderer needs the asset path.
         * Re-select the nameplate in the settings.
         */
        return undefined;
    }

    if (
        !parsed ||
        typeof parsed !==
        "object"
    ) {
        return undefined;
    }

    const skuId =
        String(
            parsed.skuId ??
            parsed.sku_id ??
            ""
        ).trim();

    /*
     * The selector stores `asset` (from the shop item) and
     * `preview` (a CDN URL). Either can give us the path.
     */
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

function getCollectibleNameplate():
    CollectibleNameplate |
    null {
    const selected =
        getStoredNameplate();

    if (
        !selected
    ) {
        return null;
    }

    return {
        skuId:
            selected.skuId,

        label:
            selected.label,

        palette:
            selected.palette,

        asset:
            selected.asset
    };
}

function resolvePaletteObject(
    name:
        string
): ResolvedNameplate["palette"] {
    const known =
        NAMEPLATE_PALETTES[
        name
        ];

    if (
        known
    ) {
        return known;
    }

    return {
        darkBackground:
            "#000000",

        lightBackground:
            "#000000",

        name
    };
}

function buildSpoofedNameplate(
    convert:
        unknown
):
    unknown {
    const collectible =
        getCollectibleNameplate();

    if (
        !collectible
    ) {
        return null;
    }

    /*
     * Preferred path: Discord's own converter, fed the
     * exact camelCase shape it expects.
     */
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
                    Record<
                        string,
                        unknown
                    >;

                /*
                 * Real resolved nameplates always carry skuId.
                 */
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
        } catch (
        error
        ) {
            if (
                settings.store
                    .debugLogs
            ) {
                console.warn(
                    "[Iris.ts] Nameplate converter failed, using fallback shape",
                    error
                );
            }
        }
    }

    /*
     * Fallback: exact resolved shape measured on your client.
     */
    const resolved:
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

    return resolved;
}

function getSpoofedNameplate(
    convert:
        unknown
):
    unknown {
    const key =
        settings.store
            .nameplate ??
        "";

    const cached =
        nameplateCache.get(
            convert
        );

    if (
        cached &&
        cached.key ===
        key
    ) {
        return cached.value;
    }

    const value =
        buildSpoofedNameplate(
            convert
        );

    /*
     * One cache entry per converter (Method 1 passes
     * Discord's converter, Method 2 may not have it yet).
     */
    nameplateCache.set(
        convert,
        {
            key,

            converter:
                convert,

            value
        }
    );

    if (
        settings.store
            .debugLogs
    ) {
        console.info(
            "[Iris.ts] Nameplate resolved",
            {
                stored:
                    key,

                usedDiscordConverter:
                    typeof convert ===
                    "function",

                value
            }
        );
    }

    return value;
}

/*
 * Called by the member-list resolver patch in index.tsx.
 *
 * originalNameplate: what Discord resolved on its own
 * user:              the user of the row being rendered
 * convert:           Discord's raw -> resolved converter
 *
 * Any user that is not the current account gets
 * Discord's original value back, untouched.
 */
export function getNameplateHook(
    originalNameplate:
        unknown,

    user?: {
        id?: string;
    } | null,

    convert?:
        unknown
):
    unknown {
    if (
        !isSelf(
            user?.id
        )
    ) {
        return originalNameplate;
    }

    if (
        typeof convert ===
        "function"
    ) {
        lastNameplateConverter =
            convert;
    }

    const spoofed =
        getSpoofedNameplate(
            convert
        );

    return spoofed ??
        originalNameplate;
}

/*
 * =====================================================
 * NAMEPLATE - METHOD 2 (user record)
 * =====================================================
 *
 * Your report showed the member list reads the nameplate
 * from the USER record (user.nameplate /
 * user.collectibles.nameplate); member.collectibles is null
 * for real users. So Method 2 overrides those two getters
 * on MY user record only.
 *
 * (The GuildMemberStore wrapper of the previous version was
 * removed: real members have no collectibles, and faking
 * one there was unnecessary.)
 *
 * Self-only, client-side, stable object identity (no render
 * loops), every step in try/catch.
 */

/*
 * Discord's converter, captured the first time Method 1
 * is called. Lets Method 2 produce the exact resolved
 * object too.
 */
let lastNameplateConverter:
    unknown =
    null;

interface HybridCache {
    key: string;

    value: Record<
        string,
        unknown
    > | null;
}

let hybridCache:
    HybridCache |
    null =
    null;

/*
 * user.collectibles.nameplate in the exact format Discord
 * stores on real user records.
 */
function getHybridNameplate():
    Record<
        string,
        unknown
    > | null {
    const key =
        settings.store
            .nameplate ??
        "";

    if (
        hybridCache &&
        hybridCache.key ===
        key
    ) {
        return hybridCache.value;
    }

    const collectible =
        getCollectibleNameplate();

    const value =
        collectible
            ? {
                ...collectible
            }
            : null;

    hybridCache = {
        key,
        value
    };

    return value;
}

/*
 * ---------- Method 2: my user record ----------
 */

interface PatchedUserEntry {
    target: Record<
        string,
        unknown
    >;

    hadOwnCollectibles: boolean;

    /*
     * Live value (the setter can replace it).
     */
    getOriginalCollectibles: () => unknown;
}

const patchedUsers =
    new WeakSet<object>();

let patchedUserEntries:
    PatchedUserEntry[] =
    [];

const collectiblesCache =
    new WeakMap<
        object,
        {
            key: string;
            value: unknown;
        }
    >();

let emptyCollectiblesCache:
    {
        key: string;
        value: unknown;
    } | null =
    null;

function buildCollectibles(
    original:
        unknown
):
    unknown {
    const nameplate =
        getHybridNameplate();

    if (
        !nameplate
    ) {
        return original;
    }

    const key =
        settings.store
            .nameplate ??
        "";

    if (
        original &&
        typeof original ===
        "object"
    ) {
        const cached =
            collectiblesCache.get(
                original
            );

        if (
            cached &&
            cached.key ===
            key
        ) {
            return cached.value;
        }

        const value = {
            ...(
                original as
                Record<
                    string,
                    unknown
                >
            ),

            nameplate
        };

        collectiblesCache.set(
            original,
            {
                key,
                value
            }
        );

        return value;
    }

    if (
        emptyCollectiblesCache &&
        emptyCollectiblesCache.key ===
        key
    ) {
        return emptyCollectiblesCache.value;
    }

    emptyCollectiblesCache = {
        key,

        value: {
            nameplate
        }
    };

    return emptyCollectiblesCache.value;
}

function findPrototypeGetter(
    object:
        object,

    property:
        string
):
    (
        (
            this: unknown
        ) => unknown
    ) | undefined {
    let proto =
        Object.getPrototypeOf(
            object
        );

    while (
        proto
    ) {
        const descriptor =
            Object.getOwnPropertyDescriptor(
                proto,
                property
            );

        if (
            descriptor
        ) {
            return descriptor.get;
        }

        proto =
            Object.getPrototypeOf(
                proto
            );
    }

    return undefined;
}

function applySelfUserNameplate() {
    try {
        const user =
            UserStore.getCurrentUser() as
            unknown as
            Record<
                string,
                unknown
            > |
            null |
            undefined;

        if (
            !user ||
            patchedUsers.has(
                user
            ) ||
            !isSelf(
                user.id as
                string
            ) ||
            !Object.isExtensible(
                user
            )
        ) {
            return;
        }

        const ownDescriptor =
            Object.getOwnPropertyDescriptor(
                user,
                "collectibles"
            );

        if (
            ownDescriptor &&
            !ownDescriptor.configurable
        ) {
            return;
        }

        const protoCollectibles =
            ownDescriptor
                ? undefined
                : findPrototypeGetter(
                    user,
                    "collectibles"
                );

        let originalCollectibles:
            unknown =
            ownDescriptor
                ? (
                    "value" in ownDescriptor
                        ? ownDescriptor.value
                        : ownDescriptor.get?.call(
                            user
                        )
                )
                : protoCollectibles
                    ? undefined
                    : user.collectibles;

        const nameplateGetter =
            findPrototypeGetter(
                user,
                "nameplate"
            );

        const ownNameplate =
            Object.getOwnPropertyDescriptor(
                user,
                "nameplate"
            );

        if (
            ownNameplate &&
            !ownNameplate.configurable
        ) {
            return;
        }

        const originalNameplateValue =
            ownNameplate &&
                "value" in ownNameplate
                ? ownNameplate.value
                : undefined;

        Object.defineProperty(
            user,
            "collectibles",
            {
                configurable:
                    true,

                enumerable:
                    true,

                get() {
                    const base =
                        protoCollectibles
                            ? protoCollectibles.call(
                                user
                            )
                            : originalCollectibles;

                    return buildCollectibles(
                        base
                    );
                },

                set(
                    value: unknown
                ) {
                    originalCollectibles =
                        value;
                }
            }
        );

        Object.defineProperty(
            user,
            "nameplate",
            {
                configurable:
                    true,

                enumerable:
                    false,

                get() {
                    const spoofed =
                        getSpoofedNameplate(
                            lastNameplateConverter
                        );

                    if (
                        spoofed != null
                    ) {
                        return spoofed;
                    }

                    return nameplateGetter
                        ? nameplateGetter.call(
                            user
                        )
                        : originalNameplateValue;
                }
            }
        );

        patchedUsers.add(
            user
        );

        patchedUserEntries.push({
            target:
                user,

            hadOwnCollectibles:
                !!ownDescriptor,

            getOriginalCollectibles: () =>
                originalCollectibles
        });

        /*
         * Keep only recent records (old ones are
         * garbage once UserStore replaces them).
         */
        if (
            patchedUserEntries.length >
            5
        ) {
            patchedUserEntries =
                patchedUserEntries.slice(
                    -5
                );
        }

        if (
            settings.store
                .debugLogs
        ) {
            console.info(
                "[Iris.ts] Nameplate method 2 applied to own user record"
            );
        }
    } catch (
    error
    ) {
        if (
            settings.store
                .debugLogs
        ) {
            console.warn(
                "[Iris.ts] Nameplate method 2 failed",
                error
            );
        }
    }
}

function restoreSelfUserNameplate() {
    for (
        const entry
        of patchedUserEntries
    ) {
        try {
            delete entry.target.nameplate;
            delete entry.target.collectibles;

            if (
                entry.hadOwnCollectibles
            ) {
                Object.defineProperty(
                    entry.target,
                    "collectibles",
                    {
                        configurable:
                            true,

                        enumerable:
                            true,

                        writable:
                            true,

                        value:
                            entry.getOriginalCollectibles()
                    }
                );
            }
        } catch {
            // record already replaced by Discord
        }
    }

    patchedUserEntries =
        [];
}

/*
 * ---------- lifecycle ----------
 */

function emitNameplateChanges() {
    setTimeout(
        () => {
            for (
                const store
                of [
                    UserStore,
                    GuildMemberStore
                ] as unknown as Array<{
                    emitChange?: () => void;
                }>
            ) {
                try {
                    store?.emitChange?.();
                } catch {
                    // ignore
                }
            }
        },
        0
    );
}

/*
 * Forces a NEW user record for my account.
 *
 * Method 2 changes what my record returns, but not the
 * record itself. Components that only re-render when
 * UserStore gives them a different object (the account
 * panel bottom-left) kept showing the previous nameplate
 * until Ctrl+R. This swaps my record for a copy, exactly
 * like a real profile update does, then notifies
 * UserStore. Self only; every step is checked and
 * reverted if anything looks wrong.
 */
function refreshSelfUserRecord() {
    try {
        const store =
            UserStore as unknown as {
                getUsers?: () => unknown;
                getCurrentUser: () => unknown;
            };

        const current =
            store.getCurrentUser() as
            Record<
                string,
                unknown
            > |
            null |
            undefined;

        const id =
            current?.id as
            string |
            undefined;

        if (
            !current ||
            !id ||
            !isSelf(
                id
            )
        ) {
            return;
        }

        const users =
            store.getUsers?.() as
            Record<
                string,
                unknown
            > |
            null |
            undefined;

        if (
            !users ||
            typeof users !==
            "object" ||
            users[id] !==
            current
        ) {
            return;
        }

        const clone =
            Object.assign(
                Object.create(
                    Object.getPrototypeOf(
                        current
                    )
                ),
                current
            ) as Record<
                string,
                unknown
            >;

        /*
         * Object.assign copied my collectibles getter as a
         * plain value: put the REAL original back, Method 2
         * re-applies the spoof on the new record.
         */
        const entry =
            patchedUserEntries.find(
                candidate =>
                    candidate.target ===
                    current
            );

        if (
            entry
        ) {
            if (
                entry.hadOwnCollectibles
            ) {
                clone.collectibles =
                    entry.getOriginalCollectibles();
            } else {
                delete clone.collectibles;
            }
        }

        if (
            clone.id !==
            id
        ) {
            return;
        }

        users[id] =
            clone;

        if (
            store.getCurrentUser() !==
            clone
        ) {
            /*
             * UserStore does not read from this map:
             * revert, nothing changed.
             */
            users[id] =
                current;

            if (
                settings.store
                    .debugLogs
            ) {
                console.info(
                    "[Iris.ts] Own user record refresh skipped (UserStore map not writable)"
                );
            }

            return;
        }

        applySelfUserNameplate();

        emitNameplateChanges();

        if (
            settings.store
                .debugLogs
        ) {
            console.info(
                "[Iris.ts] Own user record refreshed for new nameplate"
            );
        }
    } catch (
    error
    ) {
        if (
            settings.store
                .debugLogs
        ) {
            console.warn(
                "[Iris.ts] Own user record refresh failed",
                error
            );
        }
    }
}

let lastRefreshedNameplateKey:
    string |
    null =
    null;

function onNameplateUserUpdate(
    action: {
        user?: {
            id?: string;
        };
    }
) {
    applySelfUserNameplate();

    if (
        !isSelf(
            action?.user?.id
        )
    ) {
        return;
    }

    const key =
        settings.store
            .nameplate ??
        "";

    if (
        key !==
        lastRefreshedNameplateKey
    ) {
        lastRefreshedNameplateKey =
            key;

        /*
         * After the current dispatch finishes.
         */
        setTimeout(
            refreshSelfUserRecord,
            0
        );

        return;
    }

    emitNameplateChanges();
}

const NAMEPLATE_REFRESH_EVENTS = [
    "USER_UPDATE",
    "CURRENT_USER_UPDATE"
] as const;

let nameplateOverridesInstalled =
    false;

export function installNameplateOverrides() {
    if (
        nameplateOverridesInstalled
    ) {
        return;
    }

    nameplateOverridesInstalled =
        true;

    lastRefreshedNameplateKey =
        settings.store
            .nameplate ??
        "";

    applySelfUserNameplate();

    try {
        UserStore.addChangeListener(
            applySelfUserNameplate
        );
    } catch {
        // ignore
    }

    for (
        const event
        of NAMEPLATE_REFRESH_EVENTS
    ) {
        FluxDispatcher.subscribe(
            event,
            onNameplateUserUpdate
        );
    }

    emitNameplateChanges();
}

export function uninstallNameplateOverrides() {
    if (
        !nameplateOverridesInstalled
    ) {
        return;
    }

    nameplateOverridesInstalled =
        false;

    for (
        const event
        of NAMEPLATE_REFRESH_EVENTS
    ) {
        FluxDispatcher.unsubscribe(
            event,
            onNameplateUserUpdate
        );
    }

    try {
        UserStore.removeChangeListener(
            applySelfUserNameplate
        );
    } catch {
        // ignore
    }

    restoreSelfUserNameplate();

    emitNameplateChanges();
}


/*
 * =====================================================
 * PREMIUM
 * =====================================================
 */

function getPremiumType(
    realPremium:
        number
):
    number {
    const selected =
        settings.store
            .nitroTier ??
        "none";

    if (
        selected ===
        "none"
    ) {
        return realPremium;
    }

    return Math.max(
        realPremium,
        2
    );
}

/*
 * =====================================================
 * USER OBJECT
 * =====================================================
 */

export function patchUser<
    T extends
    User |
    null |
    undefined
>(
    user: T
):
    T {
    if (
        !user?.id ||
        !isSelf(
            user.id
        )
    ) {
        return user;
    }

    return new Proxy(
        user,

        {
            get(
                target,
                property,
                receiver
            ) {
                switch (
                property
                ) {
                    /*
                     * Username.
                     */
                    case "username": {
                        const value =
                            settings.store
                                .spoofUsername
                                ?.trim();

                        if (
                            value
                        ) {
                            return value;
                        }

                        break;
                    }

                    /*
                     * Display name.
                     */
                    case "globalName":
                    case "global_name": {
                        const value =
                            settings.store
                                .spoofDisplayName
                                ?.trim() ||

                            settings.store
                                .spoofUsername
                                ?.trim();

                        if (
                            value
                        ) {
                            return value;
                        }

                        break;
                    }

                    /*
                     * Nitro.
                     */
                    case "premiumType": {
                        return getPremiumType(
                            Number(
                                Reflect.get(
                                    target,
                                    property,
                                    receiver
                                ) ??
                                0
                            )
                        );
                    }

                    /*
                     * Avatar decoration.
                     */
                    case "avatarDecoration":
                    case "avatarDecorationData": {
                        const decoration =
                            getAvatarDecorationOverride();

                        if (
                            decoration
                        ) {
                            return decoration;
                        }

                        break;
                    }
                }

                /*
                 * DO NOT patch:
                 *
                 * publicFlags
                 * collectibles
                 * nameplate
                 *
                 * Nameplates are handled by the dedicated
                 * resolver hook in index.tsx.
                 */
                return Reflect.get(
                    target,
                    property,
                    receiver
                );
            }
        }
    ) as T;
}

/*
 * =====================================================
 * DISPLAY NAME
 * =====================================================
 */

export function getDisplayNameOverride(
    user?: {
        id?: string;
    } | null
):
    string |
    null {
    if (
        !isSelf(
            user?.id
        )
    ) {
        return null;
    }

    return (
        settings.store
            .spoofDisplayName
            ?.trim() ||

        settings.store
            .spoofUsername
            ?.trim() ||

        null
    );
}

/*
 * =====================================================
 * NITRO CARD DATE
 * =====================================================
 *
 * Patched into Discord's Xb() (index.ts): the date shown in
 * the native Nitro card of YOUR profile. Discord takes it from
 * your REAL subscription first (getPremiumSubscription), so
 * the spoofed date must be injected there. Xb() only ever
 * concerns the current user.
 *
 * Same Date object while the settings do not change (hook
 * used during render).
 */
let nitroSinceCache:
    {
        key: string;
        value: Date;
    } |
    null =
    null;

export function getNitroSinceHook(
    original:
        unknown
):
    unknown {
    try {
        const tier =
            settings.store
                .nitroTier ??
            "none";

        if (
            tier ===
            "none"
        ) {
            return original;
        }

        const custom =
            settings.store
                .nitroSinceDate ??
            "";

        /*
         * The automatic date moves with the day.
         */
        const key =
            `${tier}|${custom}|${new Date().toDateString()}`;

        if (
            nitroSinceCache?.key ===
            key
        ) {
            return nitroSinceCache.value;
        }

        const since =
            getNitroSince(
                tier,
                custom
            );

        if (
            !since
        ) {
            return original;
        }

        nitroSinceCache = {
            key,
            value:
                since
        };

        return since;
    } catch {
        return original;
    }
}

/*
 * =====================================================
 * PROFILE DATA
 * =====================================================
 */

export function patchUserProfile(
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
        !isSelf(
            profile.userId
        )
    ) {
        return profile;
    }

    const patches:
        Partial<UserProfile> &
        Record<
            string,
            unknown
        > =
        {};

    /*
     * Bio.
     */
    const bio =
        settings.store
            .spoofBio
            ?.trim();

    if (
        bio
    ) {
        patches.bio =
            bio;
    }

    /*
     * Pronouns.
     */
    const pronouns =
        settings.store
            .spoofPronouns
            ?.trim();

    if (
        pronouns
    ) {
        patches.pronouns =
            pronouns;
    }

    /*
     * Legacy username.
     */
    const legacy =
        settings.store
            .spoofLegacyUsername
            ?.trim();

    if (
        legacy
    ) {
        patches.legacyUsername =
            legacy;
    }

    /*
     * Profile Effect.
     */
    const effect =
        settings.store
            .profileEffect
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

    /*
     * Profile Frame.
     *
     * This already works with Discord's native
     * renderer, so don't mess with it.
     */
    const frame =
        settings.store
            .profileFrame
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

    /*
     * Hide real Discord badges.
     *
     * Fake/local badges remain supplied by BadgeAPI.
     */
    if (
        settings.store
            .replaceRealBadges
    ) {
        patches.badges =
            [];
    }

    /*
     * Nitro.
     */
    const nitroTier =
        settings.store
            .nitroTier ??
        "none";

    if (
        nitroTier !==
        "none"
    ) {
        patches.premiumType =
            Math.max(
                Number(
                    profile
                        .premiumType ??
                    0
                ),

                2
            );

        const since =
            getNitroSince(
                nitroTier,
                settings.store
                    .nitroSinceDate
            );

        if (
            since
        ) {
            patches.premiumSince =
                since;

            const badge =
                getNativeNitroBadge(
                    nitroTier,
                    since,
                    settings.store
                        .nitroSimpleTooltip ??
                    false
                );

            /*
             * Real Discord badge (id premium_tenure_*_v2):
             * Discord renders its own icon + hover card.
             * Works with Replace Real Badges (patches.badges
             * already emptied above).
             */
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

    /*
     * Server boost.
     */
    const boostTier =
        settings.store
            .boostTier ??
        "none";

    const boostMonths =
        BOOST_META[
        boostTier
        ];

    if (
        boostTier !==
        "none" &&
        typeof boostMonths ===
        "number" &&
        boostMonths >=
        0
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

    return virtualMerge(
        profile,

        patches as
        UserProfile
    );
}

/*
 * =====================================================
 * REFRESH
 * =====================================================
 */

export async function applyProfileChanges() {
    ownUserId =
        UserStore
            .getCurrentUser()
            ?.id ??
        ownUserId;

    const userId =
        getOwnUserId();

    if (
        !userId
    ) {
        return;
    }

    const user =
        UserStore.getUser(
            userId
        );

    if (
        !user
    ) {
        return;
    }

    const patched =
        patchUser(
            user
        );

    FluxDispatcher.dispatch({
        type:
            "USER_UPDATE",

        user:
            patched
    });

    FluxDispatcher.dispatch({
        type:
            "CURRENT_USER_UPDATE",

        user:
            patched
    });

    FluxDispatcher.dispatch({
        type:
            "USER_PROFILE_UPDATE",

        userId
    });

    if (
        settings.store
            .debugLogs
    ) {
        console.info(
            "[Iris.ts] Refreshed"
        );
    }
}

/*
 * =====================================================
 * MEMBER SINCE
 * =====================================================
 */

export function getCreationTimestampOverride(
    snowflake:
        string
):
    number |
    null {
    if (
        !isSelf(
            snowflake
        )
    ) {
        return null;
    }

    const value =
        settings.store
            .spoofAccountCreationDate
            ?.trim();

    if (
        !value
    ) {
        return null;
    }

    const parsed =
        Date.parse(
            value
        );

    return Number.isNaN(
        parsed
    )
        ? null
        : parsed;
}

let creationHookEnabled =
    false;

let originalExtractTimestamp:
    (
        (
            snowflake:
                string
        ) =>
            number
    ) |
    null =
    null;

let snowflakeUtilsModule:
    {
        extractTimestamp:
        (
            snowflake:
                string
        ) =>
            number;
    } |
    null =
    null;

export function installCreationDateOverride() {
    creationHookEnabled =
        true;

    waitFor(
        [
            "fromTimestamp",
            "extractTimestamp"
        ],

        snowflakeUtils => {
            if (
                !creationHookEnabled ||
                originalExtractTimestamp
            ) {
                return;
            }

            snowflakeUtilsModule =
                snowflakeUtils;

            originalExtractTimestamp =
                snowflakeUtils
                    .extractTimestamp
                    .bind(
                        snowflakeUtils
                    );

            snowflakeUtils
                .extractTimestamp =
                (
                    snowflake:
                        string
                ) => {
                    const override =
                        getCreationTimestampOverride(
                            snowflake
                        );

                    return (
                        override ??
                        originalExtractTimestamp!(
                            snowflake
                        )
                    );
                };
        }
    );
}

export function uninstallCreationDateOverride() {
    creationHookEnabled =
        false;

    if (
        !originalExtractTimestamp ||
        !snowflakeUtilsModule
    ) {
        return;
    }

    snowflakeUtilsModule
        .extractTimestamp =
        originalExtractTimestamp;

    originalExtractTimestamp =
        null;

    snowflakeUtilsModule =
        null;
}
