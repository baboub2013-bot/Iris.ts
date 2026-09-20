/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "./settings";

export const PROFILE_SPOOFER_API =
    "https://profilespoofer-sync.babou-b-2013.workers.dev";

const POLL_MS = 2_000;
const AUTH_TIMEOUT_MS = 10 * 60 * 1000;
const AUTO_SYNC_MS = 2_500;

const REMOTE_CACHE_TTL_MS =
    5 * 60 * 1000;

const REMOTE_NEGATIVE_TTL_MS =
    60 * 1000;

const REMOTE_RETRY_MS =
    15 * 1000;

const REMOTE_BATCH_DELAY_MS =
    60;

const MAX_REMOTE_BATCH =
    100;

const SNOWFLAKE =
    /^\d{15,22}$/;

type NetworkStatus =
    | "disconnected"
    | "connecting"
    | "connected"
    | "error";

interface AuthStartResponse {
    state: string;
    authorizeUrl: string;
    expiresIn: number;
}

interface AuthStatusResponse {
    status:
    | "pending"
    | "complete"
    | "expired";

    userId?: string;
    token?: string;
}

interface PublishResponse {
    ok: boolean;
    userId: string;
    updatedAt: number;
}

interface BatchResponse {
    profiles?:
    Record<
        string,
        unknown
    >;
}

interface RemoteCacheEntry {
    profile:
    SharedProfile |
    null;

    updatedAt:
    number |
    null;

    expiresAt:
    number;

    fingerprint:
    string;
}

export interface SharedProfile {
    spoofUsername?: string;
    spoofDisplayName?: string;
    spoofPronouns?: string;
    spoofBio?: string;
    spoofLegacyUsername?: string;
    spoofAccountCreationDate?: string;

    selectedBadges?: string[];

    nitroTier?: string;
    boostTier?: string;

    selectedDecoration?: string;
    unlockedDecorationAsset?: string;

    profileEffect?: string;
    nameplate?: string;
    profileFrame?: string;

    replaceRealBadges?: boolean;
}

export interface NetworkSnapshot {
    status:
    NetworkStatus;

    userId:
    string |
    null;

    lastError:
    string |
    null;

    lastPublishedAt:
    number |
    null;

    publishing:
    boolean;

    cachedRemoteProfiles:
    number;
}

let status:
    NetworkStatus =
    "disconnected";

let lastError:
    string |
    null =
    null;

let lastPublishedAt:
    number |
    null =
    null;

let publishing =
    false;

let lastFingerprint =
    "";

let ownSyncTimer:
    ReturnType<
        typeof setInterval
    > |
    null =
    null;

let remoteFlushTimer:
    ReturnType<
        typeof setTimeout
    > |
    null =
    null;

let authRun =
    0;

let networkAccessChecked =
    false;

let networkPermissionRequestedThisSession =
    false;

let remoteGeneration =
    0;

const listeners =
    new Set<
        () => void
    >();

const remoteProfileListeners =
    new Set<
        (
            userIds:
                string[]
        ) => void
    >();

const remoteProfileCache =
    new Map<
        string,
        RemoteCacheEntry
    >();

const pendingRemoteIds =
    new Set<
        string
    >();

const remoteRetryAt =
    new Map<
        string,
        number
    >();

const sleep =
    (
        ms:
            number
    ) =>
        new Promise<void>(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );

function debug(
    ...args:
        unknown[]
) {
    if (
        settings.store
            .debugLogs
    ) {
        console.info(
            "[ProfileSpoofer Network]",
            ...args
        );
    }
}

function emit() {
    for (
        const listener
        of listeners
    ) {
        listener();
    }
}

function emitRemoteProfiles(
    userIds:
        string[]
) {
    if (
        !userIds.length
    ) {
        return;
    }

    const unique =
        Array.from(
            new Set(
                userIds
            )
        );

    for (
        const listener
        of remoteProfileListeners
    ) {
        listener(
            unique
        );
    }

    emit();
}

function connected() {
    return (
        !!settings.store
            .networkAuthToken &&
        !!settings.store
            .networkAuthUserId
    );
}

