/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import {
    ChannelStore,
    Flux,
    FluxDispatcher,
    RestAPI,
    UserStore
} from "@webpack/common";

import { settings } from "./settings";

/*
 * =====================================================
 * OFFICIAL DISCORD MESSAGES (local only)
 * =====================================================
 *
 * Creates a fake DM with the official Discord account and
 * injects fake messages into it.
 *
 * EVERYTHING IS LOCAL. Only Flux dispatches are used, the
 * same ones Discord fires when the gateway delivers data:
 *
 *   CHANNEL_CREATE  -> the DM appears in the list
 *   MESSAGE_CREATE  -> a message appears in it
 *   MESSAGE_DELETE  -> it disappears
 *   CHANNEL_DELETE  -> the DM disappears
 *
 * No REST call, no WebSocket frame, no sendMessage, no token:
 * nothing reaches Discord's servers, nothing is changed on
 * the account, and other conversations are never touched.
 *
 * Messages live in the plugin settings, so they survive a
 * restart, and disabling the plugin removes the DM and every
 * message immediately.
 */

/*
 * Official Discord account (bot + system user).
 */
export const OFFICIAL_USER_ID = "643945264868098049";

/*
 * Discord epoch, for snowflake-shaped ids.
 */
const DISCORD_EPOCH = 1420070400000n;

/*
 * Worker/process bits reserved for the plugin. Real Discord
 * ids never use this pair, so a local id can never collide
 * with a real message id.
 */
const LOCAL_WORKER_BITS = 0x3ffn << 12n;

const MessageActions = findByPropsLazy("sendMessage", "editMessage");


export interface FakeOfficialMessage {
    id: string;

    /*
     * true  -> sent by me (unlocked conversation)
     * false -> sent by the official Discord account
     */
    fromSelf: boolean;

    content: string;

    /*
     * Unix milliseconds.
     */
    timestamp: number;
}

interface RawUser {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot: boolean;
    system: boolean;
    global_name: string | null;
    public_flags: number;
}

let installed = false;

let counter = 0n;

let originalSendMessage:
    ((...args: unknown[]) => unknown) |
    null =
    null;

type RestPost = (
    this: unknown,
    request: { url?: unknown; body?: unknown; }
) => Promise<unknown>;

let originalPost: RestPost | null = null;

let installedPost: RestPost | null = null;

function debug(...args: unknown[]) {
    if (settings.store.debugLogs) {
        console.info("[Iris.ts] [OfficialDM]", ...args);
    }
}

/*
 * =====================================================
 * IDS
 * =====================================================
 */

/*
 * Snowflake-shaped id built from a real timestamp, so the
 * message sorts correctly and shows the right date, with the
 * reserved worker bits so it cannot collide with a real id.
 */
export function localSnowflake(timestamp: number): string {
    const millis = BigInt(Math.max(0, Math.floor(timestamp))) - DISCORD_EPOCH;

    counter = (counter + 1n) & 0xfffn;

    return (((millis << 22n) | LOCAL_WORKER_BITS) | counter).toString();
}

export function isLocalSnowflake(id: string): boolean {
    try {
        return (BigInt(id) & (0x3ffn << 12n)) === LOCAL_WORKER_BITS;
    } catch {
        return false;
    }
}

/*
 * =====================================================
 * STORED MESSAGES
 * =====================================================
 */

export function getStoredMessages(): FakeOfficialMessage[] {
    const stored = settings.store.officialMessages;

    return Array.isArray(stored)
        ? [...stored].sort((a, b) => a.timestamp - b.timestamp)
        : [];
}

function setStoredMessages(messages: FakeOfficialMessage[]) {
    settings.store.officialMessages = messages;
}

/*
 * =====================================================
 * CHANNEL
 * =====================================================
 */

