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
 * LOCAL BOT SPOOFER
 * =====================================================
 *
 * Discord decides whether to draw the BOT / APP tag from
 * the user record itself:
 *
 *   user.bot              -> the tag is drawn
 *   user.isVerifiedBot()  -> verified checkmark variant
 *   user.isNonUserBot()   -> some UI paths
 *
 * Same approach as the nameplate and the profile tag: own
 * getters on MY user record only, no webpack patch, so a new
 * Discord build cannot break it.
 *
 * LOCAL ONLY: no application is created, no token, no
 * permission, nothing is sent to Discord, and people without
 * Iris.ts keep seeing your normal profile.
 *
 * Everything is reverted by turning the toggle off (or by
 * disabling the plugin).
 */

interface PatchedBotEntry {
    target: Record<string, unknown>;
    property: string;
    hadOwnValue: boolean;
    original: unknown;
}

/*
 * Record properties overridden while the toggle is on.
 */
const BOT_FLAG = "bot";

const BOT_METHODS = [
    "isVerifiedBot",
    "isNonUserBot"
] as const;

const BOT_REFRESH_EVENTS = [
    "USER_UPDATE",
    "CURRENT_USER_UPDATE"
] as const;

const MAX_BOT_TAG_LENGTH = 24;

const patchedBotRecords = new WeakSet<object>();

let patchedBotEntries: PatchedBotEntry[] = [];

/*
 * Last REAL value of user.bot, restored on uninstall.
 */
let realBotFlag: unknown = false;

let installed = false;

function debug(...args: unknown[]) {
    if (settings.store.debugLogs) {
        console.info("[Iris.ts] [BotSpoofer]", ...args);
    }
}

/*
 * =====================================================
 * STATE
 * =====================================================
 */

export function isBotSpoofActive(): boolean {
    return settings.store.botSpoofEnabled === true;
}

export function isBotVerified(): boolean {
    return isBotSpoofActive() &&
        settings.store.botVerified === true;
}

export function getBotTagName(): string {
    const name = (settings.store.botTagName ?? "")
        .trim()
        .slice(0, MAX_BOT_TAG_LENGTH);

    return name || "BOT";
}

/*
 * =====================================================
 * RECORD OVERRIDE
 * =====================================================
 */

function findPrototypeDescriptor(
    object: object,
    property: string
): PropertyDescriptor | undefined {
    let proto = Object.getPrototypeOf(object);

    while (proto) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, property);

        if (descriptor) {
            return descriptor;
        }

        proto = Object.getPrototypeOf(proto);
    }

    return undefined;
}

function isOwnRecord(user: Record<string, unknown>): boolean {
    const ownId = UserStore.getCurrentUser()?.id;

    return !!ownId && user.id === ownId;
}

function overrideBotFlag(user: Record<string, unknown>) {
    const ownDescriptor = Object.getOwnPropertyDescriptor(user, BOT_FLAG);

    if (ownDescriptor && !ownDescriptor.configurable) {
        return;
    }

    const protoGetter = ownDescriptor
        ? undefined
        : findPrototypeDescriptor(user, BOT_FLAG)?.get;

    let original: unknown = ownDescriptor
        ? ("value" in ownDescriptor ? ownDescriptor.value : ownDescriptor.get?.call(user))
        : protoGetter
            ? undefined
            : user[BOT_FLAG];

    /*
     * A copy of an already patched record carries `true`:
     * the real value is the stored one.
     */
    if (original === true && realBotFlag !== true) {
        original = realBotFlag;
    } else if (!protoGetter) {
        realBotFlag = original;
    }

    Object.defineProperty(user, BOT_FLAG, {
        configurable: true,
        enumerable: true,

        get() {
            try {
                if (isBotSpoofActive()) {
                    return true;
                }

                return protoGetter ? protoGetter.call(user) : original;
            } catch {
                return realBotFlag;
            }
        },

        set(value: unknown) {
            original = value;
            realBotFlag = value;
        }
    });

    patchedBotEntries.push({
        target: user,
        property: BOT_FLAG,
        hadOwnValue: !!ownDescriptor,
        original: realBotFlag
    });
}