function setStatus(
    next:
        NetworkStatus,

    error:
        string |
        null =
        null
) {
    status =
        next;

    lastError =
        error;

    emit();
}

function clearAuth() {
    settings.store
        .networkAuthToken =
        undefined;

    settings.store
        .networkAuthUserId =
        undefined;

    lastFingerprint =
        "";

    setStatus(
        "disconnected"
    );
}

/*
 * Vencord requires connect-src permission for the Worker.
 *
 * If permission was just granted, Discord normally needs
 * one full restart before fetch can use the new CSP.
 */
async function ensureNetworkAccess() {
    if (
        networkAccessChecked
    ) {
        return;
    }

    const csp =
        VencordNative.csp as any;

    if (
        !csp
    ) {
        networkAccessChecked =
            true;

        return;
    }

    try {
        if (
            typeof csp.isDomainAllowed ===
            "function"
        ) {
            const allowed =
                await csp.isDomainAllowed(
                    PROFILE_SPOOFER_API,
                    [
                        "connect-src"
                    ]
                );

            if (
                allowed
            ) {
                networkAccessChecked =
                    true;

                return;
            }
        }

        if (
            networkPermissionRequestedThisSession
        ) {
            throw new Error(
                "network_permission_restart_required"
            );
        }

        networkPermissionRequestedThisSession =
            true;

        if (
            typeof csp.requestAddOverride ===
            "function"
        ) {
            await csp.requestAddOverride(
                PROFILE_SPOOFER_API,
                [
                    "connect-src"
                ],
                "ProfileSpoofer"
            );
        }

        if (
            typeof csp.isDomainAllowed ===
            "function"
        ) {
            const allowedAfter =
                await csp.isDomainAllowed(
                    PROFILE_SPOOFER_API,
                    [
                        "connect-src"
                    ]
                );

            if (
                allowedAfter
            ) {
                networkAccessChecked =
                    true;

                return;
            }
        }

        throw new Error(
            "network_permission_restart_required"
        );
    } catch (
    error
    ) {
        if (
            error instanceof Error &&
            error.message ===
            "network_permission_restart_required"
        ) {
            throw error;
        }

        debug(
            "CSP permission check failed",
            error
        );

        /*
         * Older Vencord builds may not expose the
         * permission helpers.
         */
        networkAccessChecked =
            true;
    }
}

async function apiFetch(
    path:
        string,

    init?:
        RequestInit
) {
    await ensureNetworkAccess();

    return fetch(
        PROFILE_SPOOFER_API +
        path,
        init
    );
}

async function readJson<T>(
    response:
        Response
):
    Promise<T> {
    const text =
        await response.text();

    let body:
        unknown =
        null;

    if (
        text
    ) {
        try {
            body =
                JSON.parse(
                    text
                );
        } catch {
            throw new Error(
                `invalid_json_${response.status}`
            );
        }
    }

    if (
        !response.ok
    ) {
        const error =
            body &&
                typeof body ===
                "object" &&
                typeof (
                    body as any
                ).error ===
                "string"

                ? (
                    body as any
                ).error

                : `http_${response.status}`;

        throw new Error(
            error
        );
    }

    return body as T;
}

function readString(
    value:
        unknown,

    max:
        number
):
    string |
    undefined {
    if (
        typeof value !==
        "string"
    ) {
        return undefined;
    }

    const trimmed =
        value.trim();

    if (
        !trimmed
    ) {
        return undefined;
    }

    return trimmed.slice(
        0,
        max
    );
}

function readStringArray(
    value:
        unknown,

    maxItems:
        number,

    maxEach:
        number
):
    string[] |
    undefined {
    if (
        !Array.isArray(
            value
        )
    ) {
        return undefined;
    }

    const result =
        value
            .filter(
                item =>
                    typeof item ===
                    "string"
            )
            .map(
                item =>
                    item.trim()
            )
            .filter(
                Boolean
            )
            .slice(
                0,
                maxItems
            )
            .map(
                item =>
                    item.slice(
                        0,
                        maxEach
                    )
            );

    return result.length
        ? Array.from(
            new Set(
                result
            )
        )
        : undefined;
}

