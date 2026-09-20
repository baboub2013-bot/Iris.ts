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
