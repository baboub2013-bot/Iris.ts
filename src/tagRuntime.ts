/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    FluxDispatcher,
    UserStore
} from "@webpack/common";

import {
    refreshSelfUserRecord
} from "./profileRuntime";
import { settings } from "./settings";

/*
 * =====================================================
 * PROFILE TAG (server tag next to your name)
 * =====================================================
 *
 * Discord reads the tag from the user record:
 *
 *   user.primaryGuild = {
 *       identityGuildId, identityEnabled, tag, badge
 *   }
 *
 * Older builds used the name `clan` for the same object, so
 * BOTH properties are overridden (whichever Discord reads
 * gets the spoof). Own getters on MY user record only, same
 * approach as the nameplate override: no webpack patch, so
 * a new Discord build cannot break it, and other users are
 * never touched.
 *
 * Icon modes (tag creator):
 *   real   -> keep the icon of your real tag
 *   guild  -> icon of any server tag (guild id + badge hash)
 *   custom -> any image URL. Discord builds the icon URL
 *             from guild id + badge hash; we use a fixed fake
 *             pair and a CSS rule replaces the displayed image
 *             of exactly that URL (Chromium `content: url()`
 *             on <img>). No patch involved.
 *
 * LOCAL ONLY: nothing is sent to Discord, this grants no real
 * tag, server membership or permission, and people without
 * Iris.ts keep seeing your normal profile.
 */

export type ProfileTagIconMode =
    | "real"
    | "guild"
    | "custom";

interface SpoofedTag {
    identityGuildId: string | null;
    identityEnabled: boolean;
    tag: string;
    badge: string | null;
}

interface PatchedEntry {
    target: Record<string, unknown>;
    property: string;
    hadOwnValue: boolean;
    getReal: () => unknown;
}

/*
 * Properties Discord may read the tag from.
 */
const TAG_PROPERTIES = [
    "primaryGuild",
    "clan"
] as const;

const MAX_TAG_LENGTH = 4;

/*
 * Fake guild id + badge used for custom images. Only the CSS
 * rule below ever displays anything for this URL.
 */
export const FAKE_TAG_GUILD_ID = "1000000000000000001";
const FAKE_TAG_BADGE = "Iris.ts";

const STYLE_ELEMENT_ID = "profile-spoofer-tag-style";

const TAG_REFRESH_EVENTS = [
    "USER_UPDATE",
    "CURRENT_USER_UPDATE"
] as const;

const patchedRecords = new WeakSet<object>();

/*
 * Objects WE built. refreshSelfUserRecord() copies the record
 * with Object.assign, turning our getters into plain values:
 * this set lets us recognise our own spoof on the copy.
 */
const spoofedValues = new WeakSet<object>();

/*
 * Last REAL value per property (base for "real" icon mode,
 * and what is restored on uninstall).
 */
const realValues = new Map<string, unknown>();

let patchedEntries: PatchedEntry[] = [];

let tagCache: { key: string; value: SpoofedTag; } | null = null;

let installed = false;

function debug(...args: unknown[]) {
    if (settings.store.debugLogs) {
        console.info("[Iris.ts] [ProfileTag]", ...args);
    }
}

/*
 * =====================================================
 * SETTINGS HELPERS
 * =====================================================
 */

export function getTagText(): string {
    return (settings.store.profileTagText ?? "")
        .trim()
        .slice(0, MAX_TAG_LENGTH);
}

export function getTagIconMode(): ProfileTagIconMode {
    const mode = settings.store.profileTagIconMode;

    return mode === "guild" || mode === "custom"
        ? mode
        : "real";
}

export function isProfileTagActive(): boolean {
    return settings.store.profileTagEnabled === true &&
        getTagText().length > 0;
}

/*
 * Only https:// images or base64 data:image URLs, with no
 * character that could escape the CSS url("...") string.
 */
