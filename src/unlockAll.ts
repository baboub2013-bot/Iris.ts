/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Babou
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByCodeLazy } from "@webpack";
import { Flux, RestAPI } from "@webpack/common";

import { DECORATIONS } from "./catalog";
import { applyProfileChanges } from "./profileRuntime";
import { settings } from "./settings";

/*
 * =====================================================
 * UNLOCK ALL
 * =====================================================
 *
 * 1. UNLOCK (local)
 *
 *    CollectiblesPurchaseStore keeps the owned items in a Map:
 *
 *      get purchases() { return c }
 *      getPurchase(e)  { return c.get(e) }
 *
 *    `purchases` is the internal Map itself, so every product
 *    of CollectiblesCategoryStore.products is added to it as a
 *    fake purchase (same record prototype as a real purchase).
 *    Discord's own profile editor then lets you pick anything.
 *    Real purchases are never overwritten, and every fake one
 *    is removed when Unlock All is turned off.
 *
 * 2. SAVE INTERCEPTION (nothing reaches the server)
 *
 *    When the official editor saves (PATCH /users/@me,
 *    /users/@me/profile, or a guild profile), cosmetic fields
 *    (avatar decoration, nameplate, profile effect, profile
 *    frame) are REMOVED from the request and stored in the
 *    Iris.ts settings instead. The existing spoof system
 *    then displays them, for your account only. Everything
 *    else in the request (bio, pronouns...) is sent normally.
 */

interface FluxStoreLike {
    getName?: () => string;
    addChangeListener?: (listener: () => void) => void;
    removeChangeListener?: (listener: () => void) => void;
    emitChange?: () => void;
    [key: string]: unknown;
}

interface ItemLike {
    skuId?: string;
    type?: number;
    asset?: string;
    label?: string;
    palette?: string;
    [key: string]: unknown;
}

interface BundledProductLike {
    skuId?: string;
    name?: string;
    type?: number;
    premiumType?: number | null;
    prices?: unknown;
}

interface ProductLike {
    skuId?: string;
    name?: string;
    type?: number;
    premiumType?: number | null;
    items?: ItemLike[];
    categorySkuId?: string;
    prices?: unknown;
    bundledProducts?: BundledProductLike[];
}

type RestRequest = {
    url?: string;
    body?: unknown;
    [key: string]: unknown;
};

type RestPatch = (
    this: unknown,
    request: RestRequest
) => Promise<unknown>;

type CosmeticKind =
    | "decoration"
    | "nameplate"
    | "effect"
    | "frame";

/*
 * Bundles are type 1000; their items are unlocked one by one.
 */
const BUNDLE_TYPE = 1000;

const PROFILE_SAVE_URL =
    /^\/(?:users\/@me(?:\/profile)?|guilds\/\d+\/(?:profile|members)\/@me)\/?(?:\?.*)?$/;

const SNOWFLAKE =
    /^\d{15,22}$/;

const fetchCollectibleCategories =
    findByCodeLazy('{type:"COLLECTIBLES_CATEGORIES_FETCH"');

let enabled =
    false;

let purchaseStore:
    FluxStoreLike |
    null =
    null;

let categoryStore:
    FluxStoreLike |
    null =
    null;

let injectedMap:
    Map<string, unknown> |
    null =
    null;

const injectedSkus =
    new Set<string>();

const fakePurchases =
    new WeakSet<object>();

let originalPatch:
    RestPatch |
    null =
    null;

let installedPatch:
    RestPatch |
    null =
    null;

function debug(
    ...args: unknown[]
) {
    if (settings.store.debugLogs) {
        console.info(
            "[Iris.ts] [UnlockAll]",
            ...args
        );
    }
}

function getStore(
    name: string
): FluxStoreLike | null {
    try {
        const all =
            (
                Flux.Store as unknown as {
                    getAll?: () => FluxStoreLike[];
                }
            ).getAll?.() ?? [];

        return all.find(
            store =>
                store?.getName?.() === name
        ) ?? null;
    } catch {
        return null;
    }
}

function getPurchaseMap(): Map<string, unknown> | null {
    const map =
        purchaseStore?.purchases;

    return map instanceof Map
        ? map as Map<string, unknown>
        : null;
}

