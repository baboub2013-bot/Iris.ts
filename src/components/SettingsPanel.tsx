/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Switch } from "@components/Switch";
import {
    Button,
    FluxDispatcher,
    Forms,
    RestAPI,
    TextArea,
    TextInput,
    Toasts,
    useEffect,
    useMemo,
    UserStore,
    useState
} from "@webpack/common";

import {
    badgeIcon,
    BADGES,
    BOOST_TIERS,
    type CustomBadge,
    decorationIcon,
    DECORATIONS,
    NITRO_TIERS,
    parseCustomDate
} from "../catalog";
import { settings } from "../settings";
import {
    disableUnlockAll,
    enableUnlockAll
} from "../unlockAll";

type TabId =
    | "profile"
    | "badges"
    | "custom"
    | "cosmetics"
    | "advanced";

interface FrameLayerPreview {
    url: string;

    /*
     * "staple" | "rail" | "border"
     */
    type: string;

    /*
     * "back" | "front"
     */
    order: string;

    /*
     * "top" | "bottom" | "center"
     */
    anchor: string;
}

interface CosmeticCard {
    id: string;
    name: string;
    preview: string;
    subtitle?: string;

    /*
     * Extra preview URLs tried in order when `preview` fails.
     */
    previewCandidates?: string[];

    /*
     * Profile frames only: the frame layers, rendered the
     * same way Discord renders them.
     */
    layers?: FrameLayerPreview[];

    /*
     * Profile frames only: raw layer count from Discord.
     */
    layerCount?: number;

    /*
     * Profile frames only: Discord Shop thumbnail URLs,
     * tried FIRST (same URL scheme that already works for
     * the nameplate previews).
     */
    shopCandidates?: string[];
}

interface ProfileEffectConfig {
    id?: string;
    sku_id?: string;
    skuId?: string;
    title?: string;
    name?: string;
    thumbnailPreviewSrc?: string;
    thumbnail_preview_src?: string;
    reducedMotionSrc?: string;
    reduced_motion_src?: string;
}

interface DiscordNameplate {
    type?: number;
    sku_id?: string;
    skuId?: string;
    asset?: string;
    label?: string;
    palette?: string;

    assets?: {
        static_image_url?: string;
        animated_image_url?: string;
        static_image_path?: string;
        animated_image_path?: string;
    };
}

interface DiscordProfileFrame {
    type?: number;
    sku_id?: string;
    skuId?: string;
    label?: string;
    layers?: unknown[];

    assets?: {
        static_image_url?: string;
        animated_image_url?: string;
        static_image_path?: string;
        animated_image_path?: string;
    };
}

function toast(
    message: string
) {
    Toasts.show({
        id:
            Toasts.genId(),

        type:
            Toasts.Type.SUCCESS,

        message
    });
}

function safeString(
    value: unknown
):
    string {
    return typeof value ===
        "string"
        ? value
        : "";
}

function refreshLocalProfile() {
    const current =
        UserStore.getCurrentUser();

    if (
        !current?.id
    ) {
        return;
    }

    FluxDispatcher.dispatch({
        type:
            "USER_UPDATE",

        user:
            current
    });

    FluxDispatcher.dispatch({
        type:
            "CURRENT_USER_UPDATE",

        user:
            current
    });

    FluxDispatcher.dispatch({
        type:
            "USER_PROFILE_UPDATE",

        userId:
            current.id
    });
}

/*
 * =====================================================
 * COSMETIC PREVIEWS (profile frame layers)
 * =====================================================
 *
 * A Profile Frame shop item is NOT a single image: it
 * carries a `layers` array of { id, type, order, anchor }
 * with NO image path. Discord builds each layer URL from
 * SKU + layer id (see getFrameLayers). The old code looked
 * for image paths that do not exist, hence the "?".
 *
 * Preview order: real layers (back, card, front), then the
 * shop thumbnail, then any other preview URL, then "?".
 *
 * Only the settings PREVIEW uses this. The frame applied
 * to the profile (patchUserProfile) is untouched.
 */

const CDN_BASE =
    "https://cdn.discordapp.com/";