function getOfficialRawUser(asChannelRecipient = false): RawUser | null {
    const user = UserStore.getUser(OFFICIAL_USER_ID) as unknown as Record<string, unknown> | undefined;

    if (!user) {
        return null;
    }

    return {
        id: OFFICIAL_USER_ID,
        username: typeof user.username === "string" ? user.username : "discord",
        discriminator: typeof user.discriminator === "string" ? user.discriminator : "0000",
        avatar: typeof user.avatar === "string" ? user.avatar : null,
        bot: true,

        /*
         * The MESSAGE AUTHOR must always stay a system user:
         * that is what gives the "✓ OFFICIAL" tag. Only the
         * channel RECIPIENT is flipped when unlocking, which
         * is what brings the text box back on a virtual DM.
         */
        system: asChannelRecipient
            ? settings.store.officialUnlocked !== true
            : true,

        global_name: typeof user.globalName === "string" ? user.globalName : null,
        public_flags: typeof user.publicFlags === "number" ? user.publicFlags : 1
    };
}

export function getChannelId(): string {
    const stored = settings.store.officialChannelId;

    if (typeof stored === "string" && stored) {
        return stored;
    }

    const id = localSnowflake(Date.now());

    settings.store.officialChannelId = id;

    return id;
}

/*
 * Existing real DM with the official account, if there is one.
 */
function findRealChannelId(): string | null {
    try {
        const channels = (
            ChannelStore as unknown as {
                getMutablePrivateChannels?: () => Record<string, unknown>;
            }
        ).getMutablePrivateChannels?.() ?? {};

        for (const [id, channel] of Object.entries(channels)) {
            const { recipients } = channel as { recipients?: unknown; };

            if (
                Array.isArray(recipients) &&
                recipients.length === 1 &&
                recipients[0] === OFFICIAL_USER_ID &&
                !isLocalSnowflake(id)
            ) {
                return id;
            }
        }
    } catch (error) {
        debug("Real DM lookup failed", error);
    }

    return null;
}

/*
 * The channel messages are injected into: the real DM when it
 * exists, the virtual one otherwise.
 */
/*
 * Clone mode: everything happens in a local copy of the DM,
 * the real one is never touched at all.
 */
export function isCloneMode(): boolean {
    /*
     * On by default: the local copy is what gets unlocked,
     * so the real DM is never written to and nothing can
     * reach Discord.
     */
    return settings.store.officialCloneMode !== false;
}

export function getTargetChannelId(): string {
    if (isCloneMode()) {
        return getChannelId();
    }

    return findRealChannelId() ?? getChannelId();
}

export function isVirtualChannel(): boolean {
    return isCloneMode() || findRealChannelId() === null;
}

/*
 * Copies the real conversation into the local one: same
 * messages, same authors, same timestamps. Nothing is read
 * from the network, only what the client already has in
 * MessageStore, and the real DM is left untouched.
 */
export function cloneRealConversation(): number {
    const realId = findRealChannelId();

    if (!realId) {
        return 0;
    }

    try {
        const messageStore = (
            Flux.Store as unknown as {
                getAll?: () => Array<{
                    getName?: () => string;
                    getMessages?: (id: string) => unknown;
                }>;
            }
        ).getAll?.().find(
            store =>
                store.getName?.() === "MessageStore"
        );

        const collection = messageStore?.getMessages?.(realId) as {
            toArray?: () => unknown[];
            _array?: unknown[];
        } | undefined;

        const records = collection?.toArray?.() ?? collection?._array ?? [];

        let copied = 0;

        for (const record of records) {
            const raw = cloneMessageRecord(record);

            if (!raw) {
                continue;
            }

            FluxDispatcher.dispatch({
                type: "MESSAGE_CREATE",
                guildId: null,
                channelId: getChannelId(),
                message: raw,
                optimistic: false,
                isPushNotification: false
            });

            copied++;
        }

        debug(`Cloned ${copied} real messages`);

        return copied;
    } catch (error) {
        console.warn("[Iris.ts] Could not clone the official DM", error);
        return 0;
    }
}

/*
 * One real message record -> raw message in the local copy.
 * The id is kept: message ids are per-channel, so the copy
 * never collides with the original.
 */
