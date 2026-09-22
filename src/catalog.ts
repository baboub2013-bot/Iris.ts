/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import decorationsJson from "./decorations.json";

export interface BadgeEntry {
    id: string;
    name: string;
    iconHash: string;
    exclusiveGroup?: string;
}

export interface DecorationEntry {
    id: string;
    name: string;
    asset: string;
    collection: string;
}

export interface TierEntry {
    id: string;
    name: string;
    iconHash: string;
}

export interface CustomBadge {
    id: string;
    name: string;
    tooltip: string;
    image: string;
    enabled: boolean;
}

export function badgeIcon(hash: string): string {
    return `https://cdn.discordapp.com/badge-icons/${hash}.png`;
}

export function decorationIcon(asset: string): string {
    return `https://cdn.discordapp.com/avatar-decoration-presets/${asset}.png?passthrough=false`;
}

export const BADGES: BadgeEntry[] = [
    {
        id: "staff",
        name: "Discord Staff",
        iconHash: "5e74e9b61934fc1f67c65515d1f7e60d"
    },
    {
        id: "partner",
        name: "Partner",
        iconHash: "3f9748e53446a137a052f3454e2de41e"
    },
    {
        id: "hypesquad_events",
        name: "HypeSquad Events",
        iconHash: "bf01d1073931f921909045f3a39fd264"
    },
    {
        id: "hypesquad_bravery",
        name: "Bravery",
        iconHash: "8a88d63823d8a71cd5e390baa45efa02",
        exclusiveGroup: "house"
    },
    {
        id: "hypesquad_brilliance",
        name: "Brilliance",
        iconHash: "011940fd013da3f7fb926e4a1cd2e618",
        exclusiveGroup: "house"
    },
    {
        id: "hypesquad_balance",
        name: "Balance",
        iconHash: "3aa41de486fa12454c3761e8e223442e",
        exclusiveGroup: "house"
    },
    {
        id: "bug_hunter_1",
        name: "Bug Hunter 1",
        iconHash: "2717692c7dca7289b35297368a940dd0",
        exclusiveGroup: "bug"
    },
    {
        id: "bug_hunter_2",
        name: "Bug Hunter 2",
        iconHash: "848f79194d4be5ff5f81505cbd0ce1e6",
        exclusiveGroup: "bug"
    },
    {
        id: "early_supporter",
        name: "Early Supporter",
        iconHash: "7060786766c9c840eb3019e725d2b358"
    },
    {
        id: "moderator_alumni",
        name: "Mod Alumni",
        iconHash: "fee1624003e2fee35cb398e125dc479b"
    },
    {
        id: "verified_developer",
        name: "Verified Dev",
        iconHash: "6df5892e0f35b051f8b61eace34f4967"
    },
    {
        id: "active_developer",
        name: "Active Developer",
        iconHash: "6bdc42827a38498929a4920da12695d9"
    },
    {
        id: "legacy_username",
        name: "Old Username",
        iconHash: "6de6d34650760ba5551a79732e98ed60"
    },
    {
        id: "quest_completed",
        name: "Quest",
        iconHash: "7d9ae358c8c5e118768335dbe68b4fb8"
    },
    {
        id: "orbs_apprentice",
        name: "Orbs",
        iconHash: "83d8a1eb09a8d64e59233eec5d4d5c2d"
    }
];

export const NITRO_TIERS: TierEntry[] = [
    { id: "none", name: "None", iconHash: "" },
    { id: "nitro", name: "Nitro", iconHash: "2ba85e8026a8614b640c2837bcdfe21b" },
    { id: "bronze", name: "Bronze", iconHash: "4f33c4a9c64ce221936bd256c356f91f" },
    { id: "silver", name: "Silver", iconHash: "4514fab914bdbfb4ad2fa23df76121a6" },
    { id: "gold", name: "Gold", iconHash: "2895086c18d5531d499862e41d1155a6" },
    { id: "platinum", name: "Platinum", iconHash: "0334688279c8359120922938dcb1d6f8" },
    { id: "diamond", name: "Diamond", iconHash: "0d61871f72bb9a33a7ae568c1fb4f20a" },
    { id: "emerald", name: "Emerald", iconHash: "11e2d339068b55d3a506cff34d3780f3" },
    { id: "ruby", name: "Ruby", iconHash: "cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4" },
    { id: "opal", name: "Opal", iconHash: "5b154df19c53dce2af92c9b61e6be5e2" }
];

/*
 * Native Discord Nitro badges.
 *
 * IDs and durations measured in the Discord client
 * (module with PREMIUM_TENURE_*_MONTH, tenureReqNumMonths).
 *
 * The spoofed badge is injected into profile.badges in the
 * exact Discord format ({ id, description, icon, link }).
 *
 * Native mode (default): official premium_tenure_* id. On YOUR
 * profile Discord then shows its own tenure card ("NITRO OPAL",
 * art, date): the tier is read from profile.badges and the date
 * from Xb(), patched in index.ts (getNitroSinceHook).
 *
 * Simple mode (nitroSimpleTooltip): "iris_" prefix,
 * rendered as a regular badge with a plain tooltip. Fallback if
 * the native card ever stops working.
 */
