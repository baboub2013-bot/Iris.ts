/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import type { CustomBadge } from "./catalog";
import { NetworkPanel } from "./components/NetworkPanel";
import { SettingsPanel } from "./components/SettingsPanel";

export const settings = definePluginSettings({
    network: {
        type: OptionType.COMPONENT,
        component: NetworkPanel
    },

    editor: {
        type: OptionType.COMPONENT,
        component: SettingsPanel
    }
}).withPrivateSettings<{
    spoofUsername?: string;
    spoofDisplayName?: string;
    spoofPronouns?: string;
    spoofBio?: string;
    spoofLegacyUsername?: string;
    spoofAccountCreationDate?: string;

    selectedBadges?: string[];

    /*
     * Local fake DM with the official Discord account.
     */
    officialMessages?: Array<{
        id: string;
        fromSelf: boolean;
        content: string;
        timestamp: number;
    }>;
    officialChannelId?: string;
    officialUnlocked?: boolean;

    /*
     * true (default): everything happens in a local copy of
     * the official DM, the real one is never touched.
     */
    officialCloneMode?: boolean;

    /*
     * Local bot spoofer: show my own profile as a bot,
     * with an optional verified variant and a tag name used
     * in the local Bot badge tooltip.
     */
    botSpoofEnabled?: boolean;
    botVerified?: boolean;
    botTagName?: string;
    selectedBotBadges?: string[];

    /*
     * Tiered badge families (Gifting, Game Variety...):
     * selected tier per family id, plus an optional icon
     * override per family.
     */
    badgeTiers?: Record<string, string>;
    badgeTierIcons?: Record<string, string>;

    /*
     * Old single-family settings, still read once so an
     * existing Gifting selection is not lost.
     */
    giftingTier?: string;
    giftingBadgeIconUrl?: string;
    nitroTier?: string;

    /*
     * "Subscriber since" date of the spoofed Nitro badge.
     * Empty = automatic (tier duration before today).
     */
    nitroSinceDate?: string;

    /*
     * true = plain "Subscriber since" tooltip instead of
     * Discord's native Nitro card on your own profile.
     */
    nitroSimpleTooltip?: boolean;

    boostTier?: string;

    customBadgesEnabled?: boolean;
    customBadges?: CustomBadge[];
    hideCustomBadgesFromOthers?: boolean;

    selectedDecoration?: string;
    profileEffect?: string;
    nameplate?: string;
    profileFrame?: string;

    /*
     * Profile Tag (local server tag next to your name).
     */
    profileTagEnabled?: boolean;
    profileTagText?: string;
    profileTagGuildId?: string;
    profileTagBadge?: string;

    /*
     * Tag icon: "real" (your real tag icon), "guild" (any
     * server tag icon: guild id + badge hash) or "custom"
     * (image URL / uploaded data URL).
     */
    profileTagIconMode?: string;
    profileTagIconUrl?: string;

    replaceRealBadges?: boolean;
    debugLogs?: boolean;

    unlockAll?: boolean;
    unlockedDecorationAsset?: string;

    networkAuthToken?: string;
    networkAuthUserId?: string;
    networkShareProfile?: boolean;
    networkShowOtherProfiles?: boolean;
    networkAllowCustomImages?: boolean;
}>();