function cloneMessageRecord(record: unknown): Record<string, unknown> | null {
    if (!record || typeof record !== "object") {
        return null;
    }

    const message = record as Record<string, unknown>;
    const author = message.author as Record<string, unknown> | undefined;

    if (!author?.id) {
        return null;
    }

    const timestamp = message.timestamp as { toISOString?: () => string; } | string | undefined;

    return {
        id: String(message.id),
        type: typeof message.type === "number" ? message.type : 0,
        channel_id: getChannelId(),

        author: {
            id: String(author.id),
            username: typeof author.username === "string" ? author.username : "",
            discriminator: typeof author.discriminator === "string" ? author.discriminator : "0",
            avatar: typeof author.avatar === "string" ? author.avatar : null,
            bot: author.bot === true,
            system: author.system === true,
            global_name: typeof author.globalName === "string" ? author.globalName : null,
            public_flags: typeof author.publicFlags === "number" ? author.publicFlags : 0
        },

        content: typeof message.content === "string" ? message.content : "",

        timestamp: typeof timestamp === "string"
            ? timestamp
            : timestamp?.toISOString?.() ?? new Date().toISOString(),

        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        embeds: Array.isArray(message.embeds) ? message.embeds : [],
        pinned: false,
        flags: typeof message.flags === "number" ? message.flags : 0
    };
}

/*
 * The DM map Discord renders the list from. Writing into it
 * is the same trick as the unlocked shop items: the store
 * exposes its internal object.
 */
function getPrivateChannelMap(): Record<string, unknown> | null {
    try {
        const map = (
            ChannelStore as unknown as {
                getMutablePrivateChannels?: () => Record<string, unknown>;
            }
        ).getMutablePrivateChannels?.();

        return map && typeof map === "object" ? map : null;
    } catch {
        return null;
    }
}

function emitChannelChange() {
    setTimeout(
        () => {
            try {
                (
                    ChannelStore as unknown as {
                        emitChange?: () => void;
                    }
                ).emitChange?.();
            } catch {
                // ignore
            }
        },
        0
    );
}

/*
 * Builds the local conversation as a COPY of the real DM
 * record: every own property descriptor is carried over, so
 * the clone keeps all of Discord's methods (copying only the
 * enumerable fields is what broke the user record earlier).
 * Only the id changes, plus isSystemDM() so the text box
 * shows up.
 */
function createVirtualChannel(): boolean {
    const map = getPrivateChannelMap();

    if (!map) {
        debug("Private channel map unavailable");
        return false;
    }

    const cloneId = getChannelId();

    if (map[cloneId]) {
        return true;
    }

    const realId = findRealChannelId();

    const template = realId
        ? ChannelStore.getChannel(realId) as unknown as Record<string, unknown> | null
        : null;

    if (!template) {
        debug("No real Discord DM to clone: open it once, then retry");
        return false;
    }

    try {
        const clone = Object.create(
            Object.getPrototypeOf(template),
            Object.getOwnPropertyDescriptors(template)
        ) as Record<string, unknown>;

        clone.id = cloneId;
        clone.lastMessageId = null;

        /*
         * Sanity check: a copy that lost its methods must
         * never reach the store.
         */
        for (const method of ["isPrivate", "isDM", "getRecipientId"]) {
            if (
                typeof template[method] === "function" &&
                typeof clone[method] !== "function"
            ) {
                debug(`Clone aborted: ${method} missing`);
                return false;
            }
        }

        Object.defineProperty(clone, "isSystemDM", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: () => !isConversationUnlocked()
        });

        map[cloneId] = clone;

        emitChannelChange();

        debug("Local conversation added to the DM list", cloneId);

        return true;
    } catch (error) {
        console.warn("[Iris.ts] Could not build the local Discord conversation", error);
        return false;
    }
}

function deleteVirtualChannel() {
    const map = getPrivateChannelMap();

    const id = settings.store.officialChannelId;

    if (!map || typeof id !== "string" || !id) {
        return;
    }

    try {
        delete map[id];
        emitChannelChange();
    } catch (error) {
        debug("Local conversation removal failed", error);
    }
}