function getProductMap(): Map<string, ProductLike> | null {
    const map =
        categoryStore?.products;

    return map instanceof Map
        ? map as Map<string, ProductLike>
        : null;
}

function emitPurchaseChange() {
    /*
     * Captured now: disableUnlockAll clears purchaseStore
     * before the timeout runs.
     */
    const store =
        purchaseStore;

    setTimeout(
        () => {
            try {
                store?.emitChange?.();
            } catch {
                // ignore
            }
        },
        0
    );
}

/*
 * =====================================================
 * 1. FAKE PURCHASES
 * =====================================================
 */

function getRealPurchasePrototype(
    map: Map<string, unknown>
): object | null {
    for (const value of map.values()) {
        if (
            value &&
            typeof value === "object" &&
            !fakePurchases.has(value)
        ) {
            return Object.getPrototypeOf(value);
        }
    }

    return null;
}

function injectPurchases() {
    if (!enabled) {
        return;
    }

    const purchases =
        getPurchaseMap();

    const products =
        getProductMap();

    if (
        !purchases ||
        !products
    ) {
        return;
    }

    /*
     * Discord replaced the Map (purchases refetched):
     * start tracking the new one.
     */
    if (purchases !== injectedMap) {
        injectedMap = purchases;
        injectedSkus.clear();
    }

    const prototype =
        getRealPurchasePrototype(
            purchases
        );

    let added = 0;

    const add = (
        skuId: string | undefined,
        name: string | undefined,
        type: number | undefined,
        premiumType: number | null | undefined,
        items: ItemLike[],
        categorySkuId: string | undefined,
        prices: unknown
    ) => {
        if (
            !skuId ||
            typeof type !== "number" ||
            purchases.has(skuId)
        ) {
            return;
        }

        /*
         * Same fields as a real purchase record.
         */
        const data = {
            skuId,
            name: name ?? "",
            type,
            premiumType: premiumType ?? null,
            items,
            categorySkuId: categorySkuId ?? "",
            isCategoryReward: false,
            prices: prices ?? {},
            purchaseType: 1,
            purchasedAt: new Date(),
            expiresAt: null
        };

        const purchase =
            prototype
                ? Object.assign(
                    Object.create(
                        prototype
                    ),
                    data
                )
                : data;

        purchases.set(
            skuId,
            purchase
        );

        fakePurchases.add(
            purchase
        );

        injectedSkus.add(
            skuId
        );

        added++;
    };

    for (const product of products.values()) {
        if (!product) {
            continue;
        }

        const items =
            Array.isArray(product.items)
                ? product.items
                : [];

        const isContainer =
            product.type === BUNDLE_TYPE ||
            items.some(
                item =>
                    item?.type !== product.type
            );

        if (isContainer) {
            for (const item of items) {
                const bundled =
                    product.bundledProducts?.find(
                        entry =>
                            entry?.skuId === item?.skuId
                    );

                add(
                    item?.skuId,
                    bundled?.name ?? product.name,
                    item?.type,
                    bundled?.premiumType ?? product.premiumType,
                    [item],
                    product.categorySkuId,
                    bundled?.prices ?? product.prices
                );
            }

            continue;
        }

        add(
            product.skuId,
            product.name,
            product.type,
            product.premiumType,
            items,
            product.categorySkuId,
            product.prices
        );
    }

    if (added > 0) {
        debug(
            `${added} items unlocked locally (${injectedSkus.size} total)`
        );

        emitPurchaseChange();
    }
}

function removeFakePurchases() {
    const purchases =
        getPurchaseMap();

    if (purchases) {
        for (const skuId of injectedSkus) {
            const value =
                purchases.get(
                    skuId
                );

            if (
                value &&
                typeof value === "object" &&
                fakePurchases.has(value)
            ) {
                purchases.delete(
                    skuId
                );
            }
        }
    }

    injectedSkus.clear();
    injectedMap = null;

    emitPurchaseChange();
}

/*
 * Loads the full catalog (same request Discord makes when
 * the Shop opens), so products are available without
 * visiting the Shop first.
 */