const SPOOFED_BADGE_PREFIX = "iris_";
export interface NitroTenureEntry {
    months: number;
    badgeId: string;
}

export const NITRO_TENURE: Record<string, NitroTenureEntry> = {
    nitro: { months: 0, badgeId: "premium" },
    bronze: { months: 1, badgeId: "premium_tenure_1_month_v2" },
    silver: { months: 3, badgeId: "premium_tenure_3_month_v2" },
    gold: { months: 6, badgeId: "premium_tenure_6_month_v2" },
    platinum: { months: 12, badgeId: "premium_tenure_12_month_v2" },
    diamond: { months: 24, badgeId: "premium_tenure_24_month_v2" },
    emerald: { months: 36, badgeId: "premium_tenure_36_month_v2" },
    ruby: { months: 60, badgeId: "premium_tenure_60_month_v2" },
    opal: { months: 72, badgeId: "premium_tenure_72_month_v2" }
};

export interface NativeBadge {
    id: string;
    description: string;
    icon: string;
    link?: string;
}

/*
 * Parses a user-entered date ("Sep 19, 2020", "2020-09-19",
 * ...). "YYYY-MM-DD" is read in LOCAL time so the displayed
 * day never shifts. Returns null if empty or invalid.
 */
export function parseCustomDate(
    value: string | undefined
): Date | null {
    const text = value?.trim();

    if (!text) {
        return null;
    }

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);

    const date = iso
        ? new Date(
            Number(iso[1]),
            Number(iso[2]) - 1,
            Number(iso[3])
        )
        : new Date(text);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

/*
 * Subscription start for a tier.
 *
 * - valid custom date -> that date (fixed)
 * - otherwise         -> `months` ago, minus one day so the
 *                        tenure is always reached
 */
export function getNitroSince(
    tierId: string,
    customDate?: string
): Date | null {
    const tenure = NITRO_TENURE[tierId];

    if (!tenure) {
        return null;
    }

    const custom = parseCustomDate(customDate);

    if (custom) {
        return custom;
    }

    const date = new Date();

    date.setMonth(
        date.getMonth() - tenure.months
    );

    date.setDate(
        date.getDate() - 1
    );

    return date;
}

/*
 * Real Discord badge object, same shape as profile.badges
 * entries sent by the API: { id, description, icon, link }.
 */
export function getNativeNitroBadge(
    tierId: string,
    since: Date,
    simpleTooltip = false
): NativeBadge | null {
    const tenure = NITRO_TENURE[tierId];

    const tier = NITRO_TIERS.find(
        entry => entry.id === tierId
    );

    if (!tenure || !tier?.iconHash) {
        return null;
    }

    const date = since.toLocaleDateString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    );

    return {
        id: simpleTooltip
            ? `${SPOOFED_BADGE_PREFIX}${tenure.badgeId}`
            : tenure.badgeId,
        description: `Subscriber since ${date}`,
        icon: tier.iconHash,
        link: "https://discord.com/settings/premium"
    };
}

/*
 * Replaces any Nitro badge in `badges` with `badge`.
 */
export function withNativeNitroBadge(
    badges: unknown,
    badge: NativeBadge
): unknown[] {
    const list = Array.isArray(badges)
        ? badges
        : [];

    return [
        ...list.filter(entry => {
            const id = (entry as { id?: unknown; } | null)?.id;

            return !(
                typeof id === "string" &&
                (
                    id === "premium" ||
                    id.startsWith("premium_tenure_") ||
                    id.startsWith(`${SPOOFED_BADGE_PREFIX}premium`)
                )
            );
        }),
        badge
    ];
}

export const BOOST_TIERS: TierEntry[] = [
    { id: "none", name: "None", iconHash: "" },
    { id: "1", name: "1 mo", iconHash: "51040c70d4f20a921ad6674ff86fc95c" },
    { id: "2", name: "2 mo", iconHash: "0e4080d1d333bc7ad29ef6528b6f2fb7" },
    { id: "3", name: "3 mo", iconHash: "72bed924410c304dbe3d00a6e593ff59" },
    { id: "6", name: "6 mo", iconHash: "df199d2050d3ed4ebf84d64ae83989f8" },
    { id: "9", name: "9 mo", iconHash: "996b3e870e8a22ce519b3a50e6bdd52f" },
    { id: "12", name: "12 mo", iconHash: "991c9f39ee33d7537d9f408c3e53141e" },
    { id: "15", name: "15 mo", iconHash: "cb3ae83c15e970e8f3d410bc62cb8b99" },
    { id: "18", name: "18 mo", iconHash: "7142225d31238f6387d9f09efaa02759" },
    { id: "24", name: "24 mo", iconHash: "ec92202290b48d0879b7413d2dde3bab" }
];

export const DECORATIONS = decorationsJson as DecorationEntry[];