/*
 * =====================================================
 * COMPOSER LOCK (real DM)
 * =====================================================
 *
 * Discord hides the text box of the official DM because the
 * channel reports isSystemDM() === true. On a REAL DM the
 * recipient cannot be changed, so the method is overridden
 * on that one channel record only, exactly like the user
 * record overrides elsewhere in the plugin.
 */

let patchedChannel: Record<string, unknown> | null = null;

/*
 * Original descriptor, restored on relock. Deleting the
 * property instead would remove the method for good when
 * Discord defines it as an OWN property, and everything
 * calling isSystemDM() would crash.
 */
let patchedChannelDescriptor: PropertyDescriptor | null | undefined = null;

function applyChannelUnlock() {
    try {
        const channelId = getTargetChannelId();

        const channel = ChannelStore.getChannel(
            channelId
        ) as unknown as Record<string, unknown> | null | undefined;

        if (!channel || !Object.isExtensible(channel)) {
            return;
        }

        if (patchedChannel && patchedChannel !== channel) {
            restoreChannelLock();
        }

        if (!isConversationUnlocked()) {
            restoreChannelLock();
            return;
        }

        const descriptor = Object.getOwnPropertyDescriptor(channel, "isSystemDM");

        if (descriptor && !descriptor.configurable) {
            return;
        }

        if (typeof channel.isSystemDM !== "function") {
            debug("Channel has no isSystemDM, nothing to unlock");
            return;
        }

        patchedChannelDescriptor = descriptor;

        Object.defineProperty(channel, "isSystemDM", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: () => false
        });

        patchedChannel = channel;

        debug("Composer unlocked on", channelId);
    } catch (error) {
        debug("Composer unlock failed", error);
    }
}

function restoreChannelLock() {
    if (!patchedChannel) {
        return;
    }

    try {
        if (patchedChannelDescriptor) {
            /*
             * Own property: put the original method back.
             */
            Object.defineProperty(
                patchedChannel,
                "isSystemDM",
                patchedChannelDescriptor
            );
        } else {
            /*
             * Inherited method: removing ours is enough.
             */
            delete patchedChannel.isSystemDM;
        }
    } catch {
        // record already replaced by Discord
    }

    patchedChannel = null;
    patchedChannelDescriptor = null;
}

/*
 * =====================================================
 * MESSAGES
 * =====================================================
 */

function buildRawMessage(
    message: FakeOfficialMessage,
    channelId: string,
    nonce?: string
): Record<string, unknown> | null {
    const self = UserStore.getCurrentUser() as unknown as Record<string, unknown> | null;

    const author: RawUser | null = message.fromSelf
        ? self
            ? {
                id: String(self.id),
                username: typeof self.username === "string" ? self.username : "",
                discriminator: typeof self.discriminator === "string" ? self.discriminator : "0",
                avatar: typeof self.avatar === "string" ? self.avatar : null,
                bot: false,
                system: false,
                global_name: typeof self.globalName === "string" ? self.globalName : null,
                public_flags: typeof self.publicFlags === "number" ? self.publicFlags : 0
            }
            : null
        : getOfficialRawUser();

    if (!author) {
        return null;
    }

    return {
        id: message.id,
        type: 0,
        channel_id: channelId,
        author,
        content: message.content,
        timestamp: new Date(message.timestamp).toISOString(),
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        pinned: false,
        flags: 0,

        /*
         * Discord matches the reply to the optimistic message
         * it already displayed through this nonce. Without it
         * the message stays pending and never appears.
         */
        nonce: nonce ?? null
    };
}

function dispatchMessage(message: FakeOfficialMessage) {
    const channelId = getTargetChannelId();
    const raw = buildRawMessage(message, channelId);

    if (!raw) {
        return;
    }

    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_CREATE",
            channelId,
            message: raw,
            optimistic: false,
            isPushNotification: false
        });
    } catch (error) {
        console.warn("[Iris.ts] Could not inject the local message", error);
    }
}