function sanitizeRemoteProfile(
    value:
        unknown
):
    SharedProfile |
    null {
    if (
        !value ||
        typeof value !==
        "object"
    ) {
        return null;
    }

    const envelope =
        value as
        Record<
            string,
            unknown
        >;

    if (
        envelope.version !==
        1 ||
        !envelope.profile ||
        typeof envelope.profile !==
        "object"
    ) {
        return null;
    }

    const source =
        envelope.profile as
        Record<
            string,
            unknown
        >;

    const profile:
        SharedProfile =
        {};

    const stringFields:
        Array<
            [
                keyof SharedProfile,
                number
            ]
        > =
        [
            [
                "spoofUsername",
                128
            ],

            [
                "spoofDisplayName",
                128
            ],

            [
                "spoofPronouns",
                128
            ],

            [
                "spoofBio",
                1024
            ],

            [
                "spoofLegacyUsername",
                128
            ],

            [
                "spoofAccountCreationDate",
                64
            ],

            [
                "nitroTier",
                32
            ],

            [
                "boostTier",
                32
            ],

            [
                "selectedDecoration",
                256
            ],

            [
                "unlockedDecorationAsset",
                256
            ],

            [
                "profileEffect",
                256
            ],

            [
                "nameplate",
                4096
            ],

            [
                "profileFrame",
                256
            ]
        ];

    for (
        const [
            field,
            max
        ]
        of stringFields
    ) {
        const parsed =
            readString(
                source[field],
                max
            );

        if (
            parsed !==
            undefined
        ) {
            (
                profile as
                Record<
                    string,
                    unknown
                >
            )[field] =
                parsed;
        }
    }

    const badges =
        readStringArray(
            source.selectedBadges,
            32,
            64
        );

    if (
        badges
    ) {
        profile.selectedBadges =
            badges;
    }

    if (
        typeof source.replaceRealBadges ===
        "boolean"
    ) {
        profile.replaceRealBadges =
            source.replaceRealBadges;
    }

    return profile;
}

function remoteFingerprint(
    profile:
        SharedProfile |
        null,

    updatedAt:
        number |
        null
) {
    return JSON.stringify({
        updatedAt,
        profile
    });
}

/*
 * =====================================================
 * OWN PROFILE
 * =====================================================
 */

function sharedPayload() {
    return {
        version:
            1,

        profile: {
            spoofUsername:
                settings.store
                    .spoofUsername ??
                "",

            spoofDisplayName:
                settings.store
                    .spoofDisplayName ??
                "",

            spoofPronouns:
                settings.store
                    .spoofPronouns ??
                "",

            spoofBio:
                settings.store
                    .spoofBio ??
                "",

            spoofLegacyUsername:
                settings.store
                    .spoofLegacyUsername ??
                "",

            spoofAccountCreationDate:
                settings.store
                    .spoofAccountCreationDate ??
                "",

            selectedBadges:
                Array.isArray(
                    settings.store
                        .selectedBadges
                )
                    ? settings.store
                        .selectedBadges
                    : [],

            nitroTier:
                settings.store
                    .nitroTier ??
                "none",

            boostTier:
                settings.store
                    .boostTier ??
                "none",

            selectedDecoration:
                settings.store
                    .selectedDecoration ??
                "none",

            unlockedDecorationAsset:
                settings.store
                    .unlockedDecorationAsset ??
                "",

            profileEffect:
                settings.store
                    .profileEffect ??
                "none",

            nameplate:
                settings.store
                    .nameplate ??
                "none",

            profileFrame:
                settings.store
                    .profileFrame ??
                "none",

            replaceRealBadges:
                settings.store
                    .replaceRealBadges ??
                false
        }
    };
}

/*
 * =====================================================
 * SNAPSHOT
 * =====================================================
 */