/*
 * isVerifiedBot() / isNonUserBot() return a boolean while the
 * toggle is on, and Discord's own result otherwise. Returning
 * a boolean cannot crash anything.
 */
function overrideBotMethod(user: Record<string, unknown>, method: string) {
    const descriptor = Object.getOwnPropertyDescriptor(user, method);

    if (descriptor && !descriptor.configurable) {
        return;
    }

    const own = user[method];

    const fallback = typeof own === "function"
        ? own as (this: unknown, ...args: unknown[]) => unknown
        : (() => {
            const value = findPrototypeDescriptor(user, method)?.value;

            return typeof value === "function"
                ? value as (this: unknown, ...args: unknown[]) => unknown
                : undefined;
        })();

    if (!fallback) {
        return;
    }

    Object.defineProperty(user, method, {
        configurable: true,
        enumerable: false,
        writable: true,

        value: function (this: unknown, ...args: unknown[]) {
            try {
                if (isBotSpoofActive()) {
                    return method === "isVerifiedBot"
                        ? isBotVerified()
                        : true;
                }

                return fallback.apply(this, args);
            } catch {
                return false;
            }
        }
    });

    patchedBotEntries.push({
        target: user,
        property: method,
        hadOwnValue: !!descriptor,
        original: own
    });
}

/*
 * Adds the override to my current user record.
 * Cheap and idempotent: called on every UserStore change.
 */
function applySelfBotSpoof() {
    try {
        const user = UserStore.getCurrentUser() as unknown as Record<string, unknown> | null | undefined;

        if (!user || patchedBotRecords.has(user) || !isOwnRecord(user) || !Object.isExtensible(user)) {
            return;
        }

        overrideBotFlag(user);

        for (const method of BOT_METHODS) {
            try {
                overrideBotMethod(user, method);
            } catch (error) {
                debug(`Override failed for ${method}`, error);
            }
        }

        patchedBotRecords.add(user);

        /*
         * Old records are garbage once Discord replaces them.
         */
        if (patchedBotEntries.length > 15) {
            patchedBotEntries = patchedBotEntries.slice(-15);
        }

        debug("Override applied to own user record");
    } catch (error) {
        debug("Override failed", error);
    }
}

function restoreSelfBotSpoof() {
    for (const entry of patchedBotEntries) {
        try {
            delete entry.target[entry.property];

            if (entry.hadOwnValue) {
                Object.defineProperty(entry.target, entry.property, {
                    configurable: true,
                    enumerable: entry.property === BOT_FLAG,
                    writable: true,
                    value: entry.original
                });
            }
        } catch {
            // record already replaced by Discord
        }
    }

    patchedBotEntries = [];
}

function emitBotChange() {
    setTimeout(() => {
        try {
            (UserStore as unknown as { emitChange?: () => void; }).emitChange?.();
        } catch {
            // ignore
        }
    }, 0);
}

function onBotUserUpdate() {
    applySelfBotSpoof();
}

/*
 * =====================================================
 * LIFECYCLE
 * =====================================================
 */

/*
 * Called after Save: re-applies the override, swaps my user
 * record for a fresh copy so every surface re-renders, and
 * notifies UserStore.
 */
export function refreshBotSpoof() {
    applySelfBotSpoof();

    try {
        refreshSelfUserRecord();
    } catch (error) {
        debug("Record refresh failed", error);
    }

    applySelfBotSpoof();

    emitBotChange();
}

export function installBotSpoofOverride() {
    if (installed) {
        return;
    }

    installed = true;

    applySelfBotSpoof();

    try {
        UserStore.addChangeListener(applySelfBotSpoof);
    } catch {
        // ignore
    }

    for (const event of BOT_REFRESH_EVENTS) {
        FluxDispatcher.subscribe(event, onBotUserUpdate);
    }

    emitBotChange();
}

export function uninstallBotSpoofOverride() {
    if (!installed) {
        return;
    }

    installed = false;

    for (const event of BOT_REFRESH_EVENTS) {
        FluxDispatcher.unsubscribe(event, onBotUserUpdate);
    }

    try {
        UserStore.removeChangeListener(applySelfBotSpoof);
    } catch {
        // ignore
    }

    restoreSelfBotSpoof();

    emitBotChange();
}
