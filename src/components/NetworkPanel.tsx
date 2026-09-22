/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Switch } from "@components/Switch";
import {
    Button,
    Forms,
    Toasts,
    useEffect,
    useState
} from "@webpack/common";

import { settings } from "../settings";
import {
    beginNetworkLogin,
    deleteSharedProfile,
    disconnectNetwork,
    getNetworkSnapshot,
    refreshRemoteProfiles,
    subscribeNetworkSnapshot,
    syncOwnProfileIfNeeded
} from "../sync";

function toast(
    message:
        string,

    type =
        Toasts.Type.SUCCESS
) {
    Toasts.show({
        id:
            Toasts.genId(),

        type,

        message
    });
}

function friendlyError(
    error:
        unknown
) {
    const value =
        error instanceof Error
            ? error.message
            : String(
                error
            );

    if (
        value ===
        "login_expired"
    ) {
        return "Discord login expired. Try connecting again.";
    }

    if (
        value ===
        "login_timeout"
    ) {
        return "Discord login timed out. Try connecting again.";
    }

    if (
        value ===
        "oauth_not_configured"
    ) {
        return "The Iris Network backend OAuth configuration is incomplete.";
    }

    if (
        value ===
        "network_permission_restart_required"
    ) {
        return "Network permission was added. Fully restart Discord once, then press Connect Discord again.";
    }

    if (
        value ===
        "Failed to fetch"
    ) {
        return "Could not reach the Iris Network backend. Check Vencord network permission and restart Discord.";
    }

    return (
        value ||
        "Unknown network error."
    );
}