function undispatchMessage(id: string) {
    try {
        FluxDispatcher.dispatch({
            type: "MESSAGE_DELETE",
            id,
            channelId: getTargetChannelId()
        });
    } catch (error) {
        debug("Local message removal failed", error);
    }
}

/*
 * Re-injects every stored message, oldest first.
 */
function injectStoredMessages() {
    for (const message of getStoredMessages()) {
        dispatchMessage(message);
    }
}

/*
 * =====================================================
 * PUBLIC ACTIONS (settings UI)
 * =====================================================
 */

export function addMessage(
    content: string,
    fromSelf = false,

    /*
     * false when Discord is going to display the message
     * itself from the reply we hand back (composer path):
     * dispatching here as well would show it twice.
     */
    dispatch = true
): FakeOfficialMessage | null {
    const text = content.trim();

    if (!text) {
        return null;
    }

    const timestamp = Date.now();

    const message: FakeOfficialMessage = {
        id: localSnowflake(timestamp),
        fromSelf,
        content: text,
        timestamp
    };

    setStoredMessages([...getStoredMessages(), message]);

    if (dispatch) {
        createVirtualChannel();
        dispatchMessage(message);
    }

    return message;
}

export function removeMessage(id: string) {
    setStoredMessages(
        getStoredMessages().filter(message => message.id !== id)
    );

    undispatchMessage(id);
}

export function clearMessages() {
    for (const message of getStoredMessages()) {
        undispatchMessage(message.id);
    }

    setStoredMessages([]);
}

/*
 * Unlock: the recipient stops being a system user, so Discord
 * shows the text box again. Relock hides it. The channel is
 * rebuilt locally either way.
 */
export function setConversationUnlocked(unlocked: boolean): boolean {
    if (unlocked) {
        /*
         * Never unlock without the guard: a message typed in
         * the conversation would reach Discord for real.
         */
        installNetworkGuard();

        if (!isNetworkGuardActive()) {
            settings.store.officialUnlocked = false;
            return false;
        }
    }

    settings.store.officialUnlocked = unlocked;

    if (isCloneMode()) {
        /*
         * Local copy: built from the real DM, unlocked or
         * locked through its own isSystemDM().
         */
        if (createVirtualChannel()) {
            cloneRealConversation();
            injectStoredMessages();
        }

        emitChannelChange();

        return true;
    }

    /*
     * Real DM: only the channel record method is overridden.
     */
    if (unlocked) {
        applyChannelUnlock();
    } else {
        restoreChannelLock();
    }

    /*
     * Nudges the channel view to re-render.
     */
    try {
        (
            ChannelStore as unknown as {
                emitChange?: () => void;
            }
        ).emitChange?.();
    } catch {
        // ignore
    }

    return true;
}

export function isConversationUnlocked(): boolean {
    return settings.store.officialUnlocked === true;
}

/*
 * =====================================================
 * COMPOSER INTERCEPTION
 * =====================================================
 *
 * While unlocked, anything typed in THIS conversation is
 * turned into a local message instead of being sent. Every
 * other channel goes to Discord untouched.
 */
function installSendInterception() {
    if (originalSendMessage) {
        return;
    }

    const actions = MessageActions as unknown as {
        sendMessage?: (...args: unknown[]) => unknown;
    };

    if (typeof actions?.sendMessage !== "function") {
        debug("sendMessage not found, composer interception disabled");
        return;
    }

    const original = actions.sendMessage;

    const wrapper = function (this: unknown, ...args: unknown[]) {
        try {
            const channelId = args[0];
            const payload = args[1] as { content?: unknown; } | undefined;

            if (
                typeof channelId === "string" &&
                channelId === getTargetChannelId() &&
                isConversationUnlocked()
            ) {
                const content = typeof payload?.content === "string"
                    ? payload.content
                    : "";

                addMessage(content, true);

                /*
                 * Nothing is sent: Discord gets a resolved
                 * promise, exactly as if the send succeeded.
                 */
                return Promise.resolve({ ok: true, body: {} });
            }
        } catch (error) {
            debug("Send interception error, message sent normally", error);
        }

        return original.apply(this, args);
    };

    try {
        actions.sendMessage = wrapper;
    } catch {
        // read-only export
    }

    if (actions.sendMessage === wrapper) {
        originalSendMessage = original;
        debug("Composer interception installed");
    } else {
        console.warn("[Iris.ts] Could not intercept sendMessage: keep the conversation locked");
    }
}