function requestCatalog() {
    try {
        fetchCollectibleCategories({
            includeBundles: true,
            includeUnpublished: false,
            noCache: false,
            paymentGateway: undefined
        });
    } catch (error) {
        debug(
            "Catalog fetch unavailable, open the Shop once",
            error
        );
    }
}

/*
 * =====================================================
 * 2. SAVE INTERCEPTION
 * =====================================================
 */

function findItem(
    skuId: string
): ItemLike | null {
    const purchase =
        getPurchaseMap()?.get(
            skuId
        ) as ProductLike | undefined;

    const fromPurchase =
        purchase?.items?.find(
            item =>
                item?.skuId === skuId
        );

    if (fromPurchase) {
        return fromPurchase;
    }

    const products =
        getProductMap();

    if (!products) {
        return null;
    }

    for (const product of products.values()) {
        const item =
            product?.items?.find(
                entry =>
                    entry?.skuId === skuId
            );

        if (item) {
            return item;
        }
    }

    return null;
}

/*
 * null      -> item removed in the editor
 * string    -> SKU (or asset for decorations)
 * undefined -> unusable value, ignored
 */
function extractValue(
    value: unknown
): string | null | undefined {
    if (value === null) {
        return null;
    }

    if (
        typeof value === "string" ||
        typeof value === "number"
    ) {
        const text =
            String(value).trim();

        return text || null;
    }

    if (
        value &&
        typeof value === "object"
    ) {
        const object =
            value as Record<string, unknown>;

        const id =
            object.sku_id ??
            object.skuId ??
            object.id;

        if (
            typeof id === "string" ||
            typeof id === "number"
        ) {
            return String(id);
        }
    }

    return undefined;
}

function getKind(
    key: string
): CosmeticKind | null {
    const lower =
        key.toLowerCase();

    if (lower.includes("avatar_decoration")) {
        return "decoration";
    }

    if (lower.includes("nameplate")) {
        return "nameplate";
    }

    if (lower.includes("profile_effect")) {
        return "effect";
    }

    if (lower.includes("profile_frame")) {
        return "frame";
    }

    return null;
}

function storeDecoration(
    value: string | null
) {
    if (value === null) {
        settings.store.selectedDecoration = "";
        settings.store.unlockedDecorationAsset = "";
        return;
    }

    const asset =
        SNOWFLAKE.test(value)
            ? findItem(value)?.asset
            : value;

    if (
        typeof asset !== "string" ||
        !asset
    ) {
        debug(
            "Decoration asset not found for",
            value
        );
        return;
    }

    const known =
        DECORATIONS.find(
            entry =>
                entry.asset === asset
        );

    if (known) {
        settings.store.selectedDecoration = known.id;
        settings.store.unlockedDecorationAsset = "";
    } else {
        settings.store.selectedDecoration = "";
        settings.store.unlockedDecorationAsset = asset;
    }
}

function storeNameplate(
    value: string | null
) {
    if (value === null) {
        settings.store.nameplate = "";
        return;
    }

    const item =
        findItem(
            value
        );

    if (
        !item ||
        typeof item.asset !== "string" ||
        !item.asset
    ) {
        debug(
            "Nameplate data not found for",
            value
        );
        return;
    }

    settings.store.nameplate =
        JSON.stringify({
            skuId: value,
            asset: item.asset,
            label: typeof item.label === "string"
                ? item.label
                : "",
            palette: typeof item.palette === "string"
                ? item.palette
                : "",
            preview: `https://cdn.discordapp.com/media/v1/collectibles-shop/${value}/static`
        });
}

function storeCosmetic(
    kind: CosmeticKind,
    value: string | null
) {
    switch (kind) {
        case "decoration":
            storeDecoration(value);
            break;

        case "nameplate":
            storeNameplate(value);
            break;

        case "effect":
            settings.store.profileEffect = value ?? "";
            break;

        case "frame":
            settings.store.profileFrame = value ?? "";
            break;
    }
}

/*
 * Removes cosmetic fields from the body and stores them
 * locally. Returns true if something was captured.
 */