export function getNetworkSnapshot():
    NetworkSnapshot {
    return {
        status:
            status ===
                "connecting" ||
                status ===
                "error"

                ? status

                : connected()
                    ? "connected"
                    : "disconnected",

        userId:
            settings.store
                .networkAuthUserId ??
            null,

        lastError,

        lastPublishedAt,

        publishing,

        cachedRemoteProfiles:
            Array.from(
                remoteProfileCache.values()
            ).filter(
                entry =>
                    entry.profile !==
                    null
            ).length
    };
}

export function subscribeNetworkSnapshot(
    listener:
        () => void
) {
    listeners.add(
        listener
    );

    return () => {
        listeners.delete(
            listener
        );
    };
}

export function subscribeRemoteProfiles(
    listener:
        (
            userIds:
                string[]
        ) => void
) {
    remoteProfileListeners.add(
        listener
    );

    return () => {
        remoteProfileListeners.delete(
            listener
        );
    };
}

/*
 * =====================================================
 * REMOTE PROFILE CACHE
 * =====================================================
 */

export function getSharedProfile(
    userId?:
        string |
        null
):
    SharedProfile |
    null {
    if (
        !userId ||
        !SNOWFLAKE.test(
            userId
        ) ||
        !(
            settings.store
                .networkShowOtherProfiles ??
            true
        )
    ) {
        return null;
    }

    const entry =
        remoteProfileCache.get(
            userId
        );

    if (
        entry &&
        entry.expiresAt >
        Date.now()
    ) {
        return entry.profile;
    }

    queueSharedProfile(
        userId
    );

    /*
     * Keep old data while refreshing.
     */
    return (
        entry?.profile ??
        null
    );
}

export function queueSharedProfile(
    userId?:
        string |
        null
) {
    if (
        !userId ||
        !SNOWFLAKE.test(
            userId
        ) ||
        !(
            settings.store
                .networkShowOtherProfiles ??
            true
        )
    ) {
        return;
    }

    const entry =
        remoteProfileCache.get(
            userId
        );

    if (
        entry &&
        entry.expiresAt >
        Date.now()
    ) {
        return;
    }

    if (
        (
            remoteRetryAt.get(
                userId
            ) ??
            0
        ) >
        Date.now()
    ) {
        return;
    }

    pendingRemoteIds.add(
        userId
    );

    if (
        remoteFlushTimer
    ) {
        return;
    }

    remoteFlushTimer =
        setTimeout(
            () => {
                remoteFlushTimer =
                    null;

                void flushRemoteQueue();
            },

            REMOTE_BATCH_DELAY_MS
        );
}

async function flushRemoteQueue() {
    if (
        !pendingRemoteIds.size
    ) {
        return;
    }

    const generation =
        remoteGeneration;

    const userIds =
        Array.from(
            pendingRemoteIds
        ).slice(
            0,
            MAX_REMOTE_BATCH
        );

    for (
        const userId
        of userIds
    ) {
        pendingRemoteIds.delete(
            userId
        );
    }

    try {
        const result =
            await readJson<BatchResponse>(
                await apiFetch(
                    "/v1/profiles/batch",

                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                userIds
                            })
                    }
                )
            );

        if (
            generation !==
            remoteGeneration
        ) {
            return;
        }

        const changed:
            string[] =
            [];

        const now =
            Date.now();

        for (
            const userId
            of userIds
        ) {
            const raw =
                result.profiles?.[
                userId
                ];

            const profile =
                raw
                    ? sanitizeRemoteProfile(
                        raw
                    )
                    : null;

            const updatedAt =
                raw &&
                    typeof raw ===
                    "object" &&
                    typeof (
                        raw as any
                    ).updatedAt ===
                    "number"

                    ? (
                        raw as any
                    ).updatedAt

                    : null;

            const fingerprint =
                remoteFingerprint(
                    profile,
                    updatedAt
                );

            const previous =
                remoteProfileCache.get(
                    userId
                );

            remoteProfileCache.set(
                userId,

                {
                    profile,
                    updatedAt,

                    expiresAt:
                        now +
                        (
                            profile
                                ? REMOTE_CACHE_TTL_MS
                                : REMOTE_NEGATIVE_TTL_MS
                        ),

                    fingerprint
                }
            );

            remoteRetryAt.delete(
                userId
            );

            if (
                !previous ||
                previous.fingerprint !==
                fingerprint
            ) {
                changed.push(
                    userId
                );
            }
        }

        if (
            changed.length
        ) {
            debug(
                "Remote profiles updated",
                changed
            );

            emitRemoteProfiles(
                changed
            );
        }
    } catch (
    error
    ) {
        const retryAt =
            Date.now() +
            REMOTE_RETRY_MS;

        for (
            const userId
            of userIds
        ) {
            remoteRetryAt.set(
                userId,
                retryAt
            );
        }

        debug(
            "Remote profile batch failed",
            error
        );
    } finally {
        if (
            pendingRemoteIds.size &&
            !remoteFlushTimer
        ) {
            remoteFlushTimer =
                setTimeout(
                    () => {
                        remoteFlushTimer =
                            null;

                        void flushRemoteQueue();
                    },

                    REMOTE_BATCH_DELAY_MS
                );
        }
    }
}