export function sanitizeTagIconUrl(value: string | undefined): string | null {
    const url = value?.trim() ?? "";

    if (/^https:\/\/[^\s"'()\\<>]+$/i.test(url)) {
        return url;
    }

    if (/^data:image\/(?:png|gif|webp|jpeg|svg\+xml);base64,[a-z0-9+/=]+$/i.test(url)) {
        return url;
    }

    return null;
}

export function getTagBadgeUrl(guildId: string, badge: string): string {
    return `https://cdn.discordapp.com/clan-badges/${guildId}/${badge}.png?size=32`;
}

function readString(source: unknown, key: string): string | null {
    if (!source || typeof source !== "object") {
        return null;
    }

    const value = (source as Record<string, unknown>)[key];

    return typeof value === "string" && value ? value : null;
}

/*
 * Your REAL tag, as last seen on your record.
 */
export function getRealProfileTag(): { guildId: string | null; badge: string | null; tag: string | null; } {
    for (const property of TAG_PROPERTIES) {
        const real = realValues.get(property);

        if (real && typeof real === "object") {
            return {
                guildId: readString(real, "identityGuildId"),
                badge: readString(real, "badge"),
                tag: readString(real, "tag")
            };
        }
    }

    return { guildId: null, badge: null, tag: null };
}

/*
 * =====================================================
 * SPOOFED VALUE
 * =====================================================
 */

function resolveIcon(real: unknown): { guildId: string; badge: string; } {
    const mode = getTagIconMode();

    if (mode === "custom") {
        return { guildId: FAKE_TAG_GUILD_ID, badge: FAKE_TAG_BADGE };
    }

    if (mode === "guild") {
        const guildId = (settings.store.profileTagGuildId ?? "").trim();
        const badge = (settings.store.profileTagBadge ?? "").trim();

        if (guildId && badge) {
            return { guildId, badge };
        }
    }

    /*
     * "real" (or incomplete "guild"): your real icon, else a
     * fake id so Discord still renders the tag text.
     */
    const realGuildId = readString(real, "identityGuildId");
    const realBadge = readString(real, "badge");

    if (realGuildId && realBadge) {
        return { guildId: realGuildId, badge: realBadge };
    }

    return { guildId: FAKE_TAG_GUILD_ID, badge: FAKE_TAG_BADGE };
}

/*
 * primaryGuild and clan must give the SAME spoofed object:
 * the real icon is taken from whichever property holds your
 * real tag, so both reads resolve to one cache key.
 */
function pickReal(real: unknown): unknown {
    if (real && typeof real === "object") {
        return real;
    }

    for (const property of TAG_PROPERTIES) {
        const value = realValues.get(property);

        if (value && typeof value === "object") {
            return value;
        }
    }

    return null;
}

function buildSpoofedTag(real: unknown): SpoofedTag {
    const text = getTagText();
    const { guildId, badge } = resolveIcon(pickReal(real));
    const key = `${text}|${guildId}|${badge}`;

    /*
     * Same object while nothing changes: the tag is read during
     * render and inside store selectors (new object every call
     * = render loop = "Well, this is awkward").
     */
    if (tagCache?.key === key) {
        return tagCache.value;
    }

    const value: SpoofedTag = {
        identityGuildId: guildId,
        identityEnabled: true,
        tag: text,
        badge
    };

    spoofedValues.add(value);
    tagCache = { key, value };

    return value;
}

/*
 * =====================================================
 * CUSTOM ICON (CSS)
 * =====================================================
 */

function updateTagStyle() {
    try {
        const url = isProfileTagActive() && getTagIconMode() === "custom"
            ? sanitizeTagIconUrl(settings.store.profileTagIconUrl)
            : null;

        let element = document.getElementById(STYLE_ELEMENT_ID);

        if (!url) {
            element?.remove();
            return;
        }

        if (!element) {
            element = document.createElement("style");
            element.id = STYLE_ELEMENT_ID;
            document.head.appendChild(element);
        }

        element.textContent =
            `img[src*="/clan-badges/${FAKE_TAG_GUILD_ID}/"]{content:url("${url}")!important;object-fit:contain!important;}`;
    } catch (error) {
        debug("Style update failed", error);
    }
}

function removeTagStyle() {
    try {
        document.getElementById(STYLE_ELEMENT_ID)?.remove();
    } catch {
        // ignore
    }
}

/*
 * =====================================================
 * RECORD OVERRIDE
 * =====================================================
 */

function findPrototypeGetter(object: object, property: string): ((this: unknown) => unknown) | undefined {
    let proto = Object.getPrototypeOf(object);

    while (proto) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, property);

        if (descriptor) {
            return descriptor.get;
        }

        proto = Object.getPrototypeOf(proto);
    }

    return undefined;
}

function isOwnRecord(user: Record<string, unknown>): boolean {
    const ownId = UserStore.getCurrentUser()?.id;

    return !!ownId && user.id === ownId;
}

function isSpoofed(value: unknown): boolean {
    return !!value && typeof value === "object" && spoofedValues.has(value);
}