function captureCosmetics(
    body: Record<string, unknown>
): boolean {
    let captured = false;

    /*
     * avatar_decoration_sku_id is preferred over
     * avatar_decoration_id when both are present.
     */
    const keys =
        Object.keys(body)
            .sort(
                (a, b) =>
                    Number(a.includes("sku")) -
                    Number(b.includes("sku"))
            );

    for (const key of keys) {
        const value =
            body[key];

        if (
            key.toLowerCase() === "collectibles" &&
            value &&
            typeof value === "object"
        ) {
            const nameplate =
                extractValue(
                    (value as Record<string, unknown>).nameplate
                );

            if (nameplate !== undefined) {
                storeCosmetic(
                    "nameplate",
                    nameplate
                );
            }

            delete body[key];
            captured = true;
            continue;
        }

        const kind =
            getKind(key);

        if (!kind) {
            continue;
        }

        const extracted =
            extractValue(value);

        if (extracted !== undefined) {
            storeCosmetic(
                kind,
                extracted
            );
        }

        delete body[key];
        captured = true;
    }

    return captured;
}

function installSaveInterception() {
    if (originalPatch) {
        return;
    }

    const api =
        RestAPI as unknown as {
            patch?: RestPatch;
        };

    if (typeof api.patch !== "function") {
        debug(
            "RestAPI.patch not found, save interception disabled"
        );
        return;
    }

    const original =
        api.patch;

    const wrapper: RestPatch = function (
        this: unknown,
        request: RestRequest
    ) {
        let outgoing =
            request;

        try {
            if (
                enabled &&
                request &&
                typeof request.url === "string" &&
                PROFILE_SAVE_URL.test(request.url) &&
                request.body &&
                typeof request.body === "object" &&
                !Array.isArray(request.body)
            ) {
                const body = {
                    ...(request.body as Record<string, unknown>)
                };

                if (captureCosmetics(body)) {
                    outgoing = {
                        ...request,
                        body
                    };

                    debug(
                        "Cosmetics kept local, not sent:",
                        request.url
                    );

                    setTimeout(
                        () => {
                            void applyProfileChanges();
                        },
                        0
                    );
                }
            }
        } catch (error) {
            debug(
                "Save interception error, request sent unchanged",
                error
            );

            outgoing = request;
        }

        return original.call(
            this,
            outgoing
        );
    };

    try {
        api.patch = wrapper;
    } catch {
        // read-only export
    }

    if (api.patch === wrapper) {
        originalPatch = original;
        installedPatch = wrapper;
        debug("Save interception installed");
    } else {
        /*
         * Could not wrap: cosmetics would reach the server,
         * so Unlock All must not stay active.
         */
        console.warn(
            "[Iris.ts] Unlock All: could not intercept profile saves, unlock disabled for safety"
        );
    }
}

function uninstallSaveInterception() {
    if (!originalPatch) {
        return;
    }

    const api =
        RestAPI as unknown as {
            patch?: RestPatch;
        };

    if (api.patch === installedPatch) {
        api.patch = originalPatch;
    }

    originalPatch = null;
    installedPatch = null;
}

/*
 * =====================================================
 * LIFECYCLE
 * =====================================================
 */

function onStoreChange() {
    injectPurchases();
}

export function enableUnlockAll(): boolean {
    if (enabled) {
        return true;
    }

    /*
     * Interception FIRST: never unlock if saves could
     * reach the server.
     */
    installSaveInterception();

    if (!originalPatch) {
        return false;
    }

    purchaseStore =
        getStore("CollectiblesPurchaseStore");

    categoryStore =
        getStore("CollectiblesCategoryStore");

    if (
        !purchaseStore ||
        !categoryStore
    ) {
        console.warn(
            "[Iris.ts] Unlock All: collectibles stores not found"
        );

        uninstallSaveInterception();
        return false;
    }

    enabled = true;

    purchaseStore.addChangeListener?.(
        onStoreChange
    );

    categoryStore.addChangeListener?.(
        onStoreChange
    );

    requestCatalog();
    injectPurchases();

    debug("Enabled");
    return true;
}

export function disableUnlockAll() {
    if (!enabled) {
        uninstallSaveInterception();
        return;
    }

    enabled = false;

    purchaseStore?.removeChangeListener?.(
        onStoreChange
    );

    categoryStore?.removeChangeListener?.(
        onStoreChange
    );

    removeFakePurchases();
    uninstallSaveInterception();

    purchaseStore = null;
    categoryStore = null;

    debug("Disabled");
}