export function refreshRemoteProfiles(
    forceNetwork =
        false
) {
    const userIds =
        Array.from(
            remoteProfileCache.keys()
        );

    if (
        forceNetwork
    ) {
        for (
            const userId
            of userIds
        ) {
            const entry =
                remoteProfileCache.get(
                    userId
                );

            if (
                entry
            ) {
                entry.expiresAt =
                    0;
            }

            remoteRetryAt.delete(
                userId
            );

            queueSharedProfile(
                userId
            );
        }
    }

    emitRemoteProfiles(
        userIds
    );
}

export function clearRemoteProfileCache() {
    ++remoteGeneration;

    const userIds =
        Array.from(
            remoteProfileCache.keys()
        );

    remoteProfileCache.clear();
    pendingRemoteIds.clear();
    remoteRetryAt.clear();

    if (
        remoteFlushTimer
    ) {
        clearTimeout(
            remoteFlushTimer
        );

        remoteFlushTimer =
            null;
    }

    emitRemoteProfiles(
        userIds
    );
}

/*
 * =====================================================
 * OAUTH
 * =====================================================
 */

export async function beginNetworkLogin() {
    if (
        status ===
        "connecting"
    ) {
        return;
    }

    const run =
        ++authRun;

    setStatus(
        "connecting"
    );

    try {
        const start =
            await readJson<AuthStartResponse>(
                await apiFetch(
                    "/v1/auth/start",

                    {
                        method:
                            "POST"
                    }
                )
            );

        if (
            !start.state ||
            !start.authorizeUrl
        ) {
            throw new Error(
                "invalid_auth_start"
            );
        }

        await VencordNative
            .native
            .openExternal(
                start.authorizeUrl
            );

        const deadline =
            Date.now() +
            Math.min(
                AUTH_TIMEOUT_MS,

                Math.max(
                    30_000,

                    (
                        start.expiresIn ||
                        600
                    ) * 1000
                )
            );

        while (
            run === authRun &&
            Date.now() <
            deadline
        ) {
            await sleep(
                POLL_MS
            );

            if (
                run !==
                authRun
            ) {
                return;
            }

            const response =
                await apiFetch(
                    `/v1/auth/status/${encodeURIComponent(start.state)}`
                );

            if (
                response.status ===
                410
            ) {
                throw new Error(
                    "login_expired"
                );
            }

            const auth =
                await readJson<AuthStatusResponse>(
                    response
                );

            if (
                auth.status ===
                "pending"
            ) {
                continue;
            }

            if (
                auth.status ===
                "complete" &&
                auth.userId &&
                auth.token
            ) {
                settings.store
                    .networkAuthUserId =
                    auth.userId;

                settings.store
                    .networkAuthToken =
                    auth.token;

                lastFingerprint =
                    "";

                setStatus(
                    "connected"
                );

                debug(
                    "Connected as",
                    auth.userId
                );

                if (
                    settings.store
                        .networkShareProfile
                ) {
                    await syncOwnProfileIfNeeded(
                        true
                    );
                }

                return;
            }

            throw new Error(
                "login_expired"
            );
        }

        throw new Error(
            "login_timeout"
        );
    } catch (
    error
    ) {
        if (
            run !==
            authRun
        ) {
            return;
        }

        const message =
            error instanceof Error
                ? error.message
                : String(
                    error
                );

        setStatus(
            "error",
            message
        );

        debug(
            "Login failed",
            message
        );

        throw error;
    }
}