function overrideProperty(user: Record<string, unknown>, property: string) {
    const ownDescriptor = Object.getOwnPropertyDescriptor(user, property);

    if (ownDescriptor && !ownDescriptor.configurable) {
        return;
    }

    const protoGetter = ownDescriptor
        ? undefined
        : findPrototypeGetter(user, property);

    let original: unknown = ownDescriptor
        ? ("value" in ownDescriptor ? ownDescriptor.value : ownDescriptor.get?.call(user))
        : protoGetter
            ? undefined
            : user[property];

    /*
     * Copy of an already patched record: the value is our
     * spoof, the real one is the stored one.
     */
    if (isSpoofed(original)) {
        original = realValues.get(property);
    } else if (!protoGetter) {
        realValues.set(property, original);
    }

    const readReal = () => {
        const base = protoGetter ? protoGetter.call(user) : original;

        if (isSpoofed(base)) {
            return realValues.get(property);
        }

        if (protoGetter) {
            realValues.set(property, base);
        }

        return base;
    };

    Object.defineProperty(user, property, {
        configurable: true,
        enumerable: property !== "clan" || !!ownDescriptor,

        get() {
            try {
                const real = readReal();

                return isProfileTagActive()
                    ? buildSpoofedTag(real)
                    : real;
            } catch {
                return realValues.get(property);
            }
        },

        set(value: unknown) {
            if (isSpoofed(value)) {
                return;
            }

            original = value;
            realValues.set(property, value);
        }
    });

    patchedEntries.push({
        target: user,
        property,
        hadOwnValue: !!ownDescriptor,
        getReal: () => realValues.get(property)
    });
}

/*
 * Adds the override to my current user record.
 * Cheap and idempotent: called on every UserStore change.
 */
function applySelfProfileTag() {
    try {
        const user = UserStore.getCurrentUser() as unknown as Record<string, unknown> | null | undefined;

        if (!user || patchedRecords.has(user) || !isOwnRecord(user) || !Object.isExtensible(user)) {
            return;
        }

        for (const property of TAG_PROPERTIES) {
            try {
                overrideProperty(user, property);
            } catch (error) {
                debug(`Override failed for ${property}`, error);
            }
        }

        patchedRecords.add(user);

        /*
         * Old records are garbage once Discord replaces them.
         */
        if (patchedEntries.length > 10) {
            patchedEntries = patchedEntries.slice(-10);
        }

        debug("Override applied to own user record");
    } catch (error) {
        debug("Override failed", error);
    }
}

function restoreSelfProfileTag() {
    for (const entry of patchedEntries) {
        try {
            delete entry.target[entry.property];

            if (entry.hadOwnValue) {
                Object.defineProperty(entry.target, entry.property, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: entry.getReal()
                });
            }
        } catch {
            // record already replaced by Discord
        }
    }

    patchedEntries = [];
}

function emitTagChange() {
    setTimeout(() => {
        try {
            (UserStore as unknown as { emitChange?: () => void; }).emitChange?.();
        } catch {
            // ignore
        }
    }, 0);
}

function onTagUserUpdate() {
    applySelfProfileTag();
}

/*
 * =====================================================
 * LIFECYCLE
 * =====================================================
 */

/*
 * Called after Save: re-applies the override, updates the
 * custom icon rule, swaps my user record for a fresh copy
 * (components that only re-render on a new record, like the
 * account panel, pick it up) and notifies UserStore.
 */
export function refreshProfileTag() {
    applySelfProfileTag();

    tagCache = null;

    updateTagStyle();

    try {
        refreshSelfUserRecord();
    } catch (error) {
        debug("Record refresh failed", error);
    }

    applySelfProfileTag();

    emitTagChange();
}

export function installProfileTagOverride() {
    if (installed) {
        return;
    }

    installed = true;

    applySelfProfileTag();
    updateTagStyle();

    try {
        UserStore.addChangeListener(applySelfProfileTag);
    } catch {
        // ignore
    }

    for (const event of TAG_REFRESH_EVENTS) {
        FluxDispatcher.subscribe(event, onTagUserUpdate);
    }

    emitTagChange();
}

export function uninstallProfileTagOverride() {
    if (!installed) {
        return;
    }

    installed = false;

    for (const event of TAG_REFRESH_EVENTS) {
        FluxDispatcher.unsubscribe(event, onTagUserUpdate);
    }

    try {
        UserStore.removeChangeListener(applySelfProfileTag);
    } catch {
        // ignore
    }

    restoreSelfProfileTag();
    removeTagStyle();

    tagCache = null;

    emitTagChange();
}
