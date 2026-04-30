/**
 * @name BackgroundManager
 * @author Narukami
 * @description Enhances themes supporting background images with features (local folder, slideshow, transitions).
 * @version 2.0.2
 * @source https://github.com/Naru-kami/BackgroundManager-plugin
 */


/** @import * as BDT from "betterdiscord" */
/** @import { internals, sliderRef } from "./internals" */
const { React, Webpack, UI, Webpack: { Filters }, Patcher, DOM, ContextMenu, Data, Logger } = BdApi;
const {
  useSyncExternalStore, useState, useLayoutEffect, useEffect,
  useRef, useCallback, memo, useId, createElement: jsx, Fragment
} = React;

const DATA_BASE_NAME = "BackgroundManager";
const STORE_NAME = "images";

/** @param {{slug: string, version: string, name: string}} meta */
module.exports = meta => {
  const defaultSettings = {
    enableDrop: false,
    transition: { enabled: true, duration: 1000 },
    slideshow: { enabled: false, interval: 300000, shuffle: true },
    overwriteCSS: true,
    /** @type {{enabled: boolean, color: "primary1" | "primary2" | "secondary1" | "secondary2"}} */
    accentColor: {
      enabled: false,
      color: "primary1"
    },
    /** @type {{location: "TitleBar" | "ToolBar", position: "end" | "start"}} */
    buttonLocation: { location: "TitleBar", position: "end" },
    adjustment: {
      xPosition: 0,
      yPosition: 0,
      dimming: 0,
      blur: 0,
      grayscale: 0,
      saturate: 100,
      contrast: 100
    },
    addContextMenu: true
  }

  /** @type {AbortController?} */
  var controller;
  /** @type {internals} */
  var internals;
  /**
   * @type {ReturnType<typeof utils.createFastContext<{
   *  items: ImageItem[],
   *  activeSrc: string | null,
   *  settings: typeof defaultSettings,
   * }>>}
   */
  var Store;

  function init() {
    if (internals) return;

    internals = {
      ...Webpack.getBulkKeyed({
        baseLayerClass: { firstId: 783775, filter: Filters.byKeys("baseLayer", "bg") },
        layerContainerClass: { firstId: 56553, filter: Filters.byKeys("trapClicks") },
        markupClass: { firstId: 992595, filter: Filters.byKeys("markup") },
        originalLinkClass: { firstId: 503117, filter: Filters.byKeys("originalLink") },
        scrollbarClass: { firstId: 457845, filter: m => m.thin && !m.none },
        separatorClass: { firstId: 32271, filter: Filters.byKeys("scroller", "label") },
        sliderClass: { firstId: 375905, filter: m => m.sliderContainer && m.slider && !m.infoContainer },

        FocusRing: { firstId: 187322, filter: Filters.byStrings("FocusRing was given a focusTarget"), searchExports: true },
        LazyCarousel: { firstId: 256905, filter: Filters.byStrings("startingIndex??"), searchExports: true },
        ManaButton: { firstId: 657718, filter: Filters.byStrings(".BUTTON_LOADING_STARTED_LABEL,"), searchExports: true },
        MenuSliderControl: { firstId: 106236, filter: Filters.byStrings("moveGrabber"), searchExports: true },
        Popout: { firstId: 922016, filter: Filters.byStrings("Unsupported animation config:"), searchExports: true },
        TextInput: { firstId: 260598, filter: Filters.byStrings('"data-mana-component":"text-area"'), searchExports: true },
        Tooltip: { firstId: 990078, filter: Filters.byStrings("tooltipId", "defaultLayerContext"), searchExports: true },
        TrailingPopout: { firstId: 189252, filter: Filters.bySource("HEADER_BAR_BADGE_BOTTOM", "??\"currentColor\",colorClass:") },
        toCDN: { firstId: 803316, filter: Filters.byStrings(".searchParams.delete(\"width\"),"), searchExports: true },
        useFocusLock: { firstId: 315710, filter: Filters.byStrings("disableReturnRef:"), searchExports: true },
      })
    }
    internals.TrailingPopout = Object.values(internals.TrailingPopout)[0];

    controller = new AbortController();
    Webpack.waitForModule(Filters.byKeys("defaultMarginlegend"), {
      firstId: 920531, signal: controller?.signal,
    }).then(m => { internals.textStylesClass = m });

    Webpack.waitForModule(Filters.byKeys("messagesPopout", "header"), {
      firstId: 251066, signal: controller?.signal,
    }).then(m => { internals.messagesPopoutClass = m });

    if (!internals.baseLayerClass) {
      throw new Error("Missing essential modules.");
    }
    Logger.log(meta.slug, "Initialized");

    if (Data.load(meta.slug, "version")?.startsWith("1")) {
      UI.showChangelogModal({
        title: meta.name,
        subtitle: meta.version,
        blurb: "Beside a whole rewrite of the plugin, version 2.0.0 brings two new features.",
        changes: [{
          title: "Added",
          type: "added",
          items: [
            "Adaptive Button Position:\n\nYou can choose, whether the button should be rendered in the titlebar, or in the channel toolbar.",
            "Accent Colors:\n\nA color can be selected among 4 colors picked from the image's color palette. It is exposed as a CSS Variable and can be used in a theme or customCSS.",
            "Exposed URL:\n\nThe url of the custom background is now exported as a CSS Variable, and can also be used inside a theme or customCSS",
          ]
        }],
        footer: jsx(BdApi.Components.Text, {
          color: BdApi.Components.Text.Colors.MUTED,
          children: jsx(Fragment, null,
            "You can visit the ",
            jsx(BdApi.Components.Text, {
              tag: "a",
              color: BdApi.Components.Text.Colors.LINK,
              children: "`Readme.md`",
              target: "_blank",
              title: "https://github.com/Naru-kami/BackgroundManager-plugin",
              href: "https://github.com/Naru-kami/BackgroundManager-plugin",
            }),
            " file on Github or the description on the ",
            jsx(BdApi.Components.Text, {
              tag: "a",
              color: BdApi.Components.Text.Colors.LINK,
              children: "BetterDiscord plugin page",
              target: "_blank",
              title: "https://betterdiscord.app/plugin/BackgroundManager",
              href: "https://betterdiscord.app/plugin/BackgroundManager",
            }),
            " for more details about how to use these custom variables."
          )
        })
      });
    }
    Data.save(meta.slug, "version", meta.version);
  }

  function start() {
    init();

    utils.enqueueAsync(async () => {
      const items = await utils.getItems();
      /** @type { typeof defaultSettings } */
      const configs = Data.load(meta.slug, "settings");

      for (const item of items) {
        item.src = URL.createObjectURL(item.image);
      }

      Store = utils.createFastContext({
        items,
        activeSrc: items.find(img => img.selected)?.src ?? null,
        settings: {
          ...defaultSettings, ...configs,
          transition: { ...defaultSettings.transition, ...configs?.transition },
          slideshow: { ...defaultSettings.slideshow, ...configs?.slideshow },
          adjustment: { ...defaultSettings.adjustment, ...configs?.adjustment }
        }
      });

      // Patch bg
      const [ThemeProvider, ThemeProviderKey] = Webpack.getWithKey(Filters.byStrings("disable-adaptive-theme"));
      ThemeProviderKey && Patcher.after(meta.slug, ThemeProvider, ThemeProviderKey, (_, __, ret) => {
        if (ret?.props?.children?.props.className?.includes(internals.baseLayerClass?.bg)) {
          ret.props.children.props.children = jsx(Components.ErrorBoundary, {
            children: jsx(Components.Background),
          });
        }
      });

      // Make blobs show in image modals
      const [SrcSetter, SrcSetterKey] = Webpack.getWithKey(Filters.byStrings("sourceWidth:", "sourceHeight:"));
      SrcSetterKey && Patcher.after(meta.slug, SrcSetter, SrcSetterKey, (_, [props]) => {
        if (props?.src?.startsWith("blob:")) return props.src;
      });


      // Store subscribbles
      Store.subscribe(() => {
        utils.enqueueAsync(async () => {
          await utils.saveItems(Store.get().items);
        });
      }, ({ items }) => [items]);

      Store.subscribe((store) => {
        Data.save(meta.slug, 'settings', store.settings);
      }, ({ settings }) => [settings]);

      Store.subscribe(store => {
        store.settings.slideshow.enabled ? Controllers.slideshow.start() : Controllers.slideshow.stop();
      }, ({ settings }) => [settings.slideshow.enabled, settings.slideshow.interval]);

      Store.subscribe(store => {
        store.settings.overwriteCSS === true ? Controllers.themeObserver.observe() : Controllers.themeObserver.disconnect();
      }, ({ settings }) => [settings.overwriteCSS]);

      Store.subscribe(({ settings }) => {
        settings.accentColor.enabled ? Controllers.accentColor.start(settings.accentColor.color, 0) : Controllers.accentColor.stop();
      }, ({ settings }) => [settings.accentColor]);

      Store.subscribe(({ settings, activeSrc }) => {
        Controllers.themeObserver.setUrl(activeSrc, settings.transition.enabled && activeSrc ? settings.transition.duration : 0)
        settings.accentColor.enabled ? Controllers.accentColor.start(settings.accentColor.color, settings.transition.enabled ? settings.transition.duration : 0) : Controllers.accentColor.stop();
      }, ({ activeSrc }) => [activeSrc]);

      Store.subscribe(store => {
        store.settings.addContextMenu ? Controllers.contextMenu.start() : Controllers.contextMenu.stop();
      }, ({ settings }) => [settings.addContextMenu]);

      Store.subscribe(({ settings }) => {
        Controllers.buttonLocation.set(settings.buttonLocation.location, settings.buttonLocation.position);
      }, ({ settings }) => [settings.buttonLocation]);

      generateCSS();
      utils.forceRerender(`.${internals.baseLayerClass?.bg}`);
    });
  }

  function stop() {
    controller?.abort();

    utils.enqueueAsync(async () => {
      Store.unsubscribeAll();
      Store.set(store => ({
        items: store.items.map(item => {
          item.src && URL.revokeObjectURL(item.src);
          item.src = null;
          return item;
        })
      }))
      await utils.saveItems(Store.get().items);
      Store = null;

      Patcher.unpatchAll(meta.slug);
      for (const key in Controllers) {
        Controllers[key].stop();
      }

      DOM.removeStyle("BGM-bgurl")
      DOM.removeStyle(meta.slug);
      utils.forceRerender(`.${internals.baseLayerClass?.bg}`);
    });
  }

  const utils = {
    /**
     * @template Store
     * @param {Store} initialState
     */
    createFastContext(initialState) {
      function createStoreData() {
        var store = initialState;
        /** @type { Set<() => void> } */
        const subscribers = new Set();

        const get = () => store;

        /** @type {(value: Partial<Store> | ((prev: Store) => Partial<Store>)) => void} */
        const set = value => {
          const newValue = typeof value === "function" ? value(store) : value;
          store = { ...store, ...newValue };
          subscribers.forEach(callback => { callback() });
        };

        /** @param {() => void } callback */
        const subscribe = callback => {
          subscribers.add(callback);
          return () => subscribers.delete(callback);
        };

        const unsubscribeAll = () => {
          subscribers.clear();
        }

        return { get, set, subscribe, unsubscribeAll };
      };

      const store = createStoreData();

      /**
       * @template SelectorOutput 
       * @param { (store: Store) => SelectorOutput } selector
       * @returns { [SelectorOutput, (value: Partial<Store> | ((prev: Store) => Partial<Store>)) => void] }
       */
      function useStore(selector) {
        const state = useSyncExternalStore(
          store.subscribe,
          () => selector(store.get()),
          () => selector(initialState),
        );

        return [state, store.set];
      }

      /**
       * @template SelectorOutput 
       * @param {(store: Store) => void } callback
       * @param {(store: Store) => SelectorOutput[] } deps
       */
      function subscribe(callback, deps) {
        const check = () => {
          const newValue = deps(store.get());
          if (newValue.some((e, i) => e !== current[i])) {
            current = newValue;
            callback(store.get());
          }
        }

        callback(store.get());
        let current = deps(store.get());
        return store.subscribe(check);
      }

      return { ...store, subscribe, useStore };
    },

    enqueueAsync: (() => {
      let tail = Promise.resolve();

      /**  @param {() => Promise<void>} callback */
      function enqueue(callback) {
        const run = async () => callback();
        const result = tail.then(run);
        tail = result.catch(Logger.error);
        return result;
      };

      return enqueue;
    })(),

    /**
     * @template T
     * @param {...T} classNames
     */
    clsx(...classNames) { return classNames.filter(Boolean).join(" ") },

    /** @param {number} min @param {number} x @param {number} max */
    clamp(min, x, max) { return Math.max(min, Math.min(x, max)) },

    /** @returns {Promise<IDBDatabase>} */
    openDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATA_BASE_NAME, 1);

        request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true }) };
        request.onsuccess = () => { resolve(request.result) };
        request.onerror = () => reject();
      });
    },

    /**
     * @typedef {{ image: File, selected: boolean, src: string, id: number, width: number, height: number, color?: {signature: string, primary1: number[], primary2: number[], secondary1: number[],  secondary2: number[] } }} ImageItem
     * @returns {Promise<ImageItem[]>}
     */
    getItems() {
      return new Promise((resolve, reject) => {
        utils.openDB().then(db => {
          /** @type {IDBRequest<ImageItem[]>} */
          const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();

          request.onsuccess = () => { resolve(request.result); db.close() };
          request.onerror = () => reject(request.error);
        });
      });
    },

    /**
     * @param {ImageItem[]} items
     * @return {Promise<void>}
     */
    saveItems(items) {
      return new Promise((resolve, reject) => {
        utils.openDB().then(db => {
          const transaction = db.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);

          store.clear();
          items.forEach(item => { store.put(item) });

          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject();
          transaction.onabort = () => reject();
        });
      });
    },

    /** @param {ImageItem | HTMLImageElement} image */
    async getAverageColors(image) {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("");

      if (image instanceof HTMLImageElement) {
        ctx.drawImage(image, 0, 0, image.width, image.height);
      } else {
        const bitmap = await createImageBitmap(image.image);
        ctx.drawImage(bitmap, 0, 0, image.width, image.height);
        bitmap.close();
      }

      const { data } = ctx.getImageData(0, 0, image.width, image.height);

      // mini batch k-means
      const k = 6;
      const max_iters = 50;
      const batch_size = 1024;
      const n_pixels = data.length / 4;

      let centroids = Array.from({ length: k }, (_, i) => {
        const idx = Math.floor(i / k * n_pixels);
        return Array.from({ length: 3 }, (_, i) => data[idx * 4 + i]);
      });

      const getBatch = () => {
        const batchIdx = new Set();
        const batch = [];
        while (batchIdx.size < batch_size) {
          const idx = Math.floor(Math.random() * n_pixels);
          if (batchIdx.has(idx)) continue;

          batchIdx.add(idx);
          batch.push(data[idx * 4 + 0], data[idx * 4 + 1], data[idx * 4 + 2]);
        }
        return batch;
      }

      for (let iter = 0; iter < max_iters; iter++) {
        const batch = getBatch();
        const distances = Array.from({ length: batch.length / 3 }, (_, i) =>
          centroids.map(center => Math.hypot(
            center[0] - batch[i * 3 + 0],
            center[1] - batch[i * 3 + 1],
            center[2] - batch[i * 3 + 2]
          ))
        );

        const labels = distances.map(distArr => distArr.reduce((minIdx, dist, idx) => dist < distArr[minIdx] ? idx : minIdx, 0));

        const sums = Array.from({ length: k }, () => [0, 0, 0]);
        const counts = new Array(k).fill(0);

        for (let h = 0; h < batch.length / 3; h++) {
          sums[labels[h]][0] += batch[h * 3 + 0];
          sums[labels[h]][1] += batch[h * 3 + 1];
          sums[labels[h]][2] += batch[h * 3 + 2];
          counts[labels[h]]++;
        }

        const new_centroids = sums.map((sum, i) => {
          return counts[i] > 0 ? sum.map(s => Math.round(s / counts[i])) : centroids[i];
        });

        const converged = centroids.every(((centroid, i) =>
          Math.abs(new_centroids[i][0] - centroid[0]) < 1e-4 &&
          Math.abs(new_centroids[i][1] - centroid[1]) < 1e-4 &&
          Math.abs(new_centroids[i][2] - centroid[2]) < 1e-4
        ))

        if (converged) break;

        centroids = new_centroids;
      }

      centroids.sort((c1, c2) => {
        const [L1, C1] = utils.rgbToLch(c1[0] / 255, c1[1] / 255, c1[2] / 255);
        const [L2, C2] = utils.rgbToLch(c2[0] / 255, c2[1] / 255, c2[2] / 255);

        const v1 = C1 * (1 - (L1 - 0.667) ** 2);
        const v2 = C2 * (1 - (L2 - 0.667) ** 2);

        return v2 - v1;
      });

      return {
        signature: "MiniBatchKMeans(5)",
        primary1: centroids[0],
        primary2: centroids[1],
        secondary1: centroids[2],
        secondary2: centroids[3],
      }
    },

    /** https://bottosson.github.io/posts/oklab/ @param {number} sR float [0-1] @param {number} sG float [0-1] @param {number} sB float [0-1] */
    rgbToLch(sR, sG, sB) {
      const r = sR <= 0.04045 ? sR / 12.92 : ((sR + 0.055) / 1.055) ** 2.4;
      const g = sG <= 0.04045 ? sG / 12.92 : ((sG + 0.055) / 1.055) ** 2.4;
      const b = sB <= 0.04045 ? sB / 12.92 : ((sB + 0.055) / 1.055) ** 2.4;

      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

      const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
      const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

      return [L, Math.hypot(A, B), Math.atan2(B, A)];
    },

    /** @param {HTMLElement | string} target */
    forceRerender(target) {
      /** @type {HTMLElement | null} */
      const element = typeof target === "string" ? document.querySelector(target) : target;

      if (!element) return;

      const instance = BdApi.ReactUtils.getOwnerInstance(element);
      if (!instance) return;

      const unpatch = Patcher.instead(meta.slug, instance, "render", () => unpatch());
      instance.forceUpdate(() => instance.forceUpdate());
    },

    /** @param {number[]} weights */
    randomChoice(weights) {
      let rnd = weights.reduce((a, b) => a + b) * Math.random();
      return weights.findIndex((a) => { rnd -= a; return rnd < 0 });
    },

    /** @param {number} num */
    formatNumber(num) {
      const units = [
        { value: 1099511627776, symbol: " TiB" },
        { value: 1073741824, symbol: " GiB" },
        { value: 1048576, symbol: " MiB" },
        { value: 1024, symbol: " KiB" },
        { value: 1, symbol: " B" },
      ];
      for (const unit of units) {
        if (num >= unit.value) {
          return (num / unit.value).toFixed(1).replace(/\.0$/, '') + unit.symbol;
        }
      }
      return num.toString();
    },

    /** @param {Uint8Array} buffer */
    getImageType(buffer) {
      const mimeTypes = [
        { mime: 'image/png', pattern: [0x89, 0x50, 0x4E, 0x47] },
        { mime: 'image/jpeg', pattern: [0xFF, 0xD8, 0xFF] },
        { mime: 'image/bmp', pattern: [0x42, 0x4D] },
        { mime: 'image/gif', pattern: [0x47, 0x49, 0x46, 0x38] },
        { mime: 'image/avif', pattern: [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66] },
        { mime: 'image/webp', pattern: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
        { mime: 'image/svg+xml', pattern: [0x3C, 0x73, 0x76, 0x67] },
        { mime: 'image/x-icon', pattern: [0x00, 0x00, 0x01, 0x00] },
      ];
      for (const { mime, pattern } of mimeTypes)
        if (pattern.every((e, i) => e === null || e === buffer[i]))
          return mime;
      return '';
    },

    /** @param {Blob} blob */
    async getFileExtension(blob) {
      const arrayBuffer = new Uint8Array(await blob.arrayBuffer());
      const extensions = {
        jpeg: [[0xFF, 0xD8, 0xFF, 0xEE]],
        jpg: [[0xFF, 0xD8, 0xFF, 0xDB], [0xFF, 0xD8, 0xFF, 0xE0], [0xFF, 0xD8, 0xFF, 0xE1]],
        png: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
        bmp: [[0x42, 0x4D]],
        gif: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
        heic: [[0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
        avif: [[0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]],
        webp: [[0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]],
        svg: [[0x3C, 0x73, 0x76, 0x67]],
        ico: [[0x00, 0x00, 0x01, 0x00]],
      }
      for (const [ext, signs] of Object.entries(extensions)) {
        for (const sign of signs) {
          if (sign.every((e, i) => e === null || e === arrayBuffer[i])) {
            return ext;
          }
        }
      }
      return null;
    },

    paths: {
      MainButton: "M20 4v12H8V4zm0-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-8.5 9.67 1.69 2.26 2.48-3.1L19 15H9zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6z",
      Skip: "M5.7 6.71c-.39.39-.39 1.02 0 1.41L9.58 12 5.7 15.88c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l4.59-4.59c.39-.39.39-1.02 0-1.41L7.12 6.71c-.39-.39-1.03-.39-1.42 0m6.59 0c-.39.39-.39 1.02 0 1.41L16.17 12l-3.88 3.88c-.39.39-.39 1.02 0 1.41s1.02.39 1.41 0l4.59-4.59c.39-.39.39-1.02 0-1.41L13.7 6.7c-.38-.38-1.02-.38-1.41.01",
      Delete: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
      Upload: "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V6h5.17l2 2H20zM9.41 14.42 11 12.84V17h2v-4.16l1.59 1.59L16 13.01 12.01 9 8 13.01z",
      RemoveImage: "M22 8h-8v-2h8v2zM19 10H12V5H5c-1.1 0 -2 0.9 -2 2v12c 0 1.1 0.9 2 2 2h12c1.1 0 2 -0.9 2 -2zM5 19l3 -4l2 3l3 -4l4 5H5z",
      Settings: "M12 15.6c1.98 0 3.6-1.62 3.6-3.6S13.98 8.4 12 8.4 8.4 10.02 8.4 12s1.62 3.6 3.6 3.6m9.15-1.08c.19.14.24.39.12.61l-1.92 3.32c-.12.22-.37.3-.59.22l-2.39-.96c-.49.38-1.03.7-1.62.94l-.36 2.54c-.03.24-.23.41-.47.41H10.08c-.24 0-.43-.17-.48-.41l-.36-2.54c-.59-.24-1.12-.56-1.62-.94l-2.39.96c-.22.07-.47 0-.59-.22L2.72 15.13c-.11-.2-.06-.47.12-.61l2.03-1.58c-.05-.3-.07-.63-.07-.94s.04-.64.09-.94L2.86 9.48c-.2-.14-.24-.4-.12-.61L4.65 5.55c.12-.22.37-.3.59-.22l2.39.96c.49-.37 1.03-.7 1.62-.94l.36-2.54c.04-.24.23-.41.47-.41h3.84c.24 0 .44.17.48.41l.36 2.54c.59.24 1.12.56 1.62.94l2.39-.96c.22-.07.47 0 .59.22l1.92 3.32c.11.2.06.47-.12.61l-2.03 1.58c.05.3.07.62.07.94 0 .33-.02.64-.06.94Z",
      AddImage: "M24 3V5H21V7.99s-1.99.01-2 0V5H16s.01-1.99 0-2h3V0h2V3ZM3 7V21H17v2H3c-1.1 0-2-.9-2-2V7Zm5 9H18l-3.33-4.17-2.48 3.1-1.69-2.26Zm13-6v7c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h7V5H7V17H19V10Z"
    }
  }

  const hooks = {
    /**
     * @param {{
     *  buttons?: number,
     *  onStart?: (e: React.PointerEvent<HTMLElement>) => void,
     *  onChange?: (e: React.PointerEvent<HTMLElement>) => void,
     *  onSubmit?: (e: React.PointerEvent<HTMLElement>) => void
     * }}
     */
    usePointerCapture({ onStart, onChange, onSubmit, buttons = 7 }) {
      /** @type {React.RefObject<number?>} */
      const pointerId = useRef(null);

      /** @type {(e: React.PointerEvent<HTMLElement>) => void} */
      const onPointerDown = useCallback(e => {
        if (!(e.buttons & buttons) || pointerId.current != null) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        pointerId.current = e.pointerId;
        onStart?.(e);
      }, [onStart]);

      /** @type {(e: React.PointerEvent<HTMLElement>) => void} */
      const onPointerMove = useCallback(e => {
        if (!(e.buttons & buttons) || pointerId.current !== e.pointerId) return;

        onChange?.(e);
      }, [onChange]);

      /** @type {(e: React.PointerEvent<HTMLElement>) => void} */
      const onPointerUp = useCallback(e => {
        if (pointerId.current !== e.pointerId) return;

        e.preventDefault();
        e.currentTarget.releasePointerCapture(e.pointerId);
        pointerId.current = null;
        onSubmit?.(e);
      }, [onSubmit]);

      return {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onLostPointerCapture: onPointerUp,
      }
    },
  }

  const Components = {
    Icon: memo(
      /** @param {{ d?: string, className?: string, size?: number }} props */
      ({ d, className, size = 24 }) => {
        return jsx("svg", {
          className,
          "aria-hidden": "true",
          role: "img",
          xmlns: "http://www.w3.org/2000/svg",
          width: `${size}`,
          height: `${size}`,
          fill: "none",
          viewBox: "0 0 24 24",
          children: jsx("path", {
            fill: "currentColor",
            d
          })
        })
      }),

    IconButton: memo(
      /**
       * @param {Partial<{ tooltip: string, d: string, className: string, size: "xs" | "sm" | "md", onClick: (e: React.MouseEvent<HTMLElement, MouseEvent>) => void }>} IconProps
       * @returns { React.JSX.Element }
       */
      ({ tooltip, d, className, onClick, size = "xs" }) => {
        return jsx(internals.Tooltip, {
          text: tooltip,
          asContainer: true,
          hideOnClick: true,
          children: jsx(internals.ManaButton, {
            variant: "icon-only",
            "aria-label": tooltip,
            size,
            icon: () => jsx(Components.Icon, { d, className, size: 22 }),
            onClick
          })
        });
      }),

    Background() {
      const [activeSrc] = Store.useStore(store => store.activeSrc);
      const [transition] = Store.useStore(store => store.settings.transition);
      const [xPosition] = Store.useStore(store => store.settings.adjustment.xPosition);
      const [yPosition] = Store.useStore(store => store.settings.adjustment.yPosition);

      const [activeIdx, setActiveIdx] = useState(() => activeSrc != null ? 0b11 : 0b01);
      const bgsrc = useRef([activeSrc, null]);

      useLayoutEffect(() => {
        setActiveIdx(currIdx => {
          const newIdx = activeSrc ? (currIdx ^ 0b01) | 0b10 : (currIdx ^ 0b01) & ~0b10;
          bgsrc.current[newIdx & 0b01] = activeSrc;
          return newIdx;
        });
      }, [activeSrc]);

      return jsx("div", {
        className: "BGM-bg_container",
        style: {
          "--BGM-transition_duration": utils.clsx(transition.enabled && transition.duration && `${transition.duration}ms`),
          "--BGM-position_x": utils.clsx(xPosition && `${xPosition}%`),
          "--BGM-position_y": utils.clsx(yPosition && `${yPosition}%`),
        },
        children: [
          jsx("div", {
            className: utils.clsx("BGM-bg", activeIdx === 0b10 && "active"),
            style: { backgroundImage: utils.clsx(bgsrc.current[0] != null && `url(${bgsrc.current[0]})`) }
          }),
          jsx("div", {
            className: utils.clsx("BGM-bg", activeIdx === 0b11 && "active"),
            style: { backgroundImage: utils.clsx(bgsrc.current[1] != null && `url(${bgsrc.current[1]})`) }
          }),
          jsx(Components.BackgroundOverlay)
        ],
      })
    },

    BackgroundOverlay() {
      const [adjustment] = Store.useStore(store => store.settings.adjustment);

      return jsx("div", {
        className: "BGM-bg_overlay",
        style: {
          "--BGM-dimming": utils.clsx(adjustment.dimming && `${adjustment.dimming}`),
          "--BGM-blur": utils.clsx(adjustment.blur && `${adjustment.blur}px`),
          "--BGM-grayscale": utils.clsx(adjustment.grayscale && `${adjustment.grayscale}%`),
          "--BGM-saturation": utils.clsx(adjustment.saturate !== 100 && `${adjustment.saturate}%`),
          "--BGM-contrast": utils.clsx(adjustment.contrast !== 100 && `${adjustment.contrast}%`),
        }
      })
    },

    MainPopout() {
      const [open, setOpen] = useState(false);
      /** @type {React.RefObject<HTMLElement | null>} */
      const targetElementRef = useRef(null);

      const toggleOpen = useCallback(() => {
        setOpen(o => !o);
      }, []);
      /** @type {(target?: HTMLElement) => void} */
      const handleClose = useCallback((target) => {
        (!target || !targetElementRef.current?.contains(target)) && setOpen(false);
      }, []);

      return jsx(internals.Popout, {
        shouldShow: open,
        animation: "1",
        position: "bottom",
        align: "left",
        autoInvert: false,
        targetElementRef,
        renderPopout: () => jsx(Components.PopoutWrapper, { onClose: handleClose }),
        children: (_, t) => jsx(internals.TrailingPopout, {
          icon: () => jsx(Components.Icon, { d: utils.paths.MainButton, size: 18 }),
          onClick: toggleOpen,
          selected: t.isShown,
          tooltip: "Background Manager",
          "aria-label": "Background Manager",
          "aria-expanded": t.isShown,
          "aria-haspopup": true,
          ref: targetElementRef,
        })
      });
    },

    /** @param {{onClose?: (target?: HTMLElement) => void}} props */
    PopoutWrapper({ onClose }) {
      /** @type {React.RefObject<HTMLElement | null>} */
      const wrapper = useRef(null);

      useEffect(() => {
        let mouseDownOnPopout = false;
        const layerContainer = wrapper.current?.parentElement?.parentElement?.parentElement;
        if (!layerContainer) return;

        const ctrl = new AbortController();
        if (Store.get().settings.enableDrop) {
          layerContainer.style.setProperty('z-index', '2002');
        }

        addEventListener("mousedown", e => {
          if (!(e.target instanceof HTMLElement)) return;
          mouseDownOnPopout = layerContainer.contains(e.target);
        }, ctrl);

        addEventListener("mouseup", e => {
          if (
            e.target instanceof HTMLElement &&
            !mouseDownOnPopout &&                 // Click did not start on popout
            !layerContainer.contains(e.target)    // and did not end on popout
          ) {
            onClose?.(e.target);
          }
        }, ctrl);

        addEventListener("keydown", e => {
          if (e.key === "Escape" && layerContainer.childElementCount === 1) {
            e.stopPropagation();
            onClose?.();
          }
        }, { signal: ctrl.signal, capture: true });

        return () => {
          layerContainer.style.removeProperty('z-index');
          ctrl.abort();
        }
      }, []);

      !Store.get().settings.enableDrop && internals.useFocusLock?.(wrapper);

      return jsx("div", {
        ref: wrapper,
        role: "dialog",
        tabIndex: -1,
        "aria-modal": "true",
        style: { maxHeight: "85vh", width: "450px" },
        className: internals.messagesPopoutClass?.messagesPopoutWrap,
        children: [
          jsx(Components.PopoutHeader),
          jsx(Components.PopoutBody),
        ]
      })
    },

    PopoutHeader() {
      return jsx("div", {
        className: internals.messagesPopoutClass?.header,
        children: jsx("h1", {
          className: utils.clsx(internals.textStylesClass?.defaultColor, internals.textStylesClass?.['heading-md/medium']),
          children: "Background Manager",
        })
      });
    },

    PopoutBody() {
      const [items, setStore] = Store.useStore(store => store.items);
      const [slideshow] = Store.useStore(store => store.settings.slideshow);

      /** @type {(item: ImageItem) => void} */
      const handleSelect = useCallback(item => {
        setStore(store => {
          const items = [...store.items];
          const currIdx = items.findIndex(e => e.selected);
          if (currIdx in items) {
            items[currIdx] = { ...items[currIdx], selected: false };
          }

          const newIdx = items.findIndex(e => e.src === item.src);
          if (newIdx in items) {
            items[newIdx] = { ...items[newIdx], selected: true };
          }

          return newIdx !== currIdx ? { items, activeSrc: item.src } : {};
        })
      }, []);

      const handleNext = useCallback(() => {
        setStore(store => {
          const items = [...store.items];
          const currIdx = items.findIndex(e => e.selected);
          const weights = new Array(items.length).fill(1);

          if (currIdx in weights) {
            weights[currIdx] = 0;
            items[currIdx] = { ...items[currIdx], selected: false };
          }

          const newIdx = utils.randomChoice(weights);
          items[newIdx] = { ...items[newIdx], selected: true };

          return { items: items, activeSrc: items[newIdx].src }
        })
      }, []);

      /** @type {(item: ImageItem) => void} */
      const handleDelete = useCallback(item => {
        setStore(store => {
          const idx = store.items.findIndex(e => e.src === item.src);
          if (idx === -1) return {};

          const items = store.items.toSpliced(idx, 1);
          items.forEach((e, i) => { e.id = i + 1 });
          const activeSrc = item.selected ? null : store.activeSrc;
          URL.revokeObjectURL(item.src);
          return { items, activeSrc };
        })
      }, []);

      return jsx("div", {
        className: utils.clsx(
          internals.messagesPopoutClass?.messageGroupWrapper,
          internals.messagesPopoutClass?.messagesPopout,
          internals.markupClass?.markup,
          "BGM-body",
        ),
        children: [
          jsx(Components.InputArea),
          jsx("div", {
            role: "separator",
            className: internals.separatorClass?.separator,
          }),
          !!items.length && jsx("div", {
            className: utils.clsx("BGM-memory_info", internals.textStylesClass?.["text-sm/semibold"]),
            children: [
              `Total size in memory: ${utils.formatNumber(items.reduce((p, c) => p + c.image.size, 0))}`,
              slideshow.enabled && items.length >= 2 && jsx(Components.IconButton, {
                tooltip: "Next Background Image",
                onClick: handleNext,
                d: utils.paths.Skip,
              })
            ]
          }),
          jsx("div", {
            className: utils.clsx("BGM-image_grid", internals.scrollbarClass?.thin),
            children: items.map((item) => jsx(Components.ImageThumbnail, {
              key: item.src,
              item,
              selected: item.selected,
              onSelect: handleSelect,
              onDelete: handleDelete,
            }))
          })
        ]
      })
    },

    ImageThumbnail: memo(
      /**
       * @param {{
       *  item: ImageItem; onSelect: (item: ImageItem) => void;
       *  selected: boolean; onDelete: (item: ImageItem) => void;
       * }} props 
       * @returns { React.JSX.Element }
       */
      ({ item, selected, onSelect, onDelete }) => {
        const [error, setError] = useState(false);
        const [loading, startTransition] = React.useTransition();

        /** @type {React.RefObject<HTMLElement?>} */
        const btn = useRef(null);
        const initial = useRef(true);

        /** @type {(e: React.MouseEvent<HTMLElement, MouseEvent>) => void} */
        const handleContextMenu = useCallback(e => {
          e.stopPropagation();
          /** @param {ImageItem} item */
          const menuitems = item => [
            internals.LazyCarousel ? {
              label: "View Image",
              action: () => {
                try {
                  internals.LazyCarousel?.({
                    items: Store.get().items.map(img => ({
                      url: img.src,
                      original: img.src,
                      zoomThumbnailPlaceholder: img.src,
                      contentType: img.image.type,
                      srcIsAnimated: img.image.type === "image/gif",
                      type: "IMAGE",
                      width: img.width,
                      height: img.height,
                      sourceMetadata: {
                        identifier: {
                          filename: img.image.name,
                          size: img.image.size,
                          type: "attachment"
                        }
                      }
                    })),
                    location: "Media Mosaic",
                    startingIndex: item.id - 1,
                    onContextMenu: e => {
                      if (!(e.target instanceof HTMLElement)) return;

                      const src = e.target.closest("img")?.src;
                      const img = Store.get().items.find(e => e.src === src);
                      if (!src || !img) return;
                      const menu = menuitems(img).filter(m => m?.label !== "View Image");
                      ContextMenu.open(e, ContextMenu.buildMenu(menu));
                    }
                  })
                } catch (e) {
                  Logger.error(meta.slug, e);
                }
              }
            } : null,
            item.image.type !== "image/gif" ? {
              label: "Copy Image",
              action: async () => {
                try {
                  if (item.image.type === 'image/png' || item.image.type === 'image/jpeg') {
                    const arrayBuffer = await item.image.arrayBuffer()
                    DiscordNative.clipboard.copyImage(new Uint8Array(arrayBuffer), item.src);
                  } else {
                    const imageBitmap = await createImageBitmap(item.image);
                    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(imageBitmap, 0, 0);
                    const blob = await canvas.convertToBlob({ type: 'image/png' });
                    const arrayBuffer = await blob.arrayBuffer()
                    DiscordNative.clipboard.copyImage(new Uint8Array(arrayBuffer), item.src);
                  }
                  UI.showToast("Image copied to clipboard!", { type: 'success' });
                } catch (err) {
                  UI.showToast(`Failed to copy Image. ${err}`, { type: 'error' });
                }
              }
            } : null,
            {
              label: "Save Image",
              action: async () => {
                try {
                  DiscordNative.fileManager.saveWithDialog(new Uint8Array(await item.image.arrayBuffer()), item.image.name).then(() => {
                    UI.showToast("Saved Image!", { type: "success" });
                  })
                } catch (e) {
                  UI.showToast(`Failed to save Image. ${e}`, { type: 'error' });
                }
              }
            }
          ].filter(e => e != null);
          ContextMenu.open(e, ContextMenu.buildMenu(menuitems(item)));
        }, [item]);

        /** @type {(e: React.MouseEvent<HTMLElement, MouseEvent>) => void} */
        const handleDelete = useCallback(e => {
          e.stopPropagation();
          onDelete(item);
        }, [onDelete, item]);

        useLayoutEffect(() => {
          startTransition(async () => new Promise(resolve => {
            const img = new Image();
            img.onload = () => { resolve() };
            img.onerror = () => { setError(true); resolve() };
            img.src = item.src ?? "";
          }))
        }, []);

        useEffect(() => {
          if (selected) {
            btn.current?.scrollIntoView({ behavior: initial.current ? "instant" : "smooth", block: initial.current ? "center" : "nearest" });
          }
          initial.current = false;
        }, [selected]);

        return jsx(internals.FocusRing ?? Fragment, {
          children: jsx("button", {
            ref: btn,
            onClick: () => onSelect(item),
            onContextMenu: handleContextMenu,
            className: utils.clsx(selected && "selected", "BGM-image_thumbnail"),
            children: [
              loading ? jsx(BdApi.Components.Spinner, { type: BdApi.Components.Spinner.Type.SPINNING_CIRCLE }) :
                error ? jsx("div", { className: internals.textStylesClass?.defaultColor }, "Could not load image") :
                  jsx("img", {
                    tabIndex: -1,
                    src: item.src,
                    className: "BGM-image"
                  }),
              jsx("div", {
                className: "BGM-delete_icon",
                children: jsx(Components.IconButton, {
                  tooltip: "Delete Image",
                  d: utils.paths.Delete,
                  onClick: handleDelete,
                })
              }),
              !error && jsx("div", {
                className: "BGM-image_data",
                children: [
                  jsx("span", null, `SIZE: ${utils.formatNumber(item.image.size)}`),
                  jsx("span", null, item.width && item.height ? `${item.width} x ${item.height}` : null),
                  jsx("span", null, (item.image.type?.split("/").pop() ?? "").toUpperCase() || null),
                ]
              })
            ]
          })
        })
      }),

    InputArea: memo(/** @returns { React.JSX.Element } Don't remove, or TS explodes */() => {
      const [processing, setProcessing] = useState(/**@returns {number[]}*/() => []);
      /** @type {React.RefObject<HTMLElement | null>} */
      const dropArea = useRef(null);

      const handleRemove = useCallback(() => {
        Store.set(store => {
          const idx = store.items.findIndex(e => e.selected);
          if (idx === -1) return {};

          const items = [...store.items];
          items[idx].selected = false;
          return { items, activeSrc: null }
        });
      }, []);

      /** @type {(file?: File | null) => void} */
      const handleFileTransfer = useCallback(file => {
        if (!file) return;

        utils.enqueueAsync(async () => new Promise((res, rej) => {
          const img = new Image();
          img.onload = async () => {
            Store.set(store => ({
              items: [...store.items, {
                image: file,
                selected: false,
                src: img.src,
                id: store.items.length + 1,
                width: img.naturalWidth,
                height: img.naturalHeight,
                color: undefined,
              }]
            }));
            res();
          }
          img.onerror = () => { URL.revokeObjectURL(img.src); rej() };
          img.src = URL.createObjectURL(file);
        }))
      }, []);

      const handleUpload = useCallback(() => {
        DiscordNative?.fileManager?.openFiles?.({
          properties: ["openFile", "multiSelections"],
          filters: [
            { name: "All Files", extensions: ["*"] },
            { name: "All images", extensions: ["png", "jpg", "jpeg", "jpe", "jfif", "exif", "bmp", "dib", "rle", "gif", "avif", "webp", "svg", "ico"] },
            { name: "PNG", extensions: ["png"] },
            { name: "JPEG", extensions: ["jpg", "jpeg", "jpe", "jfif", "exif"] },
            { name: "BMP", extensions: ["bmp", "dib", "rle"] },
            { name: "GIF", extensions: ["gif"] },
            { name: "AV1 (AVIF)", extensions: ["avif"] },
            { name: "WebP", extensions: ["webp"] },
            { name: "SVG", extensions: ["svg"] },
            { name: "ICO", extensions: ["ico"] },
          ]
        }).then(files => {
          files?.forEach(file => {
            if (!file.data || !["png", "jpg", "jpeg", "jpe", "jfif", "exif", "bmp", "dib", "rle", "gif", "avif", "webp", "svg", "ico"].includes((file.filename?.split(".").pop() ?? "").toLowerCase())) {
              UI.showToast(`Could not upload ${file.filename}. Data is empty, or ${file.filename} is not an image.`, { type: "error" });
              return;
            }
            handleFileTransfer(new File([file.data], file.filename, { type: utils.getImageType(file.data) }));
          });
        }).catch(e => {
          Logger.error(meta.slug, e);
          UI.showToast('Could not upload image(s).', { type: 'error' });
        });
      }, []);

      /** @type {(e: React.DragEvent<HTMLDivElement>) => void} */
      const handleDrop = useCallback(e => {
        e.currentTarget.classList.remove("dragging");
        const timeStamp = Date.now();

        if (e.dataTransfer?.files?.length) {
          for (const droppedFile of e.dataTransfer.files) {
            handleFileTransfer(droppedFile);
          }
        } else if (e.dataTransfer?.getData('URL')) {
          setProcessing(prev => [...prev, timeStamp]);
          let filename = "";
          const url = e.dataTransfer.getData('URL');
          fetch(url).then(response =>
            response.ok ? response : Promise.reject(response.status)
          ).then(res => {
            if (res.headers.get('Content-Type')?.startsWith('image/')) {
              try {
                filename = new URL(url).pathname.split("/").at(-1)?.match(/.*\.*\w+/)?.[0].split(".")[0] ?? "image";
              } catch {
                filename = "image";
              }
              return res.blob();
            } else {
              return Promise.reject('Dropped item is not an image.');
            }
          }).then(async blob => {
            const ext = await utils.getFileExtension(blob);
            if (ext) { filename += `.${ext}` }
            handleFileTransfer(new File([blob], filename, { type: blob.type }));
          }).catch(e => {
            Logger.error(meta.slug, e);
            UI.showToast("Cannot get image data.", { type: "error" });
          }).finally(() => {
            setProcessing(prev => prev.filter(t => t !== timeStamp));
          });
        }
      }, [handleFileTransfer]);

      /** @type {(e: React.ClipboardEvent<HTMLElement>) => void} */
      const handlePaste = useCallback(e => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (const index in items) {
          const item = items[index];
          if (item.kind === 'file') {
            handleFileTransfer(item.getAsFile());
            break;
          }
        }
      }, [handleFileTransfer]);

      useEffect(() => { dropArea.current?.focus() }, []);

      return jsx("div", {
        className: "BGM-input_area",
        children: [
          jsx(internals.FocusRing ?? Fragment, null,
            jsx("div", {
              className: "BGM-drop_area",
              contentEditable: "true",
              ref: dropArea,
              onInput: e => { e.preventDefault(); e.currentTarget.textContent = "" },
              onDrop: handleDrop,
              onPaste: handlePaste,
              onDragOver: e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy" },
              onDragEnter: e => e.currentTarget.classList.add('dragging'),
              onDragEnd: e => e.currentTarget.classList.remove('dragging'),
              onDragLeave: e => e.currentTarget.classList.remove('dragging'),
              children: processing.length ? jsx(BdApi.Components.Spinner, { type: BdApi.Components.Spinner.Type.SPINNING_CIRCLE }) : null,
            })
          ),
          jsx(Components.IconButton, {
            tooltip: "Open Images",
            className: "BGM-upload_icon",
            d: utils.paths.Upload,
            onClick: handleUpload,
          }),
          jsx(Components.PopoutSettings),
          jsx(Components.IconButton, {
            tooltip: "Remove Custom Background",
            className: "BGM-remove_icon",
            d: utils.paths.RemoveImage,
            onClick: handleRemove
          }),
        ]
      })
    }),

    PopoutSettings: memo(/** @returns { React.JSX.Element } Don't remove, or TS explodes */() => {
      const [_settings, _setStore] = Store.useStore(store => store.settings);

      const settings = useRef(_settings);
      /** @type {typeof _setStore} */
      const setStore = useCallback((setter) => {
        _setStore(store => {
          const updatedStore = setter instanceof Function ? setter(store) : setter;
          settings.current = { ...settings.current, ...updatedStore.settings };
          return updatedStore;
        });
      }, []);

      /** @type {(e: React.MouseEvent<HTMLElement, MouseEvent>) => void} */
      const handleSettings = useCallback(e => {
        settings.current = { ..._settings };

        ContextMenu.open(e, ContextMenu.buildMenu([
          {
            label: "Enable Transition",
            type: "toggle",
            checked: settings.current.transition.enabled,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, transition: { ...settings.transition, enabled: !settings.transition.enabled } }
              }));
            }
          }, {
            label: "Transition duration",
            type: "custom",
            render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
              label: "Transition Duration",
              value: settings.current.transition.duration,
              disabled: !settings.current.transition.enabled,
              minValue: 0,
              maxValue: 3000,
              suffix: "ms",
              onChange: duration => {
                setStore(({ settings }) => ({
                  settings: { ...settings, transition: { ...settings.transition, duration } }
                }));
              }
            }))
          }, { type: "separator" }, {
            label: "Enable Slideshow",
            type: "toggle",
            checked: settings.current.slideshow.enabled,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, slideshow: { ...settings.slideshow, enabled: !settings.slideshow.enabled } }
              }));
            }
          }, {
            label: "Slideshow Interval",
            type: "custom",
            render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
              label: "Slideshow Interval",
              value: settings.current.slideshow.interval / 6e4,
              disabled: !settings.current.slideshow.enabled,
              minValue: 0.5,
              maxValue: 120,
              decimals: 1,
              suffix: "min",
              onChange: interval => {
                interval *= 6e4;
                setStore(({ settings }) => ({
                  settings: { ...settings, slideshow: { ...settings.slideshow, interval } }
                }));
              }
            }))
          }, {
            label: "Shuffle Slideshow",
            type: "toggle",
            checked: settings.current.slideshow.shuffle,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, slideshow: { ...settings.slideshow, shuffle: !settings.slideshow.shuffle } }
              }));
            }
          }, { type: "separator" }, {
            label: "Enable Drop Area",
            type: "toggle",
            checked: settings.current.enableDrop,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, enableDrop: !settings.enableDrop }
              }));
            }
          }, {
            label: "Overwrite CSS variable",
            type: "toggle",
            checked: settings.current.overwriteCSS,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, overwriteCSS: !settings.overwriteCSS }
              }));
            }
          }, {
            label: "Add to Context Menu",
            type: "toggle",
            checked: settings.current.addContextMenu,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, addContextMenu: !settings.addContextMenu }
              }));
            }
          }, {
            label: "Expose Accent Color",
            type: "toggle",
            checked: settings.current.accentColor.enabled,
            action() {
              setStore(({ settings }) => ({
                settings: { ...settings, accentColor: { ...settings.accentColor, enabled: !settings.accentColor.enabled } }
              }))
            }
          }, {
            label: "Color Picker",
            type: "custom",
            render: () => jsx(Components.ColorPicker)
          }, {
            label: "Adjust Image",
            type: "submenu",
            items: [
              {
                label: "x-position",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "x-Position",
                  value: settings.current.adjustment.xPosition,
                  minValue: -50,
                  maxValue: 50,
                  suffix: "%",
                  onChange: xPosition => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, xPosition: utils.clamp(-50, xPosition, 50) } }
                    }));
                  },
                  onSlide: xPosition => {
                    setStore((store) => {
                      store.settings.adjustment.xPosition = xPosition;
                      return store;
                    });
                  }
                }))
              }, {
                label: "y-position",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "y-Position",
                  value: settings.current.adjustment.yPosition,
                  minValue: -50,
                  maxValue: 50,
                  suffix: "%",
                  onChange: yPosition => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, yPosition: utils.clamp(-50, yPosition, 50) } }
                    }));
                  },
                  onSlide: yPosition => {
                    setStore((store) => {
                      store.settings.adjustment.yPosition = yPosition;
                      return store;
                    });
                  },
                }))
              }, { type: "separator" },
              {
                label: "dimming",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "Dimming",
                  value: settings.current.adjustment.dimming,
                  minValue: 0,
                  maxValue: 1,
                  decimals: 2,
                  onChange: dimming => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, dimming: utils.clamp(0, dimming, 1) } }
                    }));
                  },
                  onSlide: dimming => {
                    setStore((store) => {
                      store.settings.adjustment = { ...store.settings.adjustment, dimming };
                      return store;
                    });
                  },
                }))
              }, {
                label: "blur",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "Blur",
                  value: settings.current.adjustment.blur,
                  minValue: 0,
                  maxValue: 100,
                  suffix: "px",
                  onChange: blur => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, blur } }
                    }));
                  },
                  onSlide: blur => {
                    setStore((store) => {
                      store.settings.adjustment = { ...store.settings.adjustment, blur };
                      return store;
                    });
                  },
                }))
              }, {
                label: "grayscale",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "Grayscale",
                  value: settings.current.adjustment.grayscale,
                  minValue: 0,
                  maxValue: 100,
                  suffix: "%",
                  onChange: grayscale => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, grayscale: utils.clamp(0, grayscale, 100) } }
                    }));
                  },
                  onSlide: grayscale => {
                    setStore((store) => {
                      store.settings.adjustment = { ...store.settings.adjustment, grayscale };
                      return store;
                    });
                  },
                }))
              }, {
                label: "saturate",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "Saturate",
                  value: settings.current.adjustment.saturate,
                  minValue: 0,
                  maxValue: 300,
                  suffix: "%",
                  onChange: saturate => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, saturate } }
                    }));
                  },
                  onSlide: saturate => {
                    setStore((store) => {
                      store.settings.adjustment = { ...store.settings.adjustment, saturate };
                      return store;
                    });
                  },
                }))
              }, {
                label: "Contrast",
                type: "custom",
                render: () => jsx(Components.ErrorBoundary, null, jsx(Components.NumberInput, {
                  label: "contrast",
                  value: settings.current.adjustment.contrast,
                  minValue: 0,
                  maxValue: 300,
                  suffix: "%",
                  onChange: contrast => {
                    setStore(({ settings }) => ({
                      settings: { ...settings, adjustment: { ...settings.adjustment, contrast } }
                    }));
                  },
                  onSlide: contrast => {
                    setStore((store) => {
                      store.settings.adjustment = { ...store.settings.adjustment, contrast };
                      return store;
                    });
                  },
                }))
              }
            ]
          }
        ]))
      }, [_settings]);

      return jsx(Components.IconButton, {
        tooltip: "Open Settings",
        className: "BGM-settings_icon",
        d: utils.paths.Settings,
        onClick: handleSettings,
      })
    }),

    ColorPicker() {
      if (!Store) return null;

      const [accentColor, setStore] = Store.useStore(store => store.settings.accentColor);
      const [selectedImage] = Store.useStore(store => store.items.find(item => item.selected));

      if (!accentColor.enabled || !selectedImage?.color) return null;

      /** @param {typeof defaultSettings["accentColor"]["color"]} colorKey */
      const handleClick = (colorKey) => {
        if (!(selectedImage.color?.hasOwnProperty(colorKey))) return;

        setStore(store => ({
          settings: {
            ...store.settings,
            accentColor: {
              ...store.settings.accentColor,
              color: colorKey,
            }
          }
        }));
      }

      return jsx("div", {
        className: utils.clsx(
          "BGM-color_picker",
          internals.separatorClass?.labelContainer
        ),
        children: ["Primary 1", "Primary 2", "Secondary 1", "Secondary 2"].map(label => {
          /** @type {typeof defaultSettings["accentColor"]["color"]} */
          const colorKey = label.toLowerCase().replace(/\s/g, "");

          return jsx(internals.Tooltip, {
            text: label,
            asContainer: true,
            hideOnClick: false,
            children: jsx("div", {
              key: colorKey,
              role: "button",
              className: utils.clsx("BGM-color_item", colorKey === accentColor.color && "selected"),
              onClick: () => handleClick(colorKey),
              style: { backgroundColor: `rgb(${selectedImage.color?.[colorKey]?.join(", ")})` }
            })
          })
        })
      })
    },

    SettingsPanel: () => {
      const [settings, setStore] = Store.useStore(store => store.settings);

      return jsx(Fragment, null,
        jsx(Components.LocationSelect, {
          label: "Popout Button Position",
          note: "Renders the popout button on the specified location, on either the start or end position.",
          location: settings.buttonLocation.location,
          position: settings.buttonLocation.position,
          onChange: ({ location, position }) => {
            setStore(store => ({
              settings: { ...store.settings, buttonLocation: { location, position } }
            }))
          }
        }),
        jsx("div", { role: "separator", className: internals.separatorClass?.separator }),
        jsx(BdApi.Components.Text, {
          tag: "h2", strong: true,
          color: BdApi.Components.Text.Colors.HEADER_PRIMARY,
          size: BdApi.Components.Text.Sizes.SIZE_16,
          style: { marginBottom: 8 }
        }, "Transitions"),
        jsx(Components.FormSwitch, {
          label: "Enable Background Transitions",
          value: settings.transition.enabled,
          onChange: enabled => {
            setStore(store => ({
              settings: { ...store.settings, transition: { ...store.settings.transition, enabled } },
            }));
          }
        }),
        jsx(Components.NumberInput, {
          withSlider: false,
          value: settings.transition.duration,
          label: "Transition Duration",
          minValue: 0,
          disabled: !settings.transition.enabled,
          suffix: "ms",
          onChange: duration => {
            setStore(store => ({
              settings: { ...store.settings, transition: { ...store.settings.transition, duration } },
            }));
          }
        }),
        jsx("div", { role: "separator", className: internals.separatorClass?.separator }),
        jsx(BdApi.Components.Text, {
          tag: "h2", strong: true,
          color: BdApi.Components.Text.Colors.HEADER_PRIMARY,
          size: BdApi.Components.Text.Sizes.SIZE_16,
          style: { marginBottom: 8 }
        }, "Slideshow"),
        jsx(Components.FormSwitch, {
          label: "Enable Slideshow Mode",
          value: settings.slideshow.enabled,
          onChange: enabled => {
            setStore(store => ({
              settings: { ...store.settings, slideshow: { ...store.settings.slideshow, enabled } },
            }));
          }
        }),
        jsx(Components.NumberInput, {
          withSlider: false,
          label: "Slideshow Interval",
          value: settings.slideshow.interval / 6e4,
          disabled: !settings.slideshow.enabled,
          minValue: 0.5,
          decimals: 1,
          suffix: "min",
          onChange: interval => {
            interval *= 6e4;
            setStore(store => ({
              settings: { ...store.settings, slideshow: { ...store.settings.slideshow, interval } },
            }));
          }
        }),
        jsx(Components.FormSwitch, {
          label: "Enable Shuffle",
          disabled: !settings.slideshow.enabled,
          value: settings.slideshow.shuffle,
          onChange: shuffle => {
            setStore(store => ({
              settings: { ...store.settings, slideshow: { ...store.settings.slideshow, shuffle } },
            }));
          }
        }),
        jsx("div", { role: "separator", className: internals.separatorClass?.separator }),
        jsx(Components.FormSwitch, {
          label: "Enable Drop Area",
          value: settings.enableDrop,
          note: "If enabled, alter the popouts default behavior, to move it infront of Discord's native drop area and disable the focus trap.",
          onChange: enableDrop => {
            setStore(store => ({
              settings: { ...store.settings, enableDrop }
            }))
          }
        }),
        jsx(Components.FormSwitch, {
          label: "Overwrite theme's CSS variables",
          value: settings.overwriteCSS,
          note: "If enabled, it tries to automatically overwrite the custom property of the theme's background image, by searching for common naming conventions. If provided a comma separated list of custom properties, these will overwritten instead.",
          onChange: overwriteCSS => {
            setStore(store => ({
              settings: { ...store.settings, overwriteCSS }
            }))
          }
        }),
        jsx(Components.FormSwitch, {
          label: "Context Menu",
          value: settings.addContextMenu,
          note: "Adds an option to the context menu on images.",
          onChange: addContextMenu => {
            setStore(store => ({
              settings: { ...store.settings, addContextMenu }
            }))
          }
        }),
        jsx("div", { role: "separator", className: internals.separatorClass?.separator }),
        jsx(internals.ManaButton, {
          variant: "critical-primary",
          size: "md",
          text: "Delete Database",
          onClick: () => {
            UI.showConfirmationModal(
              "Delete Database",
              "This will delete the plugins indexedDB database, including every image saved inside.\n\nAre you sure you want to delete all the saved images?",
              {
                danger: true,
                confirmText: "Yes, Delete!",
                onConfirm: () => {
                  setStore(store => {
                    store.items.forEach(item => { URL.revokeObjectURL(item.src) });

                    return {
                      items: [],
                      activeSrc: null,
                      settings: { ...store.settings, slideshow: { ...store.settings.slideshow, enabled: false } },
                    }
                  });
                  indexedDB.deleteDatabase(DATA_BASE_NAME);
                }
              }
            )
          }
        })
      )
    },

    /** @param {{location: "TitleBar" | "ToolBar", position: "end" | "start", note?: string, label?: string, onChange: (loc: {location: "TitleBar" | "ToolBar", position: "end" | "start"}) => void}} */
    LocationSelect({ location, position, label, note, onChange }) {
      const locationOptions = useRef([{ label: "Title Bar", value: "TitleBar" }, { label: "Tool Bar", value: "ToolBar" }]);
      const positionOptions = useRef([{ label: "Start", value: "start" }, { label: "End", value: "end" }]);

      return jsx("div", {
        className: utils.clsx("BGM-form_switch", internals.textStylesClass?.defaultColor),
        children: [
          jsx("div", null, label),
          jsx(BdApi.Components.DropdownInput, {
            value: location,
            options: locationOptions.current,
            onChange: loc => {
              loc !== location && onChange({ location: loc, position });
            }
          }),
          jsx("span", {
            style: { color: "var(--text-muted, #94949c)", textWrap: "balance" },
            className: utils.clsx(internals.textStylesClass?.["text-sm/normal"]),
            children: note,
          }),
          jsx(BdApi.Components.DropdownInput, {
            value: position,
            options: positionOptions.current,
            onChange: pos => {
              pos !== position && onChange({ location, position: pos });
            }
          }),
        ]
      });
    },

    /** @param {{label?: string, value: boolean, onChange?: (value: boolean) => void, disabled?: boolean, note?: string}} props */
    FormSwitch({ label, value, onChange, disabled, note }) {
      return jsx("div", {
        className: utils.clsx("BGM-form_switch", internals.textStylesClass?.defaultColor),
        children: [
          jsx("div", null, label),
          jsx(BdApi.Components.SwitchInput, { value, onChange, disabled }),
          note && jsx("span", {
            style: { color: "var(--text-muted, #94949c)", textWrap: "balance" },
            className: utils.clsx(internals.textStylesClass?.["text-sm/normal"]),
            children: note,
          })
        ]
      })
    },

    /**
     * @param {{
     *  value: number, disabled?: boolean, minValue?: number, maxValue?: number, decimals?: number, withSlider?: boolean,
     *  suffix?: string, label?: string, onChange?: (value: number) => void, onSlide?: (value: number) => void,
     * }} props
     */
    NumberInput({ value, disabled, minValue, maxValue, onChange, onSlide, suffix, label, decimals = 0, withSlider = true }) {
      const [textValue, setTextValue] = useState(`${value}`);
      const [sliderValue, setSliderValue] = useState(value);
      const id = useId();
      const oldValue = useRef(value);
      /** @type {React.RefObject<HTMLTextAreaElement | null>} */
      const inputRef = useRef(null);
      /** @type {React.RefObject<sliderRef | null>} */
      const sliderRef = useRef(null);

      useEffect(() => {
        setTextValue(`${value}`);
        setSliderValue(value);
        sliderRef.current?.updater.enqueueSetState(sliderRef.current, { value }, () => { });
        oldValue.current = value;
      }, [value]);

      useEffect(() => {
        const ctrl = new AbortController();

        inputRef.current?.addEventListener("wheel", e => {
          if (document.activeElement !== e.currentTarget || !e.deltaY || e.buttons) return;

          e.preventDefault();
          const upwards = e.deltaY < 0;
          const sigfig = (decimals ? 10 ** Math.round(-decimals + 1) : 1);
          const modificator = (e.ctrlKey || e.metaKey) ? 100 : e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
          const delta = (upwards ? 1 : -1) * sigfig * modificator;
          setTextValue(val => {
            val = (Math[upwards ? "floor" : "ceil"](Math.fround(Number(val) / sigfig / modificator)) * sigfig * modificator + delta).toFixed(decimals);
            return `${Math.max(Number(val), minValue ?? Number(val))}`;
          });

        }, { signal: ctrl.signal, passive: false });

        inputRef.current?.addEventListener("beforeinput", e => {
          if (e.data && /[^0-9e+\-.]+/.test(e.data)) {
            e.preventDefault();
          }
        }, ctrl);

        return () => { ctrl.abort() }
      }, []);

      /** @type {(value: number) => void} */
      const handleSliderCommit = useCallback(newValue => {
        const val = Number(newValue.toFixed(decimals));
        if (val === oldValue.current) return;

        oldValue.current = val;
        setTextValue(`${val}`);
        onChange?.(val);
      }, [onChange]);

      /** @type {(value: number) => void} */
      const handleSliderChange = useCallback(newValue => {
        const val = Number(newValue.toFixed(decimals));
        setSliderValue(val);
        onSlide?.(val);
      }, [onSlide]);

      /** @type {(value: string) => void} */
      const handleTextChange = useCallback(newValue => {
        setTextValue(newValue);
      }, []);

      const handleTextCommit = useCallback(() => {
        if (Number.isNaN(Number(textValue)) || textValue === "" || Number(textValue) === oldValue.current) {
          setTextValue(`${oldValue.current}`);
          return;
        }

        oldValue.current = Math.max(Number(textValue), minValue ?? Number(textValue));
        setTextValue(`${oldValue.current}`);
        setSliderValue(oldValue.current);
        onChange?.(oldValue.current);
        sliderRef.current?.updater.enqueueSetState(sliderRef.current, { value: oldValue.current });
      }, [onChange, textValue, minValue]);

      /** @type {(e: React.KeyboardEvent<HTMLTextAreaElement>) => void} */
      const handleKeyDown = useCallback(e => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.currentTarget.blur();
        } else if (e.key.startsWith("Arrow")) {
          e.stopPropagation();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();

            const upwards = e.key === "ArrowUp";
            const sigfig = (decimals ? 10 ** Math.round(-decimals + 1) : 1);
            const delta = (upwards ? 1 : -1) * sigfig;
            setTextValue(newValue => {
              const val = (Math[upwards ? "floor" : "ceil"](Math.fround(Number(newValue) / sigfig)) * sigfig + delta).toFixed(decimals);
              return `${Math.max(Number(val), minValue ?? Number(val))}`;
            });
          }
        }
      }, []);

      return jsx("div", {
        className: utils.clsx(
          withSlider && internals.separatorClass?.item,
          withSlider && internals.separatorClass?.labelContainer,
          withSlider && "BGM-number_slider",
          disabled && internals.separatorClass?.disabled,
        ),
        children: [
          jsx("div", {
            className: utils.clsx(internals.textStylesClass?.defaultColor, "BGM-input_row"),
            onMouseEnter: () => inputRef.current?.focus?.(),
            onMouseLeave: () => inputRef.current?.blur?.(),
            children: [
              jsx("label", {
                className: "BGM-label",
                htmlFor: id,
                children: label ?? "",
              }),
              jsx(internals.TextInput, {
                inputRef,
                value: textValue,
                rows: 1,
                disabled,
                id,
                onChange: handleTextChange,
                onBlur: handleTextCommit,
                onKeyDown: handleKeyDown,
              }),
              suffix && jsx('span', null, suffix)
            ]
          }),
          withSlider && jsx("div", {
            ...hooks.usePointerCapture({
              onStart: e => {
                if (!sliderRef.current) return;

                if (!sliderRef.current.state.boundingRect) {
                  sliderRef.current.state.boundingRect = sliderRef.current.containerRef.current?.getBoundingClientRect();
                }
                sliderRef.current.handleMouseDown(e);
                sliderRef.current.moveSmoothly(e);
              },
              onChange: e => { sliderRef.current?.handleMouseMove(e) },
              onSubmit: e => { sliderRef.current?.handleMouseUp(e) }
            }),
            children: jsx(internals.MenuSliderControl, {
              ref: sliderRef,
              mini: true,
              className: internals.sliderClass?.slider,
              disabled,
              initialValue: sliderValue,
              minValue,
              maxValue,
              onValueRender: e => Number(e.toFixed(decimals)) + (suffix ?? ""),
              onValueChange: handleSliderCommit,
              asValueChanges: handleSliderChange,
              keyboardStep: decimals ? 10 ** (-decimals + 1) : 1
            })
          })
        ]
      })
    },

    /** @param {React.PropsWithChildren<{fallback?: React.ReactNode}>} props */
    ErrorBoundary({ fallback, ...restProps }) {
      return jsx(BdApi.Components.ErrorBoundary, {
        ...restProps,
        fallback: fallback ?? jsx('div', { style: { color: '#f03' } }, 'Component Error')
      })
    },
  }

  const Controllers = {
    contextMenu: (() => {
      /** @type {(() => void)?} */
      let cleanupImage;
      /** @type {(() => void)?} */
      let cleanupMessage;

      /** @param {string} src @param {string=} mime */
      function BuildMenuItem(src, mime) {
        return jsx(ContextMenu.Group, null, jsx(ContextMenu.Item, {
          id: "Add-to-BGM",
          label: "Add to Background Manager",
          icon: /** @param {{className: string}} props */({ className }) => jsx(Components.Icon, {
            d: utils.paths.AddImage,
            className,
            size: 16,
          }),
          action: async () => {
            const mediaURL = internals.toCDN(src, mime);
            try {
              const response = await fetch(new Request(mediaURL, { method: "GET", mode: "cors" }));
              if (!response.ok) throw new Error(`${response.status}`);
              if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('Item is not an image.');

              const blob = await response.blob();

              let filename;
              try {
                filename = new URL(mediaURL).pathname.split("/").at(-1)?.match(/.*\.*\w+/)?.[0].split(".")[0] ?? "image";
              } catch {
                filename = "image";
              }
              const ext = await utils.getFileExtension(blob);
              if (ext) { filename += `.${ext}` }

              const file = new File([blob], filename, { type: blob.type });
              utils.enqueueAsync(async () => new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => {
                  Store.set(store => ({
                    items: [...store.items, {
                      id: store.items.length + 1,
                      image: file,
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                      selected: false,
                      src: img.src,
                    }]
                  }))
                  UI.showToast("Successfully added to BackgroundManager", { type: 'success' });
                  res();
                }
                img.onerror = () => {
                  URL.revokeObjectURL(img.src);
                  rej();
                };
                img.src = URL.createObjectURL(file);
              }));
            } catch (e) {
              Logger.error(meta.slug, e);
              UI.showToast("Failed to add to BackgroundManager.", { type: 'error' });
            }
          }
        }))
      }

      function start() {
        if (cleanupImage || cleanupMessage) stop();

        cleanupImage = ContextMenu.patch("image-context", (menu, context) => {
          if (context.target.tagName === "IMG") {
            // image modal
            menu.props.children.push(BuildMenuItem(context.src));
          }
        });

        cleanupMessage = ContextMenu.patch("message", (menu, context) => {
          if (
            !context.target.classList.contains(internals.originalLinkClass?.originalLink) ||
            context.target.dataset.role !== 'img' ||
            !Array.isArray(menu?.props?.children?.props?.children?.at?.(-1).props?.children)
          ) return;

          const urlSources = [
            // uploaded image
            () => context.mediaItem?.contentType?.startsWith('image') ? context.mediaItem : null,
            // linked image
            () => context.message.embeds?.find(e => e.image?.url === context.target.href)?.image,
            // forwarded linked image
            () => context.message.messageSnapshots[0]?.message.embeds?.find(e => e.image?.url === context.target.href)?.image,
            // forwarded uploaded image
            () => context.message.messageSnapshots[0]?.message.attachments?.find(e => e.url === context.target.href),
          ];

          for (const getUrl of urlSources) {
            const media = getUrl();
            if (!media) continue;

            const src = media.proxyUrl ?? media.proxyURL ?? media.proxy_url ?? media.url;
            const mime = media.contentType ?? media.content_type;
            src && mime && menu.props.children.props.children.at(-1).props.children.splice(-1, 0, BuildMenuItem(src, mime));
            break;
          }
        })
      }

      function stop() {
        cleanupImage?.();
        cleanupImage = null;
        cleanupMessage?.();
        cleanupMessage = null;
      }

      return { start, stop };
    })(),
    slideshow: (() => {
      /** @type {number | null} */
      let interval;
      let triggeredHidden = false;

      function nextBg() {
        Store.set(store => {
          if (!store.items.length) return {};

          const items = [...store.items];
          const currIdx = items.findIndex(e => e.selected);
          const weights = new Array(items.length).fill(1);

          if (currIdx in weights && store.items.length > 1) {
            weights[currIdx] = 0;
            items[currIdx] = { ...items[currIdx], selected: false };
          }

          const newIdx = store.settings.slideshow.shuffle ? utils.randomChoice(weights) : (currIdx + 1 + items.length) % items.length;
          items[newIdx] = { ...items[newIdx], selected: true };

          return currIdx !== newIdx ? { items, activeSrc: items[newIdx].src } : {};
        });
      }

      function handleVisibilityChange() {
        if (document.visibilityState === "visible" && triggeredHidden) {
          triggeredHidden = false;
          nextBg();
        }
      }

      function start() {
        stop();
        document.addEventListener("visibilitychange", handleVisibilityChange);

        interval = setInterval(() => {
          if (document.visibilityState === 'hidden') {
            triggeredHidden = true;
            return;
          }
          nextBg();
          Logger.log(meta.slug, 'Image updated on:', new Date());
        }, Math.max(Store.get().settings.slideshow.interval ?? 3e5, 3e4));
      }

      function stop() {
        interval && clearInterval(interval);
        interval = null;
        triggeredHidden = false;
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }

      return { start, stop }
    })(),
    themeObserver: (() => {
      /** @type {MutationObserver | null} */
      let nodeObserver = null;
      /** @type {ReturnType<typeof getCssProps>} */
      let cssProps = [];
      /** @type {number | null} */
      let timer = null;

      function getCssProps() {
        /** @type {NodeListOf<HTMLStyleElement>} */
        const themes = document.querySelectorAll('bd-head bd-themes style');
        if (!themes.length) return [];

        /** @type {{ property: string, value: string, selector: string }[]} */
        const foundProperties = [];
        for (const { sheet } of themes) {
          if (!sheet) continue;

          /** @type {typeof foundProperties} */
          const cssVariables = [];

          for (const rule of sheet.cssRules) {
            if (!(rule instanceof CSSStyleRule)) continue;

            for (const property of rule.style) {
              if (!property.startsWith("--")) continue;

              const value = rule.style.getPropertyValue(property);
              if (!value.startsWith("url")) continue;
              const selector = rule.selectorText;
              cssVariables.push({ property, value, selector });
            }
          }

          if (!cssVariables.length) continue;

          /** @type {{ property: string; value: string; selector: string; } | null} */
          let customProperty = null;
          for (const cssVariable of cssVariables) { // prioritize background, bg, backdrop
            if (["background", "bg", "wallpaper", "backdrop"].some(e => cssVariable.property.toLowerCase().includes(e))) {
              customProperty = cssVariable;
              break;
            }
          }
          if (!customProperty) {
            for (const cssVariable of cssVariables) { // if no variable is found, look for images.
              if (["image", "img"].some(e => cssVariable.property.toLowerCase().includes(e))) {
                customProperty = cssVariable;
                break;
              }
            }
          }
          if (!customProperty) continue;

          foundProperties.push(customProperty);
        }

        return foundProperties;
      }

      /** @param {string | null} src @param {number} timeout */
      function setUrl(src, timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          src ? DOM.addStyle("BGM-bgurl", `:root { --bgm-url: url("${src}") }`) : DOM.removeStyle("BGM-bgurl");
        }, timeout);
      }

      /** @param {boolean} enabled */
      function setStyle(enabled) {
        if (!enabled) {
          DOM.removeStyle("BGM-theme_properties");
          return;
        }
        const style = cssProps.map(e => `${e.selector} {${e.property}: var(--bgm-url) !important;}`).join("\n");
        DOM.addStyle("BGM-theme_properties", style);
      }

      function observe() {
        if (nodeObserver) disconnect();

        function callback() {
          cssProps = getCssProps();
          setStyle(!!Store.get().activeSrc);
        };

        callback();
        nodeObserver = new MutationObserver(callback);
        const themes = document.querySelector("bd-head bd-themes");
        themes && nodeObserver.observe(themes, { childList: true });
      }

      function disconnect() {
        DOM.removeStyle("BGM-theme_properties");
        nodeObserver?.disconnect();
        nodeObserver = null;
      }

      function stop() {
        timer && clearTimeout(timer);
        timer = null;
        DOM.removeStyle("BGM-bgurl");
        disconnect();
      }

      return { stop, observe, disconnect, setStyle, setUrl }
    })(),
    accentColor: (() => {
      /** @type {number | null} */
      let timer = null;

      /** @param {number[]} color @param {number} timeout */
      function setColor(color, timeout) {
        timer && clearTimeout(timer);
        timer = setTimeout(/**@param {typeof color} c*/(c) => {
          DOM.addStyle("BGM-accent_color", `:root { --bgm-accentcolor: rgba(${c.join(", ")});}`);
          timer = null;
        }, timeout, color);
      }

      /** @param {keyof Omit<NonNullable<ImageItem["color"]>, "signature">} colorKey @param {number} timer */
      function start(colorKey, timer) {
        const items = Store.get().items;
        const idx = items.findIndex(e => e.selected);
        if (!(idx in items)) {
          stop();
          return;
        }
        if (items[idx].color?.signature === "MiniBatchKMeans(5)") {
          setColor(items[idx].color[items[idx].color?.hasOwnProperty(colorKey) ? colorKey : "primary1"], timer);
          return;
        }

        const t0 = Date.now();
        utils.enqueueAsync(async () => {
          const color = await utils.getAverageColors(items[idx]);
          items[idx] = { ...items[idx], color };
          setColor(color[items[idx].color?.hasOwnProperty(colorKey) ? colorKey : "primary1"], Math.max(0, timer - (Date.now() - t0)));
          Store.set({ items }); // Don't rerender, just update the color.
        });
      }

      function stop() {
        DOM.removeStyle("BGM-accent_color");
        timer && clearTimeout(timer);
        timer = null;
      }

      return { start, stop }
    })(),
    buttonLocation: (() => {
      /** @type {(() => void) | null} */
      let cleanup = null;
      /** @type {"end" | "start"} */
      let pos = "end";

      function patchTitleBar() {
        const [trailing, trailingKey] = Webpack.getWithKey(Filters.byStrings(".PlatformTypes.WINDOWS", "leading:"));
        if (!trailing || !trailingKey) throw new Error("Cannot find title bar");

        cleanup?.();
        cleanup = Patcher.before(meta.slug, trailing, trailingKey, (_, [props]) => {
          if (props?.trailing?.props?.children?.every?.(e => e?.key !== meta.slug)) {
            props.trailing.props.children.splice(pos === "end" ? -5 : 0, 0, jsx(Components.ErrorBoundary, {
              key: meta.slug,
              children: jsx(Components.MainPopout),
            }));
          }
        });
        utils.forceRerender(`.${internals.baseLayerClass?.layer}.${internals.baseLayerClass?.baseLayer}`);
      }

      function patchToolBar() {
        const [toolbar, toolbarKey] = Webpack.getWithKey(Filters.byStrings("toolbarClassName", "section"));
        if (!toolbar || !toolbarKey) throw new Error("Cannot find tool bar");

        cleanup?.();
        cleanup = Patcher.before(meta.slug, toolbar, toolbarKey, (_, [props]) => {
          if (props?.toolbar?.props?.children?.find(e => Array.isArray(e))?.every?.(e => e?.key !== meta.slug)) {
            props.toolbar.props.children.find(e => Array.isArray(e))[pos === "end" ? "push" : "unshift"](jsx(Components.ErrorBoundary, {
              key: meta.slug,
              children: jsx(Components.MainPopout),
            }));
          }
        });
        utils.forceRerender(`.${internals.baseLayerClass?.layer}.${internals.baseLayerClass?.baseLayer}`);
      }

      /** @param {"ToolBar" | "TitleBar"} location @param {"end" | "start"} position  */
      function set(location, position) {
        pos = position;
        switch (location) {
          case "ToolBar": {
            patchToolBar();
            break;
          }
          case "TitleBar": {
            patchTitleBar();
            break;
          }
          default: {
            throw new Error(`Unsupported location: ${location}`);
          }
        }
      }

      function stop() {
        cleanup?.();
        cleanup = null;
        utils.forceRerender(`.${internals.baseLayerClass?.layer}.${internals.baseLayerClass?.baseLayer}`);
      }

      return { set, stop }
    })(),
  }

  function generateCSS() {
    DOM.addStyle(meta.slug, /* css */`
#app-mount .${internals.baseLayerClass?.bg} {
  isolation: isolate;
  display: block;
}

.BGM-bg_container {
  position: absolute;
  inset: 0;
  z-index: -1;
  isolation: isolate;

  .BGM-bg_overlay {
    position: absolute;
    inset: 0;
    backdrop-filter: blur(var(--BGM-blur, 0px)) brightness(clamp(0, 1 - var(--BGM-dimming, 0), 1)) grayscale(var(--BGM-grayscale, 0%)) contrast(var(--BGM-contrast, 100%)) saturate(var(--BGM-saturation, 100%));
  }
}

.BGM-bg {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: calc(50% - var(--BGM-position_x, 0%)) calc(50% - var(--BGM-position_y, 0%)) / cover no-repeat fixed;
  mix-blend-mode: plus-lighter;
  transition: opacity var(--BGM-transition_duration, 0ms) ease-out;

  &.active {
    opacity: 1;

    @starting-style {
      opacity: 0;
    }
  }
}

.BGM-body {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 0.25rem;
  overflow: hidden !important;
  border: none;
  border-radius: 0;
  margin: 0;
}

.BGM-input_area {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0.5rem 0.75rem 0.5rem 0.25rem;
  gap: 0.75rem;
}

.BGM-drop_area {
  position: relative;
  display: grid;
  border: 2px solid var(--blue-430, currentColor);
  border-radius: .5rem;
  outline: 2px dashed var(--blue-430, currentColor);
  outline-offset: -8px;
  grid-row: span 3;
  caret-color: transparent;
  background: url( "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23333' d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'/%3E%3C/svg%3E" ) center / contain no-repeat rgba(0, 0, 0, 0.5);

  &::before {
    content: 'Drop or Paste Image Here';
    position: absolute;
    display: grid;
    place-items: center;
    inset: -2px;
    opacity: 0;
    border: inherit;
    border-radius: inherit;
    cursor: copy;
    font-size: 1.5rem;
    font-weight: 600;
    box-shadow: inset 0px 0px 16px 2px currentColor;
    transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:is(:focus, .dragging, :focus-visible)::before {
    opacity: 1;
  }
}

.BGM-upload_icon {
  color: var(--green-430);
}
.BGM-settings_icon {
  color: var(--blue-430);
}
.BGM-remove_icon {
  color: var(--red-430);
}

.BGM-memory_info {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: 0.25rem 0.75rem;
}

.BGM-image_grid {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  overflow: auto;
  padding: 0.5rem 0.25rem;
  margin-bottom: 0.5rem;
  align-content: start;
  scrollbar-gutter: stable;
  scroll-padding-block: 0.5rem;
  mask-image: linear-gradient(#0000, #000 0.5rem, #000 calc(100% - 0.5rem), #0000 100%), linear-gradient(to left, #000 0.75rem, #0000 0.75rem);
}

.BGM-image_thumbnail {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-radius: .25rem;
  background-color: #fff1;
  flex: 0 0 calc(50% - 0.25rem);
  aspect-ratio: 16 / 9;
  outline: 1px solid #fff3;
  padding: 0;
  overflow: hidden;
  transition: outline-color 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &.selected {
    outline: 2px solid var(--border-focus, #00b0f4);
  }
}

.BGM-image {
  object-fit: cover;
  min-height: 100%;
  min-width: 100%;
}

.BGM-image_data {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0.25rem 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6667);
  background: linear-gradient(#0000, rgba(25, 25, 25, 0.8) .175rem) no-repeat;

  > :nth-child(n+2):nth-child(-n+3) {
    display: none;
  }
}

.BGM-image_thumbnail:not(:hover, :focus-visible) .BGM-image_data > :nth-child(2) {
  display: block;
}
.BGM-image_thumbnail:is(:hover, :focus-visible) .BGM-image_data > :nth-child(3) {
  display: block;
  font-family: "gg mono"
}

.BGM-delete_icon {
  position: absolute;
  inset: 3px 3px auto auto;

  button {
    width: 18px;
    height: 18px;
    background-image: linear-gradient(#c62828);
    opacity: 0;
    transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
  
    .BGM-image_thumbnail:is(:hover, :focus-visible) &,
    &:focus-visible {
      opacity: 1;
    }
    & svg {
      width: 18px;
      height: 18px;
    }
  }
}

.BGM-number_slider {
  display: grid;
  gap: 0.5rem;
  max-width: 16rem;
}

.BGM-input_row{
  display: flex;
  gap: 0.25rem;
  align-items: center;

  .BGM-label {
    margin-right: auto;
    padding-right: 0.5rem;
    cursor: inherit;
    flex: 1 0 calc(100% - 7.5rem);
  }

  textarea, input {
    white-space: nowrap;
    padding-block: 5px;
    text-align: right;
  }
}

.BGM-color_picker {
  display: flex;
  justify-content: space-evenly;
  
  .BGM-color_item {
    border-radius: 4px;
    width: 20px;
    height: 20px;
    cursor: pointer;
    outline: 1px solid #fff3;
    transition: outline-color 200ms cubic-bezier(0.4, 0, 0.2, 1);

    &.selected {
      outline: 2px solid var(--border-focus, #00b0f4);
    }
  }
}

.BGM-form_switch {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 4px 16px;
  margin-bottom: 20px;

  &:has([disabled]){
    opacity: 0.5;
    pointer-events: none;
  }
}

`)
  }

  return { start, stop, getSettingsPanel: () => jsx(Components.ErrorBoundary, null, jsx(Components.SettingsPanel)) }
}