/*
 * =====================================================
 * PUBLISH
 * =====================================================
 */

export async function syncOwnProfileIfNeeded(
    force =
        false
):
    Promise<boolean> {
    if (
        !settings.store
            .networkShareProfile ||
        !connected() ||
        publishing
    ) {
        return false;
    }

    const fingerprint =
        JSON.stringify(
            sharedPayload()
        );

    if (
        !force &&
        fingerprint ===
        lastFingerprint
    ) {
        return false;
    }

    const token =
        settings.store
            .networkAuthToken;

    if (
        !token
    ) {
        return false;
    }

    publishing =
        true;

    emit();

    try {
        const response =
            await apiFetch(
                "/v1/profile",

                {
                    method:
                        "PUT",

                    headers: {
                        Authorization:
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        fingerprint
                }
            );

        if (
            response.status ===
            401
        ) {
            clearAuth();

            return false;
        }

        const result =
            await readJson<PublishResponse>(
                response
            );

        lastFingerprint =
            fingerprint;

        lastPublishedAt =
            result.updatedAt ||
            Date.now();

        lastError =
            null;

        status =
            "connected";

        debug(
            "Profile published"
        );

        return true;
    } catch (
    error
    ) {
        lastError =
            error instanceof Error
                ? error.message
                : String(
                    error
                );

        status =
            "error";

        debug(
            "Publish failed",
            lastError
        );

        return false;
    } finally {
        publishing =
            false;

        emit();
    }
}

export async function deleteSharedProfile():
    Promise<boolean> {
    const token =
        settings.store
            .networkAuthToken;

    if (
        !token
    ) {
        lastFingerprint =
            "";

        lastPublishedAt =
            null;

        emit();

        return true;
    }

    try {
        const response =
            await apiFetch(
                "/v1/profile",

                {
                    method:
                        "DELETE",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );

        if (
            response.status ===
            401
        ) {
            clearAuth();

            return false;
        }

        await readJson<{
            ok: boolean;
        }>(
            response
        );

        lastFingerprint =
            "";

        lastPublishedAt =
            null;

        lastError =
            null;

        status =
            "connected";

        emit();

        return true;
    } catch (
    error
    ) {
        lastError =
            error instanceof Error
                ? error.message
                : String(
                    error
                );

        status =
            "error";

        emit();

        debug(
            "Delete failed",
            lastError
        );

        return false;
    }
}

export async function disconnectNetwork(
    removeSharedProfile =
        true
) {
    ++authRun;

    if (
        removeSharedProfile &&
        settings.store
            .networkShareProfile
    ) {
        await deleteSharedProfile();
    }

    settings.store
        .networkShareProfile =
        false;

    clearAuth();
}

/*
 * =====================================================
 * START / STOP
 * =====================================================
 */

export function startNetworkSync() {
    if (
        connected()
    ) {
        status =
            "connected";
    }

    if (
        !ownSyncTimer
    ) {
        ownSyncTimer =
            setInterval(
                () =>
                    void syncOwnProfileIfNeeded(),

                AUTO_SYNC_MS
            );
    }

    if (
        settings.store
            .networkShareProfile
    ) {
        void syncOwnProfileIfNeeded(
            true
        );
    }

    emit();
}

export function stopNetworkSync() {
    ++authRun;
    ++remoteGeneration;

    if (
        ownSyncTimer
    ) {
        clearInterval(
            ownSyncTimer
        );

        ownSyncTimer =
            null;
    }

    if (
        remoteFlushTimer
    ) {
        clearTimeout(
            remoteFlushTimer
        );

        remoteFlushTimer =
            null;
    }

    pendingRemoteIds.clear();
    remoteRetryAt.clear();
    remoteProfileCache.clear();
}