function uninstallSendInterception() {
    if (!originalSendMessage) {
        return;
    }

    const actions = MessageActions as unknown as {
        sendMessage?: (...args: unknown[]) => unknown;
    };

    actions.sendMessage = originalSendMessage;
    originalSendMessage = null;
}

/*
 * =====================================================
 * SEND QUEUE HOOK (patched in index.ts)
 * =====================================================
 *
 * Messages typed in the composer go through
 *
 *   queue.enqueue(payload, callback)
 *
 * and the callback receives { ok, body }, which Discord then
 * feeds to its own receiveMessage(). The composer captures
 * that path at module load, which is why wrapping
 * sendMessage or RestAPI.post afterwards never fired: the
 * request left for real.
 *
 * For THIS conversation only, the payload never reaches the
 * queue: the callback is called with a locally built message
 * and Discord displays it through its normal success path.
 * Any other channel is enqueued untouched.
 */
export function enqueueMessageHook(
    queue: { enqueue: (payload: unknown, callback: (result: unknown) => void) => unknown; },
    payload: unknown,
    callback: (result: unknown) => void
): unknown {
    try {
        const data = payload as {
            channelId?: unknown;
            message?: { channel_id?: unknown; content?: unknown; nonce?: unknown; };
        } | undefined;

        const channelId = typeof data?.channelId === "string"
            ? data.channelId
            : typeof data?.message?.channel_id === "string"
                ? data.message.channel_id
                : "";

        if (
            channelId &&
            channelId === getTargetChannelId() &&
            isConversationUnlocked()
        ) {
            const content = typeof data?.message?.content === "string"
                ? data.message.content
                : "";

            const nonce = typeof data?.message?.nonce === "string"
                ? data.message.nonce
                : undefined;

            const message = addMessage(content, true, false);

            const raw = message
                ? buildRawMessage(message, channelId, nonce)
                : null;

            debug("Message kept local, never queued", channelId);

            /*
             * Same result shape as a successful send.
             */
            callback({
                ok: true,
                status: 200,
                body: raw ?? {}
            });

            return undefined;
        }
    } catch (error) {
        debug("Queue hook error, message queued normally", error);
    }

    return queue.enqueue(payload, callback);
}

/*
 * =====================================================
 * NETWORK GUARD
 * =====================================================
 *
 * The composer captures sendMessage before the plugin can
 * wrap it, so wrapping the action is not enough: the request
 * went out for real once. The POST itself is therefore
 * intercepted, exactly like the profile save interception.
 *
 * ONLY /channels/<this conversation>/messages is caught.
 * Every other request goes out untouched.
 */