const IMAGE_FILE_REGEX =
    /\.(?:png|webp|gif|apng|jpe?g|avif)(?:[?#]|$)/i;

const VIDEO_FILE_REGEX =
    /\.(?:webm|mp4|mov)(?:[?#]|$)/i;

const ASSET_KEY_REGEX =
    /(?:url|src|asset|path|image|static|thumbnail|preview)/i;

let frameSampleLogged =
    false;

function uniqueStrings(
    values:
        Array<
            string |
            null |
            undefined
        >
):
    string[] {
    const result:
        string[] =
        [];

    for (
        const value
        of values
    ) {
        if (
            value &&
            !result.includes(
                value
            )
        ) {
            result.push(
                value
            );
        }
    }

    return result;
}

function isDiscordMediaUrl(
    value:
        string
):
    boolean {
    return (
        IMAGE_FILE_REGEX.test(
            value
        ) ||
        value.includes(
            "cdn.discordapp.com/"
        ) ||
        value.includes(
            "media.discordapp.net/"
        )
    );
}

/*
 * Turns one asset reference into candidate image URLs.
 *
 * - absolute URL          -> as is
 * - path with extension   -> cdn/<path>, cdn/assets/collectibles/<path>
 * - directory ("x/y/")    -> Discord collectible scheme <dir>static.png
 * - path without extension-> <path>/static.png, <path>.png
 * - bare id/hash          -> ignored (no verified URL scheme)
 * - videos (webm/mp4)     -> ignored (<img> cannot show them)
 */
function cdnCandidatesFromPath(
    value:
        string
):
    string[] {
    const raw =
        value.trim();

    if (
        !raw ||
        /\s/.test(
            raw
        ) ||
        VIDEO_FILE_REGEX.test(
            raw
        )
    ) {
        return [];
    }

    if (
        /^https?:\/\//i.test(
            raw
        )
    ) {
        return isDiscordMediaUrl(
            raw
        )
            ? [raw]
            : [];
    }

    const path =
        raw.replace(
            /^\/+/,
            ""
        );

    if (
        IMAGE_FILE_REGEX.test(
            path
        )
    ) {
        return [
            `${CDN_BASE}${path}`,
            `${CDN_BASE}assets/collectibles/${path}`
        ];
    }

    if (
        path.endsWith(
            "/"
        )
    ) {
        return [
            `${CDN_BASE}assets/collectibles/${path}static.png`,
            `${CDN_BASE}${path}static.png`
        ];
    }

    if (
        !path.includes(
            "/"
        )
    ) {
        return [];
    }

    return [
        `${CDN_BASE}assets/collectibles/${path}/static.png`,
        `${CDN_BASE}assets/collectibles/${path}.png`,
        `${CDN_BASE}${path}.png`
    ];
}

/*
 * Static assets first, animated/video last.
 */
function assetKeyPriority(
    key:
        string
):
    number {
    const lower =
        key.toLowerCase();

    if (
        lower.includes(
            "static"
        )
    ) {
        return 0;
    }

    if (
        lower.includes(
            "animated"
        ) ||
        lower.includes(
            "video"
        )
    ) {
        return 2;
    }

    return 1;
}

function collectImageCandidates(
    value:
        unknown,

    parentKey =
        "",

    depth =
        0
):
    string[] {
    if (
        value == null ||
        depth > 5
    ) {
        return [];
    }

    if (
        typeof value ===
        "string"
    ) {
        if (
            /^https?:\/\//i.test(
                value
            ) ||
            ASSET_KEY_REGEX.test(
                parentKey
            )
        ) {
            return cdnCandidatesFromPath(
                value
            );
        }

        return [];
    }

    if (
        Array.isArray(
            value
        )
    ) {
        return value.flatMap(
            child =>
                collectImageCandidates(
                    child,
                    parentKey,
                    depth + 1
                )
        );
    }

    if (
        typeof value !==
        "object"
    ) {
        return [];
    }

    return Object.entries(
        value as
        Record<
            string,
            unknown
        >
    )
        .sort(
            (
                [a],
                [b]
            ) =>
                assetKeyPriority(
                    a
                ) -
                assetKeyPriority(
                    b
                )
        )
        .flatMap(
            (
                [key, child]
            ) =>
                collectImageCandidates(
                    child,
                    key,
                    depth + 1
                )
        );
}

/*
 * Builds the preview layers exactly like Discord does.
 *
 * Discord (module "staple"/"rail"/"border" renderer):
 *
 *   getCollectiblesItemAssetUrl({
 *       skuId, assetFormat: "static", assetId: layer.id
 *   })
 *
 * which your client loads as:
 *
 *   https://cdn.discordapp.com/media/v1/collectibles-shop/<skuId>/<layerId>/static
 *
 * Layers carry no path, only { id, type, order, anchor }.
 * "back" layers are drawn behind the card, "front" ones
 * over it.
 */
function getFrameLayers(
    skuId:
        string,

    layers:
        unknown
):
    FrameLayerPreview[] {
    if (
        !skuId ||
        !Array.isArray(
            layers
        )
    ) {
        return [];
    }

    const result:
        FrameLayerPreview[] =
        [];

    for (
        const layer
        of layers
    ) {
        if (
            !layer ||
            typeof layer !==
            "object"
        ) {
            continue;
        }

        const object =
            layer as
            Record<
                string,
                unknown
            >;

        const id =
            String(
                object.id ??
                ""
            ).trim();

        if (
            !id
        ) {
            continue;
        }

        result.push({
            url:
                `${CDN_BASE}media/v1/collectibles-shop/${skuId}/${id}/static`,

            type:
                safeString(
                    object.type
                ) ||
                "staple",

            order:
                safeString(
                    object.order
                ) ||
                "front",

            anchor:
                safeString(
                    object.anchor
                ) ||
                "top"
        });
    }

    return result;
}

function mergeCosmeticCard(
    previous:
        CosmeticCard |
        undefined,

    next:
        CosmeticCard
):
    CosmeticCard {
    if (
        !previous
    ) {
        return next;
    }

    const previousLayers =
        previous.layers ??
        [];

    const nextLayers =
        next.layers ??
        [];

    const layers =
        nextLayers.length >=
            previousLayers.length
            ? nextLayers
            : previousLayers;

    const hasLayerInfo =
        previous.layerCount !==
        undefined ||
        next.layerCount !==
        undefined;

    const layerCount =
        Math.max(
            previous.layerCount ??
            0,

            next.layerCount ??
            0
        );

    return {
        ...previous,
        ...next,

        name:
            next.name ||
            previous.name,

        preview:
            next.preview ||
            previous.preview,

        previewCandidates:
            uniqueStrings([
                ...(
                    next.previewCandidates ??
                    []
                ),
                ...(
                    previous.previewCandidates ??
                    []
                )
            ]),

        shopCandidates:
            uniqueStrings([
                ...(
                    next.shopCandidates ??
                    []
                ),
                ...(
                    previous.shopCandidates ??
                    []
                )
            ]),

        layers:
            hasLayerInfo
                ? layers
                : next.layers,

        layerCount:
            hasLayerInfo
                ? layerCount
                : next.layerCount,

        subtitle:
            hasLayerInfo
                ? `${layerCount} layers`
                : next.subtitle ??
                previous.subtitle
    };
}

function FallbackImage({
    candidates,
    style,
    onExhausted
}: {
    candidates:
    string[];

    style?:
    Record<
        string,
        string | number
    >;

    onExhausted?:
    () =>
        void;
}) {
    const [
        index,
        setIndex
    ] =
        useState(
            0
        );

    const src =
        candidates[index];

    if (
        !src
    ) {
        return null;
    }

    return (
        <img
            src={
                src
            }

            alt=""

            draggable={
                false
            }

            style={
                style
            }

            onError={() => {
                const next =
                    index + 1;

                setIndex(
                    next
                );

                if (
                    next >=
                    candidates.length
                ) {
                    onExhausted?.();
                }
            }}
        />
    );
}

function getAnchorStyle(
    anchor:
        string
):
    Record<
        string,
        string | number
    > {
    if (
        anchor ===
        "bottom"
    ) {
        return {
            bottom:
                0
        };
    }

    if (
        anchor ===
        "center"
    ) {
        return {
            top:
                "50%",

            transform:
                "translateY(-50%)"
        };
    }

    return {
        top:
            0
    };
}

/*
 * One frame layer, same element types as Discord:
 * staple -> <img>, rail -> vertically tiled background,
 * border -> background image.
 */
function FrameLayer({
    layer,
    onDead
}: {
    layer:
    FrameLayerPreview;

    onDead:
    () =>
        void;
}) {
    if (
        layer.type ===
        "staple"
    ) {
        return (
            <FallbackImage
                candidates={[
                    layer.url
                ]}

                style={{
                    position:
                        "absolute",

                    left:
                        0,

                    width:
                        "100%",

                    height:
                        "auto",

                    objectFit:
                        "contain",

                    ...getAnchorStyle(
                        layer.anchor
                    )
                }}

                onExhausted={
                    onDead
                }
            />
        );
    }

    return (
        <div
            aria-hidden={
                true
            }

            style={{
                position:
                    "absolute",

                top:
                    0,

                left:
                    0,

                width:
                    "100%",

                height:
                    "100%",

                backgroundImage:
                    `url("${layer.url}")`,

                backgroundRepeat:
                    layer.type ===
                        "rail"
                        ? "repeat-y"
                        : "no-repeat",

                backgroundSize:
                    "100% auto",

                backgroundPosition:
                    "center"
            }}
        />
    );
}

/*
 * Preview order:
 *   1. real frame layers: back layers, a mini profile card,
 *      front layers (like Discord's profile)
 *   2. Discord Shop thumbnail
 *   3. any other preview URL from the item/product
 *   4. "?"
 * A stage is skipped as soon as all its images fail.
 */
function CosmeticPreview({
    item
}: {
    item:
    CosmeticCard;
}) {
    const layers =
        item.layers ??
        [];

    const shop =
        item.shopCandidates ??
        [];

    const single =
        uniqueStrings([
            item.preview,
            ...(
                item.previewCandidates ??
                []
            )
        ]);

    const stapleCount =
        layers.filter(
            layer =>
                layer.type ===
                "staple"
        ).length;

    const [
        deadLayers,
        setDeadLayers
    ] =
        useState(
            0
        );

    const [
        shopDead,
        setShopDead
    ] =
        useState(
            false
        );

    const [
        singleDead,
        setSingleDead
    ] =
        useState(
            false
        );

    const markLayerDead = () =>
        setDeadLayers(
            count =>
                count + 1
        );

    if (
        layers.length >
        0 &&
        (
            stapleCount ===
            0 ||
            deadLayers <
            stapleCount
        )
    ) {
        const back =
            layers.filter(
                layer =>
                    layer.order ===
                    "back"
            );

        const front =
            layers.filter(
                layer =>
                    layer.order !==
                    "back"
            );

        return (
            <div
                style={{
                    position:
                        "relative",

                    width:
                        "100%",

                    height:
                        "100%"
                }}
            >
                {back.map(
                    layer => (
                        <FrameLayer
                            key={
                                layer.url
                            }

                            layer={
                                layer
                            }

                            onDead={
                                markLayerDead
                            }
                        />
                    )
                )}

                <div
                    style={{
                        position:
                            "absolute",

                        left:
                            "10%",

                        right:
                            "10%",

                        top:
                            "16%",

                        bottom:
                            "10%",

                        borderRadius:
                            "4px",

                        background:
                            "var(--background-base-lower, #1e1f22)"
                    }}
                />

                {front.map(
                    layer => (
                        <FrameLayer
                            key={
                                layer.url
                            }

                            layer={
                                layer
                            }

                            onDead={
                                markLayerDead
                            }
                        />
                    )
                )}
            </div>
        );
    }

    if (
        shop.length >
        0 &&
        !shopDead
    ) {
        return (
            <FallbackImage
                key={
                    `shop:${shop.join("|")}`
                }

                candidates={
                    shop
                }

                onExhausted={() =>
                    setShopDead(
                        true
                    )
                }
            />
        );
    }

    if (
        single.length >
        0 &&
        !singleDead
    ) {
        return (
            <FallbackImage
                key={
                    single.join(
                        "|"
                    )
                }

                candidates={
                    single
                }

                onExhausted={() =>
                    setSingleDead(
                        true
                    )
                }
            />
        );
    }

    return (
        <span>
            ?
        </span>
    );
}

function Tab({
    id,
    active,
    icon,
    label,
    onClick
}: {
    id:
    TabId;

    active:
    TabId;

    icon:
    string;

    label:
    string;

    onClick:
    (
        id:
            TabId
    ) =>
        void;
}) {
    return (
        <button
            type="button"

            className={
                id === active
                    ? "ps-tab ps-tab-active"
                    : "ps-tab"
            }

            onClick={() =>
                onClick(
                    id
                )
            }
        >
            <span
                className="ps-tab-icon"
            >
                {icon}
            </span>

            <span>
                {label}
            </span>
        </button>
    );
}

function CosmeticSelector({
    title,
    subtitle,
    items,
    value,
    search,
    onSearch,
    onChange,
    loading = false,
    error = ""
}: {
    title:
    string;

    subtitle:
    string;

    items:
    CosmeticCard[];

    value:
    string;

    search:
    string;

    onSearch:
    (
        value:
            string
    ) =>
        void;

    onChange:
    (
        value:
            string
    ) =>
        void;

    loading?:
    boolean;

    error?:
    string;
}) {
    const filtered =
        useMemo(() => {
            const query =
                search
                    .trim()
                    .toLowerCase();

            if (
                !query
            ) {
                return items;
            }

            return items.filter(
                item =>
                    item.name
                        .toLowerCase()
                        .includes(
                            query
                        ) ||

                    item.subtitle
                        ?.toLowerCase()
                        .includes(
                            query
                        )
            );
        }, [
            items,
            search
        ]);

    return (
        <div
            className="ps-cosmetic-section"
        >
            <div
                className="ps-section-header"
            >
                <div>
                    <Forms.FormTitle
                        tag="h3"
                    >
                        {title}
                    </Forms.FormTitle>

                    <Forms.FormText>
                        {loading
                            ? "Loading..."
                            : error ||
                            subtitle}
                    </Forms.FormText>
                </div>

                <div
                    className="ps-search"
                >
                    <TextInput
                        value={
                            search
                        }

                        onChange={
                            onSearch
                        }

                        placeholder="Search..."
                    />
                </div>
            </div>

            <div
                className="ps-decoration-grid"
            >
                <button
                    type="button"

                    className={
                        !value ||
                            value ===
                            "none"

                            ? "ps-decoration-card ps-selected"
                            : "ps-decoration-card"
                    }

                    onClick={() =>
                        onChange(
                            ""
                        )
                    }
                >
                    <div
                        className="ps-decoration-preview"
                    >
                        <span>
                            Ø
                        </span>
                    </div>

                    <span>
                        None
                    </span>
                </button>

                {filtered.map(
                    item => (
                        <button
                            key={
                                item.id
                            }

                            type="button"

                            title={
                                item.subtitle
                                    ? `${item.name} • ${item.subtitle}`
                                    : item.name
                            }

                            className={
                                value ===
                                    item.id

                                    ? "ps-decoration-card ps-selected"
                                    : "ps-decoration-card"
                            }

                            onClick={() =>
                                onChange(
                                    item.id
                                )
                            }
                        >
                            <div
                                className="ps-decoration-preview"
                            >
                                <CosmeticPreview
                                    item={
                                        item
                                    }
                                />
                            </div>

                            <span>
                                {item.name}
                            </span>
                        </button>
                    )
                )}

                {!loading &&
                    filtered.length ===
                    0 && (
                        <div
                            className="ps-empty-state"
                        >
                            {error ||
                                "No results."}
                        </div>
                    )}
            </div>
        </div>
    );
}

function parseProfileEffects(
    raw:
        any
):
    CosmeticCard[] {
    const configs =
        raw
            ?.profile_effect_configs ??

        raw
            ?.profileEffects ??

        raw
            ?.effects ??

        raw;

    if (
        !Array.isArray(
            configs
        )
    ) {
        return [];
    }

    const found =
        new Map<
            string,
            CosmeticCard
        >();

    for (
        const config
        of configs as
        ProfileEffectConfig[]
    ) {
        const id =
            String(
                config.sku_id ??
                config.skuId ??
                config.id ??
                ""
            );

        if (
            !id
        ) {
            continue;
        }

        const name =
            safeString(
                config.title
            ) ||

            safeString(
                config.name
            ) ||

            `Effect ${id}`;

        const preview =
            safeString(
                config.thumbnailPreviewSrc
            ) ||

            safeString(
                config.thumbnail_preview_src
            ) ||

            safeString(
                config.reducedMotionSrc
            ) ||

            safeString(
                config.reduced_motion_src
            );

        found.set(
            id,

            {
                id,
                name,
                preview
            }
        );
    }

    return [
        ...found.values()
    ].sort(
        (
            a,
            b
        ) =>
            a.name.localeCompare(
                b.name
            )
    );
}

function useProfileEffects() {
    const [
        items,
        setItems
    ] =
        useState<
            CosmeticCard[]
        >(
            []
        );

    const [
        loading,
        setLoading
    ] =
        useState(
            true
        );

    const [
        error,
        setError
    ] =
        useState(
            ""
        );

    useEffect(() => {
        let cancelled =
            false;

        async function load() {
            const found =
                new Map<
                    string,
                    CosmeticCard
                >();

            try {
                const response =
                    await RestAPI.get({
                        url:
                            "/user-profile-effects"
                    });

                for (
                    const item
                    of parseProfileEffects(
                        response.body
                    )
                ) {
                    found.set(
                        item.id,
                        item
                    );
                }
            } catch {
                // fallback below
            }

            try {
                const response =
                    await fetch(
                        "https://raw.githubusercontent.com/Infinitay/discord-collectibles-archive/main/discord-data/raw/user-profile-effects.json",

                        {
                            cache:
                                "force-cache"
                        }
                    );

                if (
                    response.ok
                ) {
                    const data =
                        await response.json();

                    for (
                        const item
                        of parseProfileEffects(
                            data
                        )
                    ) {
                        found.set(
                            item.id,
                            item
                        );
                    }
                }
            } catch {
                // keep Discord results
            }

            if (
                cancelled
            ) {
                return;
            }

            const result =
                [
                    ...found.values()
                ].sort(
                    (
                        a,
                        b
                    ) =>
                        a.name.localeCompare(
                            b.name
                        )
                );

            setItems(
                result
            );

            if (
                result.length ===
                0
            ) {
                setError(
                    "Profile effects failed to load."
                );
            }

            setLoading(
                false
            );
        }

        void load();

        return () => {
            cancelled =
                true;
        };
    }, []);

    return {
        items,
        loading,
        error
    };
}

function normalizeCdnAsset(
    value:
        string
):
    string {
    const raw =
        value.trim();

    if (
        !raw
    ) {
        return "";
    }

    if (
        raw.startsWith(
            "https://"
        ) ||
        raw.startsWith(
            "http://"
        )
    ) {
        return raw;
    }

    return (
        "https://cdn.discordapp.com/" +
        raw.replace(
            /^\/+/,
            ""
        )
    );
}

function getProductPreview(
    product:
        any,

    item:
        any
):
    string {
    return normalizeCdnAsset(
        safeString(
            item?.assets
                ?.static_image_url
        ) ||

        safeString(
            item?.assets
                ?.animated_image_url
        ) ||

        safeString(
            item?.assets
                ?.static_image_path
        ) ||

        safeString(
            item?.assets
                ?.animated_image_path
        ) ||

        safeString(
            product
                ?.preview_assets
                ?.fg_static
        ) ||

        safeString(
            product
                ?.preview_assets
                ?.fg_animated
        ) ||

        safeString(
            product
                ?.preview_assets
                ?.bg_static
        ) ||

        safeString(
            product
                ?.preview_assets
                ?.bg_animated
        )
    );
}

function getNameplateAsset(
    product:
        any,

    item:
        DiscordNameplate
):
    string {
    return (
        safeString(
            item.asset
        ) ||

        safeString(
            item.assets
                ?.animated_image_path
        ) ||

        safeString(
            item.assets
                ?.static_image_path
        ) ||

        safeString(
            product
                ?.assets
                ?.animated_image_path
        ) ||

        safeString(
            product
                ?.assets
                ?.static_image_path
        )
    );
}

function collectShopItems(
    raw:
        unknown,

    itemType:
        2 |
        3
):
    CosmeticCard[] {
    const found =
        new Map<
            string,
            CosmeticCard
        >();

    function addItem(
        product:
            any,

        rawItem:
            any,

        inheritedName =
            ""
    ) {
        if (
            Number(
                rawItem
                    ?.type
            ) !==
            itemType
        ) {
            return;
        }

        if (
            itemType ===
            2
        ) {
            const item =
                rawItem as
                DiscordNameplate;

            const skuId =
                String(
                    item.sku_id ??
                    item.skuId ??
                    product
                        ?.sku_id ??
                    product
                        ?.skuId ??
                    ""
                ).trim();

            if (
                !skuId
            ) {
                return;
            }

            const name =
                safeString(
                    product
                        ?.name
                ) ||

                safeString(
                    product
                        ?.title
                ) ||

                inheritedName ||

                safeString(
                    item.label
                ) ||

                `Nameplate ${skuId}`;

            const preview =
                getProductPreview(
                    product,
                    item
                ) ||

                `https://cdn.discordapp.com/media/v1/collectibles-shop/${skuId}/static`;

            const stored =
                JSON.stringify({
                    skuId,

                    asset:
                        getNameplateAsset(
                            product,
                            item
                        ),

                    label:
                        safeString(
                            item.label
                        ) ||
                        name,

                    palette:
                        safeString(
                            item.palette
                        ) ||
                        "none",

                    preview
                });

            found.set(
                skuId,

                {
                    id:
                        stored,

                    name,

                    preview,

                    subtitle:
                        safeString(
                            item.palette
                        ) ||
                        "Nameplate"
                }
            );

            return;
        }

        const item =
            rawItem as
            DiscordProfileFrame;

        const skuId =
            String(
                item.sku_id ??
                item.skuId ??
                product
                    ?.sku_id ??
                product
                    ?.skuId ??
                ""
            ).trim();

        if (
            !skuId
        ) {
            return;
        }

        const name =
            safeString(
                product
                    ?.name
            ) ||

            safeString(
                product
                    ?.title
            ) ||

            inheritedName ||

            safeString(
                item.label
            ) ||

            `Profile Frame ${skuId}`;

        /*
         * Real frame artwork: the layers.
         */
        const layers =
            getFrameLayers(
                skuId,
                item.layers
            );

        const layerCount =
            Array.isArray(
                item.layers
            )
                ? item.layers.length
                : 0;

        /*
         * Used only if the shop thumbnail AND every layer
         * fail to load.
         */
        const previewCandidates =
            uniqueStrings([
                ...collectImageCandidates(
                    item.assets,
                    "assets"
                ),

                getProductPreview(
                    product,
                    item
                ),

                ...collectImageCandidates(
                    product
                        ?.preview_assets,
                    "preview_assets"
                )
            ]);

        /*
         * Shop thumbnail by SKU. This scheme is the one the
         * working nameplate previews already load from; it is
         * tried for the item SKU and the product SKU.
         */
        const shopCandidates =
            uniqueStrings([
                skuId,

                safeString(
                    product
                        ?.sku_id
                ),

                safeString(
                    product
                        ?.skuId
                )
            ].map(
                id =>
                    id
                        ? `https://cdn.discordapp.com/media/v1/collectibles-shop/${id}/static`
                        : ""
            ));

        if (
            settings.store
                .debugLogs &&
            !frameSampleLogged &&
            layerCount >
            0
        ) {
            frameSampleLogged =
                true;

            console.info(
                "[Iris.ts] Raw profile frame sample (use this to check the layer structure)",
                {
                    skuId,

                    rawItem,

                    product,

                    layerCandidates:
                        layers,

                    shopCandidates,

                    previewCandidates
                }
            );
        }

        const card:
            CosmeticCard =
        {
            /*
             * The id stays the plain SKU: this is the value
             * the applied profile frame already uses.
             */
            id:
                skuId,

            name,

            preview:
                "",

            previewCandidates,

            shopCandidates,

            layers,

            layerCount,

            subtitle:
                `${layerCount} layers`
        };

        found.set(
            skuId,

            mergeCosmeticCard(
                found.get(
                    skuId
                ),

                card
            )
        );
    }

    function walk(
        value:
            unknown,

        inheritedName =
            ""
    ) {
        if (
            Array.isArray(
                value
            )
        ) {
            for (
                const child
                of value
            ) {
                walk(
                    child,
                    inheritedName
                );
            }

            return;
        }

        if (
            !value ||
            typeof value !==
            "object"
        ) {
            return;
        }

        const object =
            value as
            Record<
                string,
                any
            >;

        const productName =
            safeString(
                object.name
            ) ||

            safeString(
                object.title
            ) ||

            inheritedName;

        if (
            Array.isArray(
                object.items
            )
        ) {
            for (
                const item
                of object.items
            ) {
                addItem(
                    object,
                    item,
                    productName
                );
            }
        }

        addItem(
            object,
            object,
            productName
        );

        for (
            const child
            of Object.values(
                object
            )
        ) {
            walk(
                child,
                productName
            );
        }
    }

    walk(
        raw
    );

    return [
        ...found.values()
    ];
}

async function fetchCollectibleProduct(
    skuId:
        string
):
    Promise<
        any |
        null
    > {
    for (
        const url
        of [
            `/collectibles-products/${skuId}`,
            `/store/published-listings/skus/${skuId}`
        ]
    ) {
        try {
            const response =
                await RestAPI.get({
                    url
                });

            if (
                response.body
            ) {
                return response.body;
            }
        } catch {
            // next endpoint
        }
    }

    return null;
}

async function searchCollectibleProducts(
    itemTypeName:
        "NAMEPLATE" |
        "PROFILE_FRAME",

    itemType:
        2 |
        3
):
    Promise<
        CosmeticCard[]
    > {
    const found =
        new Map<
            string,
            CosmeticCard
        >();

    let offset =
        0;

    const limit =
        50;

    for (
        let page =
            0;

        page <
        12;

        page++
    ) {
        let response;

        try {
            response =
                await RestAPI.get({
                    url:
                        `/shop/search?item_types=${itemTypeName}&offset=${offset}&limit=${limit}&sort_type=newest&sort_direction=desc`
                });
        } catch {
            break;
        }

        const { body } = response;

        const entries =
            Array.isArray(
                body
                    ?.skus
            )
                ? body.skus

                : Array.isArray(
                    body
                        ?.items
                )
                    ? body.items

                    : Array.isArray(
                        body
                            ?.results
                    )
                        ? body.results

                        : [];

        if (
            entries.length ===
            0
        ) {
            break;
        }

        for (
            const card
            of collectShopItems(
                body,
                itemType
            )
        ) {
            found.set(
                card.id,

                mergeCosmeticCard(
                    found.get(
                        card.id
                    ),

                    card
                )
            );
        }

        const skuIds =
            entries
                .map(
                    entry => {
                        if (
                            typeof entry ===
                            "string"
                        ) {
                            return entry;
                        }

                        return String(
                            entry
                                ?.sku_id ??
                            entry
                                ?.skuId ??
                            entry
                                ?.id ??
                            ""
                        );
                    }
                )
                .filter(
                    Boolean
                );

        for (
            let i =
                0;

            i <
            skuIds.length;

            i +=
            10
        ) {
            const products =
                await Promise.all(
                    skuIds
                        .slice(
                            i,
                            i + 10
                        )
                        .map(
                            fetchCollectibleProduct
                        )
                );

            for (
                const product
                of products
            ) {
                if (
                    !product
                ) {
                    continue;
                }

                for (
                    const card
                    of collectShopItems(
                        product,
                        itemType
                    )
                ) {
                    found.set(
                        card.id,

                        mergeCosmeticCard(
                            found.get(
                                card.id
                            ),

                            card
                        )
                    );
                }
            }
        }

        offset +=
            entries.length;

        const hasMore =
            body
                ?.pagination
                ?.has_more ??

            body
                ?.pagination
                ?.hasMore ??

            false;

        if (
            !hasMore
        ) {
            break;
        }
    }

    return [
        ...found.values()
    ];
}

async function loadShopType(
    tabs:
        string[],

    itemTypeName:
        "NAMEPLATE" |
        "PROFILE_FRAME",

    itemType:
        2 |
        3
):
    Promise<
        CosmeticCard[]
    > {
    const found =
        new Map<
            string,
            CosmeticCard
        >();

    for (
        const tab
        of tabs
    ) {
        for (
            const url
            of [
                `/collectibles-categories/v2?tab=${tab}&include_bundles=true&include_dynamic_blocks=true&variants_return_style=2`,
                `/collectibles-shop?tab=${tab}&include_bundles=true&include_dynamic_blocks=true&variants_return_style=2`
            ]
        ) {
            try {
                const response =
                    await RestAPI.get({
                        url
                    });

                for (
                    const card
                    of collectShopItems(
                        response.body,
                        itemType
                    )
                ) {
                    found.set(
                        card.id,

                        mergeCosmeticCard(
                            found.get(
                                card.id
                            ),

                            card
                        )
                    );
                }
            } catch {
                // next source
            }
        }
    }

    try {
        for (
            const card
            of await searchCollectibleProducts(
                itemTypeName,
                itemType
            )
        ) {
            found.set(
                card.id,

                mergeCosmeticCard(
                    found.get(
                        card.id
                    ),

                    card
                )
            );
        }
    } catch {
        // keep existing
    }

    return [
        ...found.values()
    ].sort(
        (
            a,
            b
        ) =>
            a.name.localeCompare(
                b.name
            )
    );
}

function useShopCosmetics() {
    const [
        nameplates,
        setNameplates
    ] =
        useState<
            CosmeticCard[]
        >(
            []
        );

    const [
        frames,
        setFrames
    ] =
        useState<
            CosmeticCard[]
        >(
            []
        );

    const [
        loading,
        setLoading
    ] =
        useState(
            true
        );

    const [
        error,
        setError
    ] =
        useState(
            ""
        );

    useEffect(() => {
        let cancelled =
            false;

        async function load() {
            try {
                const [
                    loadedNameplates,
                    loadedFrames
                ] =
                    await Promise.all([
                        loadShopType(
                            [
                                "nameplates",
                                "nameplate",
                                "home"
                            ],

                            "NAMEPLATE",

                            2
                        ),

                        loadShopType(
                            [
                                "profile-frames",
                                "profile_frames",
                                "profile-frame",
                                "home"
                            ],

                            "PROFILE_FRAME",

                            3
                        )
                    ]);

                if (
                    cancelled
                ) {
                    return;
                }

                setNameplates(
                    loadedNameplates
                );

                setFrames(
                    loadedFrames
                );

                if (
                    loadedNameplates.length ===
                    0 &&

                    loadedFrames.length ===
                    0
                ) {
                    setError(
                        "Discord Shop cosmetics failed to load."
                    );
                }
            } catch (
            error
            ) {
                if (
                    cancelled
                ) {
                    return;
                }

                console.error(
                    "[Iris.ts] Shop cosmetics failed",
                    error
                );

                setError(
                    "Discord Shop cosmetics failed to load."
                );
            } finally {
                if (
                    !cancelled
                ) {
                    setLoading(
                        false
                    );
                }
            }
        }

        void load();

        return () => {
            cancelled =
                true;
        };
    }, []);

    return {
        nameplates,
        frames,
        loading,
        error
    };
}

export function SettingsPanel() {
    const [
        tab,
        setTab
    ] =
        useState<
            TabId
        >(
            "profile"
        );

    const [
        username,
        setUsername
    ] =
        useState(
            settings.store
                .spoofUsername ??
            ""
        );

    const [
        displayName,
        setDisplayName
    ] =
        useState(
            settings.store
                .spoofDisplayName ??
            ""
        );

    const [
        pronouns,
        setPronouns
    ] =
        useState(
            settings.store
                .spoofPronouns ??
            ""
        );

    const [
        bio,
        setBio
    ] =
        useState(
            settings.store
                .spoofBio ??
            ""
        );

    const [
        legacyUsername,
        setLegacyUsername
    ] =
        useState(
            settings.store
                .spoofLegacyUsername ??
            ""
        );

    const [
        creationDate,
        setCreationDate
    ] =
        useState(
            settings.store
                .spoofAccountCreationDate ??
            ""
        );

    const [
        selectedBadges,
        setSelectedBadges
    ] =
        useState<
            string[]
        >(
            settings.store
                .selectedBadges ??
            []
        );

    const [
        nitroTier,
        setNitroTier
    ] =
        useState(
            settings.store
                .nitroTier ??
            "none"
        );

    const [
        nitroSinceDate,
        setNitroSinceDate
    ] =
        useState(
            settings.store
                .nitroSinceDate ??
            ""
        );

    const [
        nitroSimpleTooltip,
        setNitroSimpleTooltip
    ] =
        useState(
            settings.store
                .nitroSimpleTooltip ??
            false
        );

    const [
        boostTier,
        setBoostTier
    ] =
        useState(
            settings.store
                .boostTier ??
            "none"
        );

    const [
        customBadgesEnabled,
        setCustomBadgesEnabled
    ] =
        useState(
            settings.store
                .customBadgesEnabled ??
            true
        );

    const [
        hideCustomBadgesFromOthers,
        setHideCustomBadgesFromOthers
    ] =
        useState(
            settings.store
                .hideCustomBadgesFromOthers ??
            true
        );

    const [
        customBadges,
        setCustomBadges
    ] =
        useState<
            CustomBadge[]
        >(
            settings.store
                .customBadges ??
            []
        );

    const [
        editingBadgeId,
        setEditingBadgeId
    ] =
        useState<
            string |
            null
        >(
            null
        );

    const [
        badgeName,
        setBadgeName
    ] =
        useState(
            ""
        );

    const [
        badgeTooltip,
        setBadgeTooltip
    ] =
        useState(
            ""
        );

    const [
        badgeImage,
        setBadgeImage
    ] =
        useState(
            ""
        );

    const [
        selectedDecoration,
        setSelectedDecoration
    ] =
        useState(
            settings.store
                .selectedDecoration ??
            ""
        );

    const [
        profileEffect,
        setProfileEffect
    ] =
        useState(
            settings.store
                .profileEffect ??
            ""
        );

    const [
        nameplate,
        setNameplate
    ] =
        useState(
            settings.store
                .nameplate ??
            ""
        );

    const [
        profileFrame,
        setProfileFrame
    ] =
        useState(
            settings.store
                .profileFrame ??
            ""
        );

    const [
        decorationSearch,
        setDecorationSearch
    ] =
        useState(
            ""
        );

    const [
        effectSearch,
        setEffectSearch
    ] =
        useState(
            ""
        );

    const [
        nameplateSearch,
        setNameplateSearch
    ] =
        useState(
            ""
        );

    const [
        frameSearch,
        setFrameSearch
    ] =
        useState(
            ""
        );

    const [
        unlockAll,
        setUnlockAllState
    ] =
        useState(
            settings.store
                .unlockAll ??
            false
        );

    /*
     * Applied immediately (no Save needed).
     */
    function toggleUnlockAll(
        value: boolean
    ) {
        if (
            value
        ) {
            const ok =
                enableUnlockAll();

            settings.store
                .unlockAll =
                ok;

            setUnlockAllState(
                ok
            );

            toast(
                ok
                    ? "Unlock All enabled. Pick items in Discord's profile settings."
                    : "Unlock All could not start (see console)."
            );

            return;
        }

        disableUnlockAll();

        settings.store
            .unlockAll =
            false;

        setUnlockAllState(
            false
        );

        toast(
            "Unlock All disabled."
        );
    }

    const [
        replaceRealBadges,
        setReplaceRealBadges
    ] =
        useState(
            settings.store
                .replaceRealBadges ??
            false
        );

    const [
        debugLogs,
        setDebugLogs
    ] =
        useState(
            settings.store
                .debugLogs ??
            false
        );

    const selectedBadgeSet =
        useMemo(
            () =>
                new Set(
                    selectedBadges
                ),

            [
                selectedBadges
            ]
        );

    const decorations =
        useMemo<
            CosmeticCard[]
        >(
            () =>
                DECORATIONS
                    .filter(
                        item =>
                            item.id !==
                            "none"
                    )
                    .map(
                        item => ({
                            id:
                                item.id,

                            name:
                                item.name,

                            preview:
                                item.asset
                                    ? decorationIcon(
                                        item.asset
                                    )
                                    : "",

                            subtitle:
                                item.collection
                        })
                    ),

            []
        );

    const {
        items:
        effects,

        loading:
        effectsLoading,

        error:
        effectsError
    } =
        useProfileEffects();

    const {
        nameplates,
        frames,

        loading:
        shopLoading,

        error:
        shopError
    } =
        useShopCosmetics();

    function toggleBadge(
        id:
            string,

        group?:
            string
    ) {
        if (
            selectedBadgeSet.has(
                id
            )
        ) {
            setSelectedBadges(
                current =>
                    current.filter(
                        value =>
                            value !==
                            id
                    )
            );

            return;
        }

        setSelectedBadges(
            current => {
                let next =
                    [
                        ...current
                    ];

                if (
                    group
                ) {
                    const conflicts =
                        BADGES
                            .filter(
                                badge =>
                                    badge.exclusiveGroup ===
                                    group
                            )
                            .map(
                                badge =>
                                    badge.id
                            );

                    next =
                        next.filter(
                            value =>
                                !conflicts.includes(
                                    value
                                )
                        );
                }

                return [
                    ...next,
                    id
                ];
            }
        );
    }

    function handleBadgeImage(
        file?:
            File
    ) {
        if (
            !file
        ) {
            return;
        }

        if (
            !file.type
                .startsWith(
                    "image/"
                )
        ) {
            toast(
                "Please select an image."
            );

            return;
        }

        if (
            file.size >
            2 *
            1024 *
            1024
        ) {
            toast(
                "Maximum image size: 2 MB."
            );

            return;
        }

        const reader =
            new FileReader();

        reader.onload =
            () => {
                if (
                    typeof reader.result ===
                    "string"
                ) {
                    setBadgeImage(
                        reader.result
                    );
                }
            };

        reader.readAsDataURL(
            file
        );
    }

    function resetBadgeEditor() {
        setEditingBadgeId(
            null
        );

        setBadgeName(
            ""
        );

        setBadgeTooltip(
            ""
        );

        setBadgeImage(
            ""
        );
    }

    function commitCustomBadges(
        next:
            CustomBadge[]
    ) {
        setCustomBadges(
            next
        );

        settings.store
            .customBadges =
            next;

        refreshLocalProfile();
    }

    function saveCustomBadge() {
        const name =
            badgeName
                .trim();

        if (
            !name
        ) {
            toast(
                "Enter a badge name."
            );

            return;
        }

        if (
            !badgeImage
        ) {
            toast(
                "Upload a badge image."
            );

            return;
        }

        if (
            editingBadgeId
        ) {
            commitCustomBadges(
                customBadges.map(
                    badge =>
                        badge.id ===
                            editingBadgeId

                            ? {
                                ...badge,

                                name,

                                tooltip:
                                    badgeTooltip
                                        .trim() ||
                                    name,

                                image:
                                    badgeImage
                            }

                            : badge
                )
            );

            resetBadgeEditor();

            toast(
                "Badge updated."
            );

            return;
        }

        commitCustomBadges([
            ...customBadges,

            {
                id:
                    crypto.randomUUID(),

                name,

                tooltip:
                    badgeTooltip
                        .trim() ||
                    name,

                image:
                    badgeImage,

                enabled:
                    true
            }
        ]);

        resetBadgeEditor();

        toast(
            "Badge added."
        );
    }

    function editCustomBadge(
        badge:
            CustomBadge
    ) {
        setEditingBadgeId(
            badge.id
        );

        setBadgeName(
            badge.name
        );

        setBadgeTooltip(
            badge.tooltip
        );

        setBadgeImage(
            badge.image
        );
    }

    function toggleCustomBadge(
        id:
            string
    ) {
        commitCustomBadges(
            customBadges.map(
                badge =>
                    badge.id ===
                        id

                        ? {
                            ...badge,

                            enabled:
                                !badge.enabled
                        }

                        : badge
            )
        );
    }

    function deleteCustomBadge(
        id:
            string
    ) {
        commitCustomBadges(
            customBadges.filter(
                badge =>
                    badge.id !==
                    id
            )
        );

        if (
            editingBadgeId ===
            id
        ) {
            resetBadgeEditor();
        }

        toast(
            "Badge deleted."
        );
    }

    function deleteAllCustomBadges() {
        commitCustomBadges(
            []
        );

        resetBadgeEditor();

        toast(
            "All custom badges deleted."
        );
    }

    function save() {
        settings.store
            .spoofUsername =
            username;

        settings.store
            .spoofDisplayName =
            displayName;

        settings.store
            .spoofPronouns =
            pronouns;

        settings.store
            .spoofBio =
            bio;

        settings.store
            .spoofLegacyUsername =
            legacyUsername;

        settings.store
            .spoofAccountCreationDate =
            creationDate;

        settings.store
            .selectedBadges =
            selectedBadges;

        settings.store
            .nitroTier =
            nitroTier;

        settings.store
            .nitroSinceDate =
            nitroSinceDate.trim();

        settings.store
            .nitroSimpleTooltip =
            nitroSimpleTooltip;

        settings.store
            .boostTier =
            boostTier;

        settings.store
            .customBadgesEnabled =
            customBadgesEnabled;

        settings.store
            .customBadges =
            customBadges;

        settings.store
            .hideCustomBadgesFromOthers =
            hideCustomBadgesFromOthers;

        settings.store
            .selectedDecoration =
            selectedDecoration;

        settings.store
            .profileEffect =
            profileEffect;

        settings.store
            .nameplate =
            nameplate;

        settings.store
            .profileFrame =
            profileFrame;

        settings.store
            .replaceRealBadges =
            replaceRealBadges;

        settings.store
            .debugLogs =
            debugLogs;

        refreshLocalProfile();

        toast(
            "Iris.ts saved."
        );
    }

    return (
        <div
            className="ps-root"
        >
            <div
                className="ps-header"
            >
                <div>
                    <div
                        className="ps-title"
                    >
                        Iris.ts
                    </div>

                    <div
                        className="ps-subtitle"
                    >
                        Local profile editor
                    </div>
                </div>

                <Button
                    color={
                        Button
                            .Colors
                            .BRAND
                    }

                    onClick={
                        save
                    }
                >
                    Save Changes
                </Button>
            </div>

            <div
                className="ps-tabs"
            >
                <Tab
                    id="profile"
                    active={
                        tab
                    }
                    icon="👤"
                    label="Profile"
                    onClick={
                        setTab
                    }
                />

                <Tab
                    id="badges"
                    active={
                        tab
                    }
                    icon="🏅"
                    label="Badges"
                    onClick={
                        setTab
                    }
                />

                <Tab
                    id="custom"
                    active={
                        tab
                    }
                    icon="✨"
                    label="Custom"
                    onClick={
                        setTab
                    }
                />

                <Tab
                    id="cosmetics"
                    active={
                        tab
                    }
                    icon="🎨"
                    label="Cosmetics"
                    onClick={
                        setTab
                    }
                />

                <Tab
                    id="advanced"
                    active={
                        tab
                    }
                    icon="⚙️"
                    label="Advanced"
                    onClick={
                        setTab
                    }
                />
            </div>

            {tab ===
                "profile" && (
                    <div
                        className="ps-panel"
                    >
                        <div
                            className="ps-two-columns"
                        >
                            <div
                                className="ps-field"
                            >
                                <Forms.FormTitle
                                    tag="h5"
                                >
                                    Username
                                </Forms.FormTitle>

                                <TextInput
                                    value={
                                        username
                                    }

                                    onChange={
                                        setUsername
                                    }

                                    placeholder="Type here..."
                                />
                            </div>

                            <div
                                className="ps-field"
                            >
                                <Forms.FormTitle
                                    tag="h5"
                                >
                                    Display Name
                                </Forms.FormTitle>

                                <TextInput
                                    value={
                                        displayName
                                    }

                                    onChange={
                                        setDisplayName
                                    }

                                    placeholder="Type here..."
                                />
                            </div>

                            <div
                                className="ps-field"
                            >
                                <Forms.FormTitle
                                    tag="h5"
                                >
                                    Pronouns
                                </Forms.FormTitle>

                                <TextInput
                                    value={
                                        pronouns
                                    }

                                    onChange={
                                        setPronouns
                                    }

                                    placeholder="Type here..."
                                />
                            </div>

                            <div
                                className="ps-field"
                            >
                                <Forms.FormTitle
                                    tag="h5"
                                >
                                    Legacy Username
                                </Forms.FormTitle>

                                <TextInput
                                    value={
                                        legacyUsername
                                    }

                                    onChange={
                                        setLegacyUsername
                                    }

                                    placeholder="Type here..."
                                />
                            </div>

                            <div
                                className="ps-field"
                            >
                                <Forms.FormTitle
                                    tag="h5"
                                >
                                    Member Since
                                </Forms.FormTitle>

                                <TextInput
                                    value={
                                        creationDate
                                    }

                                    onChange={
                                        setCreationDate
                                    }

                                    placeholder="Date here..."
                                />
                            </div>
                        </div>

                        <div
                            className="ps-field"
                        >
                            <Forms.FormTitle
                                tag="h5"
                            >
                                Bio
                            </Forms.FormTitle>

                            <TextArea
                                value={
                                    bio
                                }

                                onChange={
                                    setBio
                                }

                                placeholder="Type here..."

                                rows={
                                    3
                                }
                            />
                        </div>
                    </div>
                )}

            {tab ===
                "badges" && (
                    <div
                        className="ps-panel"
                    >
                        <Forms.FormTitle
                            tag="h3"
                        >
                            Official Badges
                        </Forms.FormTitle>

                        <div
                            className="ps-icon-grid"
                        >
                            {BADGES.map(
                                badge => (
                                    <button
                                        key={
                                            badge.id
                                        }

                                        type="button"

                                        title={
                                            badge.name
                                        }

                                        className={
                                            selectedBadgeSet.has(
                                                badge.id
                                            )

                                                ? "ps-icon-card ps-selected"

                                                : "ps-icon-card"
                                        }

                                        onClick={() =>
                                            toggleBadge(
                                                badge.id,
                                                badge.exclusiveGroup
                                            )
                                        }
                                    >
                                        <img
                                            src={
                                                badgeIcon(
                                                    badge.iconHash
                                                )
                                            }

                                            alt=""

                                            className="ps-badge-icon"
                                        />

                                        <span>
                                            {badge.name}
                                        </span>
                                    </button>
                                )
                            )}
                        </div>

                        <Forms.FormTitle
                            tag="h3"
                        >
                            Nitro
                        </Forms.FormTitle>

                        <div
                            className="ps-icon-grid"
                        >
                            {NITRO_TIERS.map(
                                tier => (
                                    <button
                                        key={
                                            tier.id
                                        }

                                        type="button"

                                        className={
                                            nitroTier ===
                                                tier.id

                                                ? "ps-icon-card ps-selected"

                                                : "ps-icon-card"
                                        }

                                        onClick={() =>
                                            setNitroTier(
                                                tier.id
                                            )
                                        }
                                    >
                                        {tier.iconHash ? (
                                            <img
                                                src={
                                                    badgeIcon(
                                                        tier.iconHash
                                                    )
                                                }

                                                alt=""

                                                className="ps-badge-icon"
                                            />
                                        ) : (
                                            <div
                                                className="ps-empty-icon"
                                            >
                                                —
                                            </div>
                                        )}

                                        <span>
                                            {tier.name}
                                        </span>
                                    </button>
                                )
                            )}
                        </div>

                        <div
                            className="ps-field"
                        >
                            <Forms.FormTitle
                                tag="h5"
                            >
                                Subscriber Since
                            </Forms.FormTitle>

                            <TextInput
                                value={
                                    nitroSinceDate
                                }

                                onChange={
                                    setNitroSinceDate
                                }

                                placeholder="Date here..."
                            />

                            <Forms.FormText>
                                {nitroSinceDate.trim() &&
                                    !parseCustomDate(
                                        nitroSinceDate
                                    )
                                    ? "Invalid date: the automatic date will be used."
                                    : "Date shown in the Nitro badge tooltip, e.g. Sep 19, 2020 or 2020-09-19. Leave empty for automatic."}
                            </Forms.FormText>
                        </div>

                        <div
                            className="ps-setting-row"
                        >
                            <div>
                                <strong>
                                    Simple Nitro Tooltip
                                </strong>

                                <span>
                                    Off: Discord's native Nitro card on your profile (tier art, "Subscriber since" date). On: plain tooltip only.
                                </span>
                            </div>

                            <Switch
                                checked={
                                    nitroSimpleTooltip
                                }

                                onChange={
                                    setNitroSimpleTooltip
                                }
                            />
                        </div>

                        <Forms.FormTitle
                            tag="h3"
                        >
                            Server Booster
                        </Forms.FormTitle>

                        <div
                            className="ps-icon-grid"
                        >
                            {BOOST_TIERS.map(
                                tier => (
                                    <button
                                        key={
                                            tier.id
                                        }

                                        type="button"

                                        className={
                                            boostTier ===
                                                tier.id

                                                ? "ps-icon-card ps-selected"

                                                : "ps-icon-card"
                                        }

                                        onClick={() =>
                                            setBoostTier(
                                                tier.id
                                            )
                                        }
                                    >
                                        {tier.iconHash ? (
                                            <img
                                                src={
                                                    badgeIcon(
                                                        tier.iconHash
                                                    )
                                                }

                                                alt=""

                                                className="ps-badge-icon"
                                            />
                                        ) : (
                                            <div
                                                className="ps-empty-icon"
                                            >
                                                —
                                            </div>
                                        )}

                                        <span>
                                            {tier.name}
                                        </span>
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                )}

            {tab ===
                "custom" && (
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
                                    Custom Badges
                                </Forms.FormTitle>

                                <Forms.FormText>
                                    Add your own local badge images.
                                </Forms.FormText>
                            </div>

                            <div
                                className="ps-switch-inline"
                            >
                                <span>
                                    My badges
                                </span>

                                <Switch
                                    checked={
                                        customBadgesEnabled
                                    }

                                    onChange={
                                        setCustomBadgesEnabled
                                    }
                                />
                            </div>
                        </div>

                        <div
                            className="ps-safety-card"
                        >
                            <div
                                className="ps-safety-icon"
                            >
                                🛡️
                            </div>

                            <div
                                className="ps-safety-content"
                            >
                                <strong>
                                    Hide custom badges from other users
                                </strong>

                                <span>
                                    User-provided custom badges can contain NSFW, gore or other unwanted imagery. This filter is for shared-profile support and keeps other users' custom images hidden while yours remain visible.
                                </span>
                            </div>

                            <Switch
                                checked={
                                    hideCustomBadgesFromOthers
                                }

                                onChange={
                                    setHideCustomBadgesFromOthers
                                }
                            />
                        </div>

                        <div
                            className="ps-custom-editor"
                        >
                            <div
                                className="ps-upload-preview"
                            >
                                {badgeImage ? (
                                    <img
                                        src={
                                            badgeImage
                                        }

                                        alt=""
                                    />
                                ) : (
                                    <span>
                                        +
                                    </span>
                                )}
                            </div>

                            <div
                                className="ps-custom-fields"
                            >
                                <TextInput
                                    value={
                                        badgeName
                                    }

                                    onChange={
                                        setBadgeName
                                    }

                                    placeholder="Type here..."
                                />

                                <TextInput
                                    value={
                                        badgeTooltip
                                    }

                                    onChange={
                                        setBadgeTooltip
                                    }

                                    placeholder="Type here..."
                                />

                                <label
                                    className="ps-discord-button ps-upload-button"
                                >
                                    Upload Image

                                    <input
                                        type="file"

                                        accept="image/png,image/jpeg,image/webp,image/gif"

                                        onChange={
                                            event =>
                                                handleBadgeImage(
                                                    event
                                                        .currentTarget
                                                        .files?.[0]
                                                )
                                        }
                                    />
                                </label>
                            </div>

                            <div
                                className="ps-editor-buttons"
                            >
                                <Button
                                    color={
                                        Button
                                            .Colors
                                            .BRAND
                                    }

                                    onClick={
                                        saveCustomBadge
                                    }
                                >
                                    {editingBadgeId
                                        ? "Save"
                                        : "Add Badge"}
                                </Button>

                                {editingBadgeId && (
                                    <button
                                        type="button"

                                        className="ps-discord-button"

                                        onClick={
                                            resetBadgeEditor
                                        }
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>

                        <div
                            className="ps-custom-list"
                        >
                            {customBadges.length ===
                                0 && (
                                    <div
                                        className="ps-empty-state"
                                    >
                                        No custom badges yet.
                                    </div>
                                )}

                            {customBadges.map(
                                badge => (
                                    <div
                                        key={
                                            badge.id
                                        }

                                        className={
                                            badge.enabled

                                                ? "ps-custom-badge"

                                                : "ps-custom-badge ps-custom-disabled"
                                        }
                                    >
                                        <img
                                            src={
                                                badge.image
                                            }

                                            alt=""

                                            className="ps-custom-badge-icon"
                                        />

                                        <div
                                            className="ps-custom-badge-info"
                                        >
                                            <strong>
                                                {badge.name}
                                            </strong>

                                            <small>
                                                {badge.tooltip}
                                            </small>
                                        </div>

                                        <button
                                            type="button"

                                            className="ps-discord-button"

                                            onClick={() =>
                                                toggleCustomBadge(
                                                    badge.id
                                                )
                                            }
                                        >
                                            {badge.enabled
                                                ? "Disable"
                                                : "Enable"}
                                        </button>

                                        <button
                                            type="button"

                                            className="ps-discord-button"

                                            onClick={() =>
                                                editCustomBadge(
                                                    badge
                                                )
                                            }
                                        >
                                            Edit
                                        </button>

                                        <button
                                            type="button"

                                            className="ps-discord-button ps-button-danger"

                                            onClick={() =>
                                                deleteCustomBadge(
                                                    badge.id
                                                )
                                            }
                                        >
                                            Delete
                                        </button>
                                    </div>
                                )
                            )}
                        </div>

                        {customBadges.length >
                            0 && (
                                <button
                                    type="button"

                                    className="ps-discord-button ps-button-danger ps-delete-all"

                                    onClick={
                                        deleteAllCustomBadges
                                    }
                                >
                                    Delete All Custom Badges
                                </button>
                            )}
                    </div>
                )}

            {tab ===
                "cosmetics" && (
                    <div
                        className="ps-panel"
                    >
                        <CosmeticSelector
                            title="Avatar Decorations"

                            subtitle={
                                `${decorations.length} decorations`
                            }

                            items={
                                decorations
                            }

                            value={
                                selectedDecoration
                            }

                            search={
                                decorationSearch
                            }

                            onSearch={
                                setDecorationSearch
                            }

                            onChange={
                                setSelectedDecoration
                            }
                        />

                        <CosmeticSelector
                            title="Profile Effects"

                            subtitle={
                                `${effects.length} effects`
                            }

                            items={
                                effects
                            }

                            value={
                                profileEffect
                            }

                            search={
                                effectSearch
                            }

                            onSearch={
                                setEffectSearch
                            }

                            onChange={
                                setProfileEffect
                            }

                            loading={
                                effectsLoading
                            }

                            error={
                                effectsError
                            }
                        />

                        <CosmeticSelector
                            title="Nameplates"

                            subtitle={
                                `${nameplates.length} nameplates`
                            }

                            items={
                                nameplates
                            }

                            value={
                                nameplate
                            }

                            search={
                                nameplateSearch
                            }

                            onSearch={
                                setNameplateSearch
                            }

                            onChange={
                                setNameplate
                            }

                            loading={
                                shopLoading
                            }

                            error={
                                shopError
                            }
                        />

                        <CosmeticSelector
                            title="Profile Frames"

                            subtitle={
                                `${frames.length} frames`
                            }

                            items={
                                frames
                            }

                            value={
                                profileFrame
                            }

                            search={
                                frameSearch
                            }

                            onSearch={
                                setFrameSearch
                            }

                            onChange={
                                setProfileFrame
                            }

                            loading={
                                shopLoading
                            }

                            error={
                                shopError
                            }
                        />
                    </div>
                )}

            {tab ===
                "advanced" && (
                    <div
                        className="ps-panel"
                    >
                        <div
                            className="ps-setting-row"
                        >
                            <div>
                                <strong>
                                    Unlock All
                                </strong>

                                <span>
                                    Unlock every decoration, nameplate, effect and frame locally in Discord's own profile settings. Cosmetics saved there stay local and are never sent to Discord.
                                </span>
                            </div>

                            <Switch
                                checked={
                                    unlockAll
                                }

                                onChange={
                                    toggleUnlockAll
                                }
                            />
                        </div>

                        <div
                            className="ps-setting-row"
                        >
                            <div>
                                <strong>
                                    Replace Real Badges
                                </strong>

                                <span>
                                    Hide Discord's native badge list and keep your local Iris.ts badges.
                                </span>
                            </div>

                            <Switch
                                checked={
                                    replaceRealBadges
                                }

                                onChange={
                                    setReplaceRealBadges
                                }
                            />
                        </div>

                        <div
                            className="ps-setting-row"
                        >
                            <div>
                                <strong>
                                    Debug Logs
                                </strong>

                                <span>
                                    Print Iris.ts information in the Discord console.
                                </span>
                            </div>

                            <Switch
                                checked={
                                    debugLogs
                                }

                                onChange={
                                    setDebugLogs
                                }
                            />
                        </div>
                    </div>
                )}
        </div>
    );
}