export function NetworkPanel() {
    const [
        snapshot,
        setSnapshot
    ] =
        useState(
            getNetworkSnapshot()
        );

    const [
        shareProfile,
        setShareProfile
    ] =
        useState(
            settings.store
                .networkShareProfile ??
            false
        );

    const [
        showOthers,
        setShowOthers
    ] =
        useState(
            settings.store
                .networkShowOtherProfiles ??
            true
        );

    const [
        showCustomImages,
        setShowCustomImages
    ] =
        useState(
            settings.store
                .networkAllowCustomImages ??
            false
        );

    useEffect(
        () =>
            subscribeNetworkSnapshot(
                () =>
                    setSnapshot(
                        getNetworkSnapshot()
                    )
            ),

        []
    );

    const connected =
        snapshot.status ===
        "connected";

    const connecting =
        snapshot.status ===
        "connecting";

    async function connect() {
        try {
            await beginNetworkLogin();

            toast(
                "Iris Network connected."
            );
        } catch (
        error
        ) {
            toast(
                friendlyError(
                    error
                ),

                Toasts.Type.FAILURE
            );
        }
    }

    async function disconnect() {
        await disconnectNetwork(
            true
        );

        setShareProfile(
            false
        );

        toast(
            "Disconnected and removed your shared profile."
        );
    }

    async function toggleShare(
        value:
            boolean
    ) {
        settings.store
            .networkShareProfile =
            value;

        setShareProfile(
            value
        );

        if (
            value
        ) {
            if (
                !connected
            ) {
                toast(
                    "Sharing is ready. Connect your Discord account to publish it.",

                    Toasts.Type.MESSAGE
                );

                return;
            }

            const published =
                await syncOwnProfileIfNeeded(
                    true
                );

            toast(
                published
                    ? "Your Iris.ts profile is now shared."
                    : "Could not publish the profile.",

                published
                    ? Toasts.Type.SUCCESS
                    : Toasts.Type.FAILURE
            );

            return;
        }

        const removed =
            await deleteSharedProfile();

        toast(
            removed
                ? "Your shared Iris.ts profile was removed."
                : "Could not remove the shared profile.",

            removed
                ? Toasts.Type.SUCCESS
                : Toasts.Type.FAILURE
        );
    }

    async function publishNow() {
        const published =
            await syncOwnProfileIfNeeded(
                true
            );

        toast(
            published
                ? "Profile published."
                : "Nothing was published. Enable sharing and connect first.",

            published
                ? Toasts.Type.SUCCESS
                : Toasts.Type.FAILURE
        );
    }

    async function removeProfile() {
        settings.store
            .networkShareProfile =
            false;

        setShareProfile(
            false
        );

        const removed =
            await deleteSharedProfile();

        toast(
            removed
                ? "Shared profile removed."
                : "Could not remove the shared profile.",

            removed
                ? Toasts.Type.SUCCESS
                : Toasts.Type.FAILURE
        );
    }

    function toggleShowOthers(
        value:
            boolean
    ) {
        settings.store
            .networkShowOtherProfiles =
            value;

        setShowOthers(
            value
        );

        refreshRemoteProfiles(
            false
        );
    }

    function toggleCustomImages(
        value:
            boolean
    ) {
        settings.store
            .networkAllowCustomImages =
            value;

        setShowCustomImages(
            value
        );
    }

    function refreshSeenProfiles() {
        refreshRemoteProfiles(
            true
        );

        toast(
            "Refreshing Iris.ts users seen by this client.",

            Toasts.Type.MESSAGE
        );
    }

    const statusText =
        connecting
            ? "Waiting for Discord authorization..."

            : connected
                ? `Connected${snapshot.userId ? ` as ${snapshot.userId}` : ""}`

                : snapshot.status ===
                    "error"

                    ? `Error: ${snapshot.lastError ?? "Unknown error"}`

                    : "Not connected";

    const lastPublishText =
        snapshot.lastPublishedAt

            ? new Date(
                snapshot.lastPublishedAt
            ).toLocaleTimeString()

            : "Not published this session";

    return (
        <div
            className="ps-panel"
        >
            <div
                className="ps-section-header"
            >
                <div>
                    <Forms.FormTitle
                        tag="h3"
                    >
                        Iris Network
                    </Forms.FormTitle>

                    <Forms.FormText>
                        Share your local Iris.ts profile with other people using Iris.ts. Discord itself is never modified.
                    </Forms.FormText>
                </div>

                {!connected ? (
                    <Button
                        color={
                            Button
                                .Colors
                                .BRAND
                        }

                        disabled={
                            connecting
                        }

                        onClick={
                            () =>
                                void connect()
                        }
                    >
                        {
                            connecting
                                ? "Connecting..."
                                : "Connect Discord"
                        }
                    </Button>
                ) : (
                    <Button
                        onClick={
                            () =>
                                void disconnect()
                        }
                    >
                        Disconnect
                    </Button>
                )}
            </div>

            <div
                className="ps-safety-card"
            >
                <div
                    className="ps-safety-icon"
                >
                    🌐
                </div>

                <div
                    className="ps-safety-content"
                >
                    <strong>
                        {statusText}
                    </strong>

                    <span>
                        OAuth uses only an Iris Network backend session. Your Discord token, password and cookies are never sent to the Iris Network backend.
                    </span>
                </div>
            </div>

            <div
                className="ps-setting-row"
            >
                <div>
                    <strong>
                        Share my Iris.ts profile
                    </strong>

                    <span>
                        Publishes only supported spoof fields. Changes sync automatically after you save them.
                    </span>
                </div>

                <Switch
                    checked={
                        shareProfile
                    }

                    onChange={
                        value =>
                            void toggleShare(
                                value
                            )
                    }
                />
            </div>

            <div
                className="ps-setting-row"
            >
                <div>
                    <strong>
                        Show other Iris.ts users
                    </strong>

                    <span>
                        Renders shared badges, display names, bios, pronouns, Nitro/boost, decorations, effects, nameplates and profile frames locally.
                    </span>
                </div>

                <Switch
                    checked={
                        showOthers
                    }

                    onChange={
                        toggleShowOthers
                    }
                />
            </div>

            <div
                className="ps-setting-row"
            >
                <div>
                    <strong>
                        Show custom images from other users
                    </strong>

                    <span>
                        Reserved for the later custom-media sync. It stays off by default because user-provided images may contain unwanted content.
                    </span>
                </div>

                <Switch
                    checked={
                        showCustomImages
                    }

                    onChange={
                        toggleCustomImages
                    }
                />
            </div>

            <div
                className="ps-setting-row"
            >
                <div>
                    <strong>
                        Seen network profiles
                    </strong>

                    <span>
                        {snapshot.cachedRemoteProfiles} profile(s) currently cached by this Discord client.
                    </span>
                </div>

                <Button
                    onClick={
                        refreshSeenProfiles
                    }
                >
                    Refresh Seen Profiles
                </Button>
            </div>

            <div
                className="ps-setting-row"
            >
                <div>
                    <strong>
                        Last publish
                    </strong>

                    <span>
                        {
                            snapshot.publishing
                                ? "Publishing now..."
                                : lastPublishText
                        }
                    </span>
                </div>

                <div
                    style={{
                        display:
                            "flex",

                        gap:
                            8,

                        flexWrap:
                            "wrap",

                        justifyContent:
                            "flex-end"
                    }}
                >
                    <Button
                        color={
                            Button
                                .Colors
                                .BRAND
                        }

                        disabled={
                            !connected ||
                            !shareProfile ||
                            snapshot.publishing
                        }

                        onClick={
                            () =>
                                void publishNow()
                        }
                    >
                        Publish Now
                    </Button>

                    <Button
                        disabled={
                            !connected
                        }

                        onClick={
                            () =>
                                void removeProfile()
                        }
                    >
                        Remove Shared Profile
                    </Button>
                </div>
            </div>
        </div>
    );
}