function installNetworkGuard() {
    if (originalPost) {
        return;
    }

    const api = RestAPI as unknown as { post?: RestPost; };

    if (typeof api?.post !== "function") {
        console.warn("[Iris.ts] RestAPI.post not found: keep the Discord conversation locked");
        return;
    }

    const original = api.post;

    const wrapper: RestPost = function (this: unknown, request) {
        try {
            const url = typeof request?.url === "string" ? request.url : "";

            const match = /^\/channels\/(\d+)\/messages$/.exec(url);

            if (match) {
                debug(
                    "Message POST seen",
                    {
                        channel: match[1],
                        target: getTargetChannelId(),
                        matches: match[1] === getTargetChannelId(),
                        unlocked: isConversationUnlocked()
                    }
                );
            }

            if (
                match &&
                match[1] === getTargetChannelId() &&
                isConversationUnlocked()
            ) {
                const body = request.body as { content?: unknown; } | undefined;

                const content = typeof body?.content === "string"
                    ? body.content
                    : "";

                const nonce = typeof (body as { nonce?: unknown; })?.nonce === "string"
                    ? (body as { nonce: string; }).nonce
                    : undefined;

                const message = addMessage(content, true, false);

                const raw = message
                    ? buildRawMessage(message, getTargetChannelId(), nonce)
                    : null;

                debug("Message kept local, not sent:", url);

                if (!raw) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        body: {}
                    });
                }

                /*
                 * The HTTP reply alone is not enough: Discord
                 * keeps the message greyed out until the
                 * gateway echoes it back. That event is
                 * simulated here, with the SAME nonce, so it
                 * replaces the pending message instead of
                 * adding a second one.
                 */
                setTimeout(
                    () => {
                        try {
                            /*
                             * Same shape as the real confirm
                             * event captured in the client:
                             * guildId present, optimistic
                             * false, id different from the
                             * nonce it confirms.
                             */
                            FluxDispatcher.dispatch({
                                type: "MESSAGE_CREATE",
                                guildId: null,
                                channelId: getTargetChannelId(),
                                message: raw,
                                optimistic: false,
                                isPushNotification: false
                            });

                            debug("Local confirm dispatched", raw.id, "nonce", raw.nonce);
                        } catch (error) {
                            debug("Local echo failed", error);
                        }
                    },
                    0
                );

                /*
                 * Same reply shape as a successful send.
                 */
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    headers: {},
                    body: raw
                });
            }
        } catch (error) {
            debug("Network guard error, request sent normally", error);
        }

        return original.call(this, request);
    };

    try {
        api.post = wrapper;
    } catch {
        // read-only export
    }

    if (api.post === wrapper) {
        originalPost = original;
        installedPost = wrapper;
        debug("Network guard installed");
    } else {
        console.warn("[Iris.ts] Could not intercept message sending: keep the Discord conversation locked");
    }
}

function uninstallNetworkGuard() {
    if (!originalPost) {
        return;
    }

    const api = RestAPI as unknown as { post?: RestPost; };

    if (api.post === installedPost) {
        api.post = originalPost;
    }

    originalPost = null;
    installedPost = null;
}

export function isNetworkGuardActive(): boolean {
    return originalPost !== null;
}

/*
 * =====================================================
 * LIFECYCLE
 * =====================================================
 */

/*
 * ABANDONED FEATURE.
 *
 * The local Discord conversation is kept in the codebase but
 * never starts: the DM list is rebuilt by Discord on every
 * resync, so the clone could vanish or get out of sync, and
 * the composer path needed a patch on Discord's send queue.
 * Both were too fragile to ship.
 */
export const ABANDONED = true;

export function installOfficialMessages() {
    if (ABANDONED || installed) {
        return;
    }

    installed = true;

    /*
     * The official account and the DM list are not ready at
     * startup: a short delay avoids injecting into nothing.
     */
    setTimeout(() => {
        try {
            if (getStoredMessages().length === 0 && !isConversationUnlocked()) {
                return;
            }

            createVirtualChannel();

            if (isCloneMode()) {
                cloneRealConversation();
            }

            injectStoredMessages();
            applyChannelUnlock();
            installSendInterception();

            if (isConversationUnlocked()) {
                installNetworkGuard();
            }
        } catch (error) {
            console.warn("[Iris.ts] Local Discord DM startup failed", error);
        }
    }, 3000);

    installSendInterception();
}

/*
 * Plugin disabled: the DM and every fake message disappear
 * from the client right away. The settings keep them, so
 * re-enabling restores them.
 */
export function uninstallOfficialMessages() {
    if (!installed) {
        return;
    }

    installed = false;

    for (const message of getStoredMessages()) {
        undispatchMessage(message.id);
    }

    deleteVirtualChannel();
    restoreChannelLock();
    uninstallSendInterception();
    uninstallNetworkGuard();
}
