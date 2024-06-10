/**
 * @name BackgroundLibrary
 * @author Narukami
 * @description Enhances themes supporting background images with features (custom background, transitions, slideshow).
 * @version 1.0.0
 */

'use strict';
const { React, Webpack, Webpack: { Filters }, Patcher, UI, DOM, ContextMenu, Data } = BdApi;

/** @type {typeof import("react")} */
const { useState, useEffect, useRef, useCallback, useId, createElement: jsx, Fragment } = React;

const DATA_BASE_NAME = 'BackgroundLibrary';

module.exports = meta => {
  const defaultSettings = {
    enableDrop: false,
    transition: { enabled: true, duration: 250 },
    slideshow: { enabled: false, interval: 300000, shuffle: true },
    cssVariableDetection: { enabled: true, defaultVariable: '--background-image' },
    addContextMenu: true
  }

  /** @type {{settings: typeof defaultSettings, [key: string]: unknown}} */
  const constants = {};
  /**
   * @typedef {Object} ViewTransition
   * @property {Promise<void>} finished - A promise that resolves when the view transition is finished.
   * @property {Promise<void>} updateCallbackDone - A promise that resolves when the update callback is done.
   * @property {Promise<void>} ready - A promise that resolves when the transition is ready.
   */
  /**
   * @typedef {Object} ImageItem
   * @property {Blob} image - The image blob.
   * @property {boolean} selected - The selected Image for the background.
   * @property {string} src - The objectURL for the image
   * @property {number} id - The ID of the image.
  */

  // Hooks
  /**
   * Utility function to call a memoized callback with the latest state on unmount.
   * @template T
   * @param {(state: T) => void} callback
   * @param {T} state
   */
  function useUnmount(callback, state) {
    const stateRef = useRef(state);

    // Update the ref to the latest state on every render
    useEffect(() => {
      stateRef.current = state;
    }, [state]);

    // Cleanup effect to call the memoized callback with the latest state on unmount
    useEffect(() => {
      return () => {
        callback(stateRef.current);
      };
    }, []);
  }

  /**
   * @template T
   * @param {T | (() => T)} initialSettings 
   * @returns {[T, React.Dispatch<T>]}
   */
  function useSettings() {
    const [settings, setSettings] = useState(constants.settings);
    const setSyncedSettings = useCallback((newSettings) => {
      setSettings((prevSettings) => {
        const updatedSettings = newSettings instanceof Function ? newSettings(prevSettings) : newSettings;
        Data.save(meta.slug, 'settings', updatedSettings);
        constants.settings = { ...updatedSettings };
        return updatedSettings;
      });
    }, []);

    return [settings, setSyncedSettings]
  }

  /**
   * Utility function to open an IndexedDB database.
   * @param {string} storeName - The name of the object store.
   * @returns {Promise<IDBDatabase>} A promise that resolves to the database instance.
   */
  function openDB(storeName) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATA_BASE_NAME, 2);
      // indexedDB.deleteDatabase('DATA_BASE_NAME') to remove whole database

      request.onupgradeneeded = event => {
        /** @type {IDBDatabase} db */
        const db = event.target.result;
        db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
      };

      request.onsuccess = event => {
        resolve(event.target.result);
      };

      request.onerror = event => {
        reject(event.target.error);
      };
    });
  };

  /**
   * Utility function to get all items from the store.
   * @param {IDBDatabase} db - The database instance.
   * @param {string} storeName - The name of the object store.
   * @returns {Promise<ImageItem[]>} A promise that resolves to an array of items.
   */
  function getAllItems(db, storeName) {
    return new Promise((resolve, reject) => {
      const store = db.transaction([storeName], 'readonly').objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  };

  /**
   * Utility function to save items to the store, ensuring sequential key paths.
   * @param {IDBDatabase} db - The database instance.
   * @param {string} storeName - The name of the object store.
   * @param {ImageItem[]} newItems - The items to save.
   * @param {ImageItem[]} prevItems - The previous state of items.
   * @returns {Promise<void>} A promise that resolves when the items are saved.
   */
  function saveItems(db, storeName, newItems, prevItems) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const newIds = new Set(newItems.map(item => item.id));
      const prevIds = new Set(prevItems.map(item => item.id));

      // Add or update items
      newItems.forEach((e, i) => {
        e.id = i + 1; // Ensure sequential key paths
        if (!prevIds.has(e.id)) {
          store.add({ ...e, src: e.selected ? e.src : null });
        } else {
          store.put({ ...e, src: e.selected ? e.src : null });
        }
      });

      // Remove deleted items
      prevItems.forEach(item => {
        if (!newIds.has(item.id)) {
          store.delete(item.id);
        }
      });

      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = (event) => {
        reject(event.target.error);
      };
    });
  };

  /**
   * Custom hook for IndexedDB.
   * @param {string} storeName - The name of the object store.
   * @returns {[ImageItem[], React.Dispatch<React.SetStateAction<ImageItem[]>]} An array containing the items and a function to add items.
   */
  function useIDB(storeName = 'images') {
    /** @type [ImageItem[], React.Dispatch<React.SetStateAction<ImageItem[]>>] */
    const [items, setItems] = useState([]);
    const countEffect = useRef(0);
    const effectCallback = useCallback(/** @param {(storedItems: ImageItem[], database: IDBDatabase) => void} cb */ cb => {
      /** @type {IDBDatabase | undefined} db */
      let db;
      openDB(storeName)
        .then(database => {
          db = database;
          return getAllItems(db, storeName);
        })
        .then(storedItems => cb(storedItems, db))
        .catch(err => {
          console.error('Error opening database:', err);
        });

      return () => {
        db?.close();
      };
    }, [openDB, getAllItems]);

    useEffect(() => {
      effectCallback(storedItems => setItems(storedItems.map(e => {
        if (!e.src)
          e.src = URL.createObjectURL(e.image);
        return e;
      })))
    }, []);
    useEffect(() => {
      countEffect.current++;
      if (countEffect.current > 2) {
        effectCallback((storedItems, db) => {
          saveItems(db, storeName, items, storedItems);
        })
      }
    }, [items]);

    return [items, setItems];
  };

  // Components
  function CircularProgress({ loaderProps, ...props }) {
    return jsx('div', {
      className: 'BackgroundLibrary-skeleton',
      ...props,
      children: jsx('span', {
        ...loaderProps,
        className: 'BackgroundLibrary-loader',
        children: jsx('svg', {
          viewBox: "22 22 44 44",
          style: { display: 'block' },
          children: jsx('circle', {
            cx: "44", cy: "44", r: "20.2", fill: "none", strokeWidth: "3.6"
          })
        })
      })
    })
  }

  function IconComponent({ onClick, showTooltip, ...props }) {
    const btnRef = useRef(null);
    const ttRef = useRef(null);

    useEffect(() => {
      ttRef.current = UI.createTooltip(btnRef.current, 'Open Background Library', { side: 'bottom' });
      ttRef.current.labelElement.style.cssText = 'font-size: 13px; padding: 5px 10px;';
      ttRef.current.element.style.cssText = 'animation: grow-y .15s cubic-bezier(0.2, 0.6, 0.5, 1.1); transform-origin: 50% 0; z-index: 9999;';
    }, []);
    useEffect(() => {
      ttRef.current.element.style.display = showTooltip ? 'block' : 'none';
      ttRef.current.disabled = !showTooltip;
    }, [showTooltip])

    return jsx('div', {
      ...props,
      onClick: onClick,
      ref: btnRef,
      className: constants.toolbarClasses.iconWrapper + ' ' + constants.toolbarClasses.clickable,
      role: 'button',
      tabindex: '0',
      children: jsx('svg', {
        x: '0',
        y: '0',
        className: constants.toolbarClasses.icon,
        'aria-hidden': 'true',
        role: 'img',
        xmlns: "http://www.w3.org/2000/svg",
        width: "24",
        height: "24",
        fill: "none",
        viewBox: "0 0 24 24",
        children: jsx('path', {
          fill: "currentColor",
          d: "M20 4v12H8V4zm0-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-8.5 9.67 1.69 2.26 2.48-3.1L19 15H9zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6z"
        })
      })
    })
  }

  function LibraryComponent({ ...props }) {
    const mainComponent = useRef(null);
    useEffect(() => {
      function onResize() {
        mainComponent.current.style.maxHeight = window.innerHeight - 88 + 'px';
      }
      let layerContainer = null;
      if (constants.settings.enableDrop) {
        layerContainer = reverseQuerySelector(mainComponent.current, '.' + constants.layerContainerClass.layerContainer);
        layerContainer?.style.setProperty('z-index', '2002');
      }
      onResize();
      window.addEventListener('resize', onResize);
      return () => {
        layerContainer?.style.removeProperty('z-index');
        window.removeEventListener('resize', onResize);
      }
    }, []);

    return jsx('div', {
      ...props,
      ref: mainComponent,
      role: "dialog",
      tabIndex: "-1",
      "aria-modal": "true",
      className: constants.messagesPopoutClasses.messagesPopoutWrap,
    },
      jsx(LibraryHead),
      jsx(LibraryBody)
    );
  }

  function LibraryHead() {
    return jsx('div', {
      className: constants.messagesPopoutClasses.header
    }, jsx('h1', {
      className: [constants.textStyles.defaultColor, constants.textStyles[['heading-md/medium']]].join(' '),
    }, "Background Library"));
  }

  function LibraryBody() {
    const [images, setImages] = useIDB();
    const handleFileTransfer = useCallback(blob => {
      setImages(prev => [...prev, { image: blob, selected: false, src: URL.createObjectURL(blob), id: prev.length + 1 }]);
    }, [setImages]);
    const handleDrop = useCallback((e, callback) => {
      e.preventDefault?.();
      if (e.dataTransfer?.files?.length) {
        const cleanup = callback();
        for (const droppedFile of e.dataTransfer.files) {
          if (droppedFile.type.startsWith('image/')) {
            handleFileTransfer(droppedFile);
          }
        }
        cleanup();
      } else if (e.dataTransfer?.getData('URL')) {
        const cleanup = callback();
        fetch(e.dataTransfer.getData('URL')).then(async response => {
          return response.ok ? response : Promise.reject(response.status);
        }).then(res =>
          res.blob()
        ).then(blob =>
          handleFileTransfer(blob)
        ).catch(err => {
          BdApi.showToast('Cannot get image data', { type: 'error' });
          console.error('Status: ', err)
        }).finally(() => {
          cleanup();
        });
      }
    }, [handleFileTransfer]);
    const handlePaste = useCallback((e, callback) => {
      const cleanup = callback();
      e.preventDefault?.();
      let items = e.clipboardData.items;
      for (let index in items) {
        let item = items[index];
        if (item.kind === 'file') {
          const blob = item.getAsFile();
          handleFileTransfer(blob);
          break;
        }
      }
      cleanup();
    }, [handleFileTransfer]);
    const handleUpload = useCallback(uploaded => {
      setImages(prev => {
        uploaded.forEach(e => e.id += prev.length);
        return [...prev, ...uploaded];
      });
    }, [setImages]);

    const handleDelete = useCallback(index => {
      setImages(prev => {
        return prev.filter(e => e.id !== index).map((e, i) => { e.id = i + 1; return e; });
      });
    }, [setImages]);
    const handleSelect = useCallback(index => {
      setImages(prev => {
        prev.forEach(e => {
          e.selected = e.id === index;
        });
        return [...prev];
      });
    }, [setImages]);
    const handleRemove = useCallback(() => {
      setImages(prev => {
        prev.forEach(e => {
          e.selected = false;
        });
        viewTransition(() => {
          DOM.removeStyle('BackgroundLibrary-background');
        })
        return [...prev];
      });

    }, [setImages]);


    useUnmount((ims) => {
      // Clean up all object urls when component unmounts
      ims.forEach(e => {
        if (!e.selected) {
          URL.revokeObjectURL(e.src);
          e.src = null;
        }
      });
    }, images);

    return jsx('div', {
      className: [constants.messagesPopoutClasses.messageGroupWrapper, constants.markupStyles.markup, constants.messagesPopoutClasses.messagesPopout].join(' '),
      style: { display: "grid", 'grid-template-rows': 'auto auto 1fr' },
    },
      jsx(ErrorBoundary, {
        fallback: 'Internal Component Error. Background Library crashed.'
      },
        jsx(InputComponent, {
          onDrop: handleDrop,
          onPaste: handlePaste,
          onRemove: handleRemove,
          onUpload: handleUpload
        }), jsx('div', {
          role: 'separator',
          className: constants.separator.separator,
          style: { marginRight: '0.75rem' }
        }), jsx('div', {
          className: ['BackgroundLibrary-gridWrapper', constants.scrollbar.thin].join(' '),
        }, images.reduce((p, c) => p + c.image.size, 0) ? jsx('div', {
          style: { width: '100%' },
          className: constants.textStyles['text-sm/semibold'],
          children: 'Total size in memory: ' + formatNumber(images.reduce((p, c) => p + c.image.size, 0)) + 'B',
        }) : null, images.map((e, i) => {
          return jsx(ImageComponent, {
            key: i,
            id: e.id,
            item: e,
            onDelete: handleDelete,
            onSelect: handleSelect
          })
        })
        )
      )
    )
  }

  function ImageComponent({ item, onDelete, onSelect, id }) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const element = useRef(null);
    const handleImageClick = useCallback(e => {
      e.preventDefault?.();
      e.stopPropagation?.();
      e.stopImmediatePropagation?.();
      onSelect(id);
      updateImage(item);
    }, [onSelect, id, item, updateImage]);
    const handleDelete = useCallback(e => {
      e.preventDefault?.();
      e.stopPropagation?.();
      e.stopImmediatePropagation?.();
      URL.revokeObjectURL(item.src);
      onDelete(id);
      item.selected && DOM.removeStyle('BackgroundLibrary-background');
    }, [onDelete, item, id, item.selected, item.src]);
    const handleContextMenu = useCallback(e => {
      const MyContextMenu = ContextMenu.buildMenu([
        {
          label: "Copy Image",
          action: async () => {
            try {
              const arrayBuffer = await item.image.arrayBuffer()
              DiscordNative.clipboard.copyImage(new Uint8Array(arrayBuffer), item.src)
              BdApi.showToast("Image copied to clipboard!", { type: 'success' });
            } catch (err) {
              BdApi.showToast("Failed to copy Image. " + err, { type: 'error' });
            }
          }
        }, {
          label: "Save Image",
          action: async () => {
            try {
              const arrayBuffer = await item.image.arrayBuffer();
              let url = (new URL(item.src)).pathname.split('/').pop() || 'unknown';
              const extension = item.image.type.split('/').pop();
              if (extension) {
                url += '.' + extension;
              }
              await DiscordNative.fileManager.saveWithDialog(new Uint8Array(arrayBuffer), url);
              BdApi.showToast("Saved Image!", { type: 'success' });
            } catch (err) {
              BdApi.showToast("Failed to save Image. " + err, { type: 'error' });
            }
          }
        }
      ]);
      ContextMenu.open(e, MyContextMenu)
    }, [element.current, item, item.image, item.src]);

    useEffect(() => {
      let first = true;
      const img = new Image();
      img.src = item.src || '';
      img.onload = () => setLoaded(true);
      img.onerror = () => {
        if (first) {
          URL.revokeObjectURL(item.src);
          item.src = URL.createObjectURL(item.image);
          img.src = item.src;
          first = false;
        }
        else setError(true);
      };
    }, []);

    return jsx('button', {
      className: 'BackgroundLibrary-imageWrapper ' + constants.textStyles.defaultColor + (item.selected ? ' selected' : ''),
      onClick: handleImageClick,
      onContextMenu: handleContextMenu,
      children: error ? jsx('div', null, 'Could not laod image. Try to reopen.') : [
        !loaded ? jsx(CircularProgress) : jsx('img', {
          ref: element,
          tabIndex: '-1',
          src: item.src || '',
          className: 'BackgroundLibrary-image',
        }), jsx('span', {
          className: ['BackgroundLibrary-imageData', constants.textStyles.defaultColor].join(' '),
          children: 'SIZE: ' + formatNumber(item.image.size) + 'B',
        }), jsx('button', {
          className: 'BackgroundLibrary-deleteButton',
          title: 'Delete',
          onClick: handleDelete,
          children: jsx('svg', {
            x: '0', y: '0',
            focusable: "false",
            role: 'img',
            xmlns: "http://www.w3.org/2000/svg",
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
            fill: "none",
            children: jsx('path', {
              fill: "currentColor",
              d: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
            })
          })
        })
      ]
    })
  }

  function InputComponent({ onDrop, onPaste, onRemove, onUpload }) {
    const [processing, setProcessing] = useState([]);
    const dropArea = useRef(null);
    const remove = useRef(null);
    const upload = useRef(null);

    const handleUpload = useCallback(() => {
      DiscordNative.fileManager.openFiles({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All images', extensions: ['png', 'jpg', 'jpeg', 'jpe', 'jfif', 'exif', 'bmp', 'dib', 'rle', 'tiff', 'tif', 'gif', 'jxr', 'wpd', 'wmp', 'webp'] },
          { name: 'PNG', extensions: ['png'] },
          { name: 'JPEG', extensions: ['jpg', 'jpeg', 'jpe', 'jfif', 'exif'] },
          { name: 'BMP', extensions: ['bmp', 'dib', 'rle'] },
          { name: 'TIFF', extensions: ['tiff', 'tif'] },
          { name: 'GIF', extensions: ['gif'] },
          { name: 'JPEG XR', extensions: ['jxr', 'wpd', 'wmp'] },
          { name: 'WebP', extensions: ['webp'] },
        ]
      }).then(files => {
        if (!files.length) return;
        const toPush = [];
        files.forEach((file, i) => {
          if (!file.data || !['png', 'jpg', 'jpeg', 'jpe', 'jfif', 'exif', 'bmp', 'dib', 'rle', 'tiff', 'tif', 'gif', 'jxr', 'wpd', 'wmp', 'webp'].includes(file.filename?.split('.').pop()?.toLowerCase())) {
            console.log('Could not upload ' + file.filename + '. Data is empty, or ' + file.filename + ' is not an image.')
            BdApi.showToast('Could not upload ' + file.filename + '. Data is empty, or ' + file.filename + ' is not an image.', { type: 'error' });
            return;
          }
          const blob = new Blob([file.data]);
          toPush.push({
            image: blob,
            selected: false,
            src: URL.createObjectURL(blob),
            id: i + 1
          })
        });
        onUpload(toPush);
      }).catch(e => { console.error(e); BdApi.showToast('Could not upload image. ' + e, { type: 'error' }) });
    }, [onUpload]);
    const handleInput = useCallback(e => {
      e.preventDefault?.();
      e.target.textContent = '';
    }, []);
    const handleDragEnter = useCallback(() => {
      dropArea.current.classList.add('dragging');
    }, [dropArea]);
    const handleDragOver = useCallback(e => {
      e.preventDefault?.();
      e.stopPropagation?.();
      e.dataTransfer.dropEffect = 'copy';
    }, []);
    const handleDragEnd = useCallback(() => {
      dropArea.current.classList.remove('dragging');
    }, [dropArea]);
    const handleDrop = useCallback(e => {
      const timeStamp = Date.now();
      handleDragEnd();
      onDrop(e, () => {
        setProcessing(prev => [...prev, timeStamp]);
        return () => setProcessing(prev => prev.filter(t => t !== timeStamp));
      });
    }, [onDrop, handleDragEnd, setProcessing]);
    const handlePaste = useCallback(e => {
      const timeStamp = Date.now();
      onPaste(e, () => {
        setProcessing(prev => [...prev, timeStamp]);
        return () => setProcessing(prev => prev.filter(t => t !== timeStamp));
      });
    }, [onPaste, setProcessing]);

    useEffect(() => {
      const r = UI.createTooltip(remove.current, 'Remove Custom Background', { side: 'top' })
      r.element.style.cssText = 'animation: grow-y .15s cubic-bezier(0.2, 0.6, 0.5, 1.1); transform-origin: 50% 100%; z-index: 9999;';
      r.labelElement.style.paddingInline = '0.5rem';
      const u = UI.createTooltip(upload.current, 'Open Images', { side: 'top' })
      u.element.style.cssText = 'animation: grow-y .15s cubic-bezier(0.2, 0.6, 0.5, 1.1); transform-origin: 50% 100%; z-index: 9999;';
    }, [])

    return jsx('div', {
      className: 'BackgroundLibrary-inputWrapper',
      children: [
        jsx('div', {
          className: 'BackgroundLibrary-DropAndPasteArea',
          contentEditable: 'true',
          ref: dropArea,
          onInput: handleInput,
          onDrop: handleDrop,
          onPaste: handlePaste,
          onDragOver: handleDragOver,
          onDragEnter: handleDragEnter,
          onDragEnd: handleDragEnd,
          onDragLeave: handleDragEnd,
          children: processing.length ? jsx(CircularProgress, {
            style: { position: 'absolute', width: '1.5rem', height: '1.5rem', top: '1rem', right: '1rem', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)' },
            loaderProps: {
              style: { height: '100%' }
            }
          }) : null
        }),
        jsx('button', {
          ref: upload,
          onClick: handleUpload,
          className: 'BackgroundLibrary-UploadButton',
          children: jsx('svg', {
            x: '0', y: '0',
            focusable: 'false',
            'aria-hidden': 'true',
            role: 'img',
            xmlns: "http://www.w3.org/2000/svg",
            width: "24",
            height: "24",
            fill: "none",
            viewBox: "0 0 24 24",
            children: jsx('path', {
              fill: "currentColor",
              d: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V6h5.17l2 2H20zM9.41 14.42 11 12.84V17h2v-4.16l1.59 1.59L16 13.01 12.01 9 8 13.01z'
            })
          })
        }),
        jsx(InPopoutSettings),
        jsx('button', {
          ref: remove,
          className: 'BackgroundLibrary-RemoveBgButton',
          onClick: onRemove,
          children: jsx('svg', {
            x: '0', y: '0',
            focusable: 'false',
            'aria-hidden': 'true',
            role: 'img',
            xmlns: "http://www.w3.org/2000/svg",
            width: "24",
            height: "24",
            fill: "none",
            viewBox: "0 0 24 24",
            children: jsx('path', {
              fill: "currentColor",
              d: 'M22 8h-8v-2h8v2zM19 10H12V5H5c-1.1 0 -2 0.9 -2 2v12c 0 1.1 0.9 2 2 2h12c1.1 0 2 -0.9 2 -2zM5 19l3 -4l2 3l3 -4l4 5H5z'
            })
          })
        }),
      ]
    })
  }

  function PopoutComponent() {
    const [open, setOpen] = useState(false)
    const handleClick = useCallback(() => {
      setOpen(op => !op);
    }, [setOpen]);

    return jsx(constants.popoutRoot.Popout, {
      shouldShow: open,
      animation: '1',
      position: 'bottom',
      align: 'right',
      autoInvert: false,
      spacing: 16,
      onRequestClose: () => setOpen(false),
      renderPopout: e => jsx(LibraryComponent, { ...e }),
      children: (e, t) => {
        let { isShown: open } = t;
        return jsx(IconComponent, {
          ...e,
          id: meta.slug,
          onClick: handleClick,
          showTooltip: !open
        })
      }
    })
  }

  // Setting Components
  function BuildSettings() {
    const [setting, setSetting] = useSettings();

    return jsx(Fragment, {
      children: [
        jsx(constants.nativeUI.FormSection, {
          title: 'Drop Area',
          children: jsx(constants.nativeUI.FormSwitch, {
            hideBorder: true,
            value: setting.enableDrop,
            note: 'When enabled, the popout will move infront of the native drop area.',
            onChange: newVal => setSetting(prev => ({ ...prev, enableDrop: newVal })),
          }, 'Enable Drop Area')
        }),
        jsx('div', { role: 'separator', className: constants.separator.separator }),
        jsx(constants.nativeUI.FormSection, {
          title: 'Transitions',
          children: [
            jsx(constants.nativeUI.FormSwitch, {
              hideBorder: true,
              value: setting.transition.enabled,
              note: 'During transitions, Discord cannot respond to interactions.',
              onChange: newVal => setSetting(prev => ({ ...prev, transition: { ...prev.transition, enabled: newVal } })),
            }, 'Enable Background Transitions'),
            jsx(FormTextInput, {
              disabled: !setting.transition.enabled,
              type: 'number',
              min: 1,
              value: setting.transition.duration + '',
              prefixElement: jsx(constants.nativeUI.FormText, { style: { flex: 1 }, className: constants.disabled.title }, 'Transition Duration (ms)'),
              onChange: newVal => {
                setSetting(prev => ({ ...prev, transition: { ...prev.transition, duration: Number(newVal) } }));
                generateCSS();
              },
            })
          ],
        }),
        jsx('div', { role: 'separator', className: constants.separator.separator }),
        jsx(constants.nativeUI.FormSection, {
          title: 'Slide Show',
          children: [
            jsx(constants.nativeUI.FormSwitch, {
              hideBorder: true,
              value: setting.slideshow.enabled,
              onChange: newVal => {
                setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, enabled: newVal } }));
                newVal ? slideShowManager.restart() : slideShowManager.stop();
              },
            }, 'Enable Slideshow Mode'),
            jsx(FormTextInput, {
              disabled: !setting.slideshow.enabled,
              type: 'number',
              min: 0.5,
              value: setting.slideshow.interval / 1000 / 60 + '',
              prefixElement: jsx(constants.nativeUI.FormText, { style: { flex: 1 }, className: constants.disabled.title }, 'Slideshow Interval (minutes)'),
              onChange: newVal => {
                setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, interval: Number(newVal) * 1000 * 60 } }));
                slideShowManager.restart();
              },
            }),
            jsx(constants.nativeUI.FormSwitch, {
              disabled: !setting.slideshow.enabled,
              hideBorder: true,
              value: setting.slideshow.shuffle,
              onChange: newVal => setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, shuffle: newVal } })),
            }, 'Enable Shuffle')
          ],
        }),
        jsx('div', { role: 'separator', className: constants.separator.separator }),
        jsx(constants.nativeUI.FormSection, {
          title: 'CSS Variables',
          children: [
            jsx(constants.nativeUI.FormSwitch, {
              hideBorder: true,
              value: setting.cssVariableDetection.enabled,
              onChange: newVal => {
                setSetting(prev => ({ ...prev, cssVariableDetection: { ...prev.cssVariableDetection, enabled: newVal } }));
                setImageFromIDB();
              },
            }, 'Autodetect CSS Variables from themes'),
            jsx(FormTextInput, {
              disabled: setting.cssVariableDetection.enabled,
              type: 'text',
              value: setting.cssVariableDetection.defaultVariable,
              validation: newVal => newVal.length > 2 && newVal.startsWith('--'),
              prefixElement: jsx(constants.nativeUI.FormText, { style: { flex: 1 }, className: constants.disabled.title }, 'Default CSS Variable'),
              onChange: newVal => {
                setSetting(prev => ({ ...prev, cssVariableDetection: { ...prev.cssVariableDetection, defaultVariable: newVal } }));
                setImageFromIDB();
              },
            }),
          ],
        }), jsx('div', { role: 'separator', className: constants.separator.separator }),
        jsx(constants.nativeUI.FormSection, {
          title: 'Context Menu',
          children: jsx(constants.nativeUI.FormSwitch, {
            hideBorder: true,
            value: setting.addContextMenu,
            onChange: newVal => {
              setSetting(prev => ({ ...prev, addContextMenu: newVal }));
              newVal ? contextMenuPatcher.patch() : contextMenuPatcher.unpatch();
            },
          }, 'Adds a context menu option on images')
        }),
      ]
    })
  }

  function FormTextInput({ value, onChange, validation, ...props }) {
    const lastVal = useRef(value);
    const [val, setVal] = useState(value);
    const handleChange = useCallback(newVal => { setVal(newVal) }, [setVal]);
    const handleBlur = useCallback(() => {
      if (props.type === 'number') {
        const clampedVal = Number(val) ? Math.max(Number(val), props.min || 0.5) : Number(lastVal.current);
        lastVal.current = clampedVal;
        onChange(clampedVal);
        setVal(clampedVal + '');
      } else {
        if (!(validation instanceof Function) || validation(val)) {
          onChange(val)
          lastVal.current = val;
        } else {
          setVal(lastVal.current);
        };
      }
    }, [val, onChange, lastVal.current, setVal]);
    const handleKeyDown = useCallback(e => {
      if (e.key === 'Enter') {
        e.target?.blur?.();
      }
    }, [handleBlur]);

    return jsx(constants.nativeUI.TextInput, {
      ...props,
      value: val,
      className: 'BackgroundLibrary-SettingsTextInput ' + (props.disabled ? constants.disabled.disabled : ''),
      onChange: handleChange,
      onBlur: handleBlur,
      onKeyDown: handleKeyDown
    })
  }

  function MenuInput({ value, onChange, ...props }) {
    const [textValue, setTextValue] = useState(value + '');
    const [sliderValue, setSliderValue] = useState(value);

    const timeoutRef = useRef(null);
    const oldValue = useRef(value + '');
    const ringTarget = useRef(null);
    const ID = useId();

    const handleTextChange = useCallback(newValue => {
      setTextValue(props.type === 'number' ? Math.max(Number(newValue.replace(',', '.')), props.minValue ?? Number(newValue.replace(',', '.'))) + '' : newValue)
    }, [setTextValue]);
    const handlSliderChange = useCallback(newValue => {
      newValue = Number(newValue.toFixed(props.decimals ?? 0));
      setSliderValue(newValue);
      // Discords Slider component doesn't support onCommit. So debounce it is sadge... 
      timeoutRef.current && clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        onSliderCommit(newValue);
      }, 333);
    }, [setSliderValue]);

    const onTextCommit = useCallback(() => {
      if (props.validation) {
        if (props.validation(textValue)) {
          setSliderValue(textValue);
          onChange(textValue);
          oldValue.current = textValue;
        } else {
          setTextValue(oldValue.current);
        }
      } else {
        props.type === 'number' && setTextValue(Math.max(Number(textValue), props.minValue ?? Number(textValue)));
        setSliderValue(Math.max(Number(textValue), props.minValue ?? Number(textValue)));
        onChange(props.type === 'number' ? Math.max(Number(textValue), props.minValue ?? Number(textValue)) : textValue);
      }
    }, [onChange, setSliderValue, textValue, oldValue, setTextValue]);
    const handleKeyDown = useCallback(e => {
      e.key === 'Enter' && e.target?.blur?.();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation?.();
      }
    }, []);
    const onSliderCommit = useCallback(newValue => {
      setTextValue(newValue + '');
      onChange(newValue)
    }, [onChange, setTextValue]);

    useEffect(() => {
      ringTarget.current?.blur();
      return () => timeoutRef.current && clearTimeout(timeoutRef.current)
    }, []);

    return jsx('div', {
      style: {
        display: 'grid',
        gap: '0.5rem',
        gridTemplateColumns: props.type === 'number' ? '2fr 1fr' : 'auto auto',
        cursor: props.disabled ? 'not-allowed' : null,
      },
      className: [constants.separator.item, constants.separator.labelContainer].join(' '),
      children: [
        jsx('label', {
          for: ID,
          children: props.label,
          style: { justifySelf: 'start', cursor: props.disabled ? 'not-allowed' : null },
          className: [constants.separator.label, (props.disabled ? constants.separator.disabled : '')].join(' '),
        }),
        jsx('div', {
          style: { display: 'flex', gap: '0.25rem', alignItems: 'center' },
          children: [
            jsx(constants.nativeUI.TextInput, {
              value: textValue,
              inputRef: ringTarget,
              focusProps: { enabled: false },
              type: props.type ?? 'number',
              disabled: props.disabled,
              style: { height: '1.5rem', padding: '0.25rem', textAlign: 'right' },
              id: ID,
              onChange: handleTextChange,
              onBlur: onTextCommit,
              onKeyDown: handleKeyDown,
            }),
            props.type === 'number' && props.suffix ? jsx('span', { children: props.suffix }) : null
          ]
        }),
        props.type !== 'number' ? null : jsx('div', {
          className: props.disabled ? constants.separator.disabled : '',
          disabled: props.disabled,
          style: { gridColumn: 'span 2' },
          children: jsx(constants.nativeUI.MenuSliderControl, {
            value: sliderValue,
            renderValue: e => Number(e.toFixed(props.decimals ?? 0)) + props.suffix,
            minValue: props.minValue,
            maxValue: props.maxValue,
            onChange: handlSliderChange,
          })
        })
      ]
    })
  }

  function InPopoutSettings() {
    const [settings, setSettings] = useSettings();
    const button = useRef();
    const handleClick = useCallback(e => {
      const MyContextMenu = ContextMenu.buildMenu([
        {
          label: "Enable Drop Area",
          type: 'toggle',
          checked: settings.enableDrop,
          action: () => setSettings(prev => {
            prev.enableDrop = !prev.enableDrop;
            return prev;
          })
        }, {
          type: 'group',
          items: [
            {
              label: "Enable Transition",
              type: 'toggle',
              checked: settings.transition.enabled,
              action: () => setSettings(prev => {
                prev.transition.enabled = !prev.transition.enabled;
                return prev;
              })
            }, {
              label: "Transition Duration",
              type: "custom",
              render: () => jsx(MenuInput, {
                disabled: !settings.transition.enabled,
                label: "Transition Duration",
                value: settings.transition.duration,
                type: 'number',
                maxValue: 2000,
                minValue: 0,
                onChange: newVal => {
                  setSettings(prev => {
                    prev.transition.duration = Number(newVal);
                    return prev;
                  });
                  generateCSS();
                },
                suffix: " ms"
              }),
            }]
        }, {
          type: 'group',
          items: [
            {
              label: "Enable Slideshow",
              type: 'toggle',
              checked: settings.slideshow.enabled,
              action: () => setSettings(prev => {
                prev.slideshow.enabled = !prev.slideshow.enabled;
                prev.slideshow.enabled ? slideShowManager.restart() : slideShowManager.stop();
                return prev;
              })
            }, {
              label: "Slideshow Interval",
              type: "custom",
              render: () => jsx(MenuInput, {
                disabled: !settings.slideshow.enabled,
                label: "Slideshow Interval",
                value: settings.slideshow.interval / 6e4,
                type: 'number',
                decimals: 1,
                maxValue: 120,
                minValue: 0.5,
                onChange: newVal => {
                  let oldValue;
                  setSettings(prev => {
                    oldValue = prev.slideshow.interval;
                    prev.slideshow.interval = Number(newVal) * 6e4;
                    return prev;
                  });
                  if (oldValue !== newVal * 6e4) slideShowManager.restart();
                },
                suffix: " min"
              }),
            }, {
              label: "Shuffle Slideshow",
              type: 'toggle',
              checked: settings.slideshow.shuffle,
              action: () => setSettings(prev => {
                prev.slideshow.shuffle = !prev.slideshow.shuffle;
                return prev;
              })
            }
          ]
        }, {
          type: 'group',
          items: [
            {
              label: "Auto detect CSS Variable",
              type: 'toggle',
              checked: settings.cssVariableDetection.enabled,
              action: () => {
                setSettings(prev => {
                  prev.cssVariableDetection.enabled = !prev.cssVariableDetection.enabled;
                  return prev;
                })
                setImageFromIDB();
              }
            }, {
              label: "Default CSS Variable",
              type: "custom",
              render: () => jsx(MenuInput, {
                disabled: settings.cssVariableDetection.enabled,
                label: "Default CSS Variable",
                value: settings.cssVariableDetection.defaultVariable,
                validation: value => value.startsWith('--') && value.length > 2,
                type: 'text',
                onChange: newVal => {
                  let oldValue;
                  setSettings(prev => {
                    oldValue = prev.cssVariableDetection.defaultVariable;
                    prev.cssVariableDetection.defaultVariable = newVal;
                    return prev;
                  });
                  if (oldValue !== newVal) setImageFromIDB();
                }
              })
            }
          ]
        }, {
          type: 'separator',
        }, {
          label: "Add Context Menus",
          type: 'toggle',
          checked: settings.addContextMenu,
          action: () => setSettings(prev => {
            prev.addContextMenu = !prev.addContextMenu;
            prev.addContextMenu ? contextMenuPatcher.patch() : contextMenuPatcher.unpatch();
            return prev;
          })
        }
      ]);
      ContextMenu.open(e, MyContextMenu);
    }, [open]);

    useEffect(() => {
      const s = UI.createTooltip(button.current, 'Open Settings', { side: 'top' })
      s.element.style.cssText = 'animation: grow-y .15s cubic-bezier(0.2, 0.6, 0.5, 1.1); transform-origin: 50% 100%; z-index: 9999;';
    }, []);

    return jsx('button', {
      ref: button,
      onClick: handleClick,
      className: 'BackgroundLibrary-SettingsButton',
      children: jsx('svg', {
        x: '0', y: '0',
        focusable: 'false',
        'aria-hidden': 'true',
        role: 'img',
        xmlns: "http://www.w3.org/2000/svg",
        width: "24",
        height: "24",
        fill: "none",
        viewBox: "0 0 24 24",
        children: jsx('path', {
          fill: "currentColor",
          d: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6'
        })
      })
    })
  }

  // Patching functions
  function patchToolbar(HeaderBar) {
    Patcher.before(meta.slug, ...HeaderBar, (_, args) => {
      // Check if toolbar children exists and if its an Array. Also, check if our component is already there.
      if (Array.isArray(args[0]?.toolbar?.props?.children) && !args[0].toolbar.props.children.some?.(e => e?.key === meta.slug)) {
        // Render the component behind the search bar.
        args[0].toolbar.props.children.splice(-2, 0, jsx(PopoutComponent, { key: meta.slug }));
      }
    })
  }

  /** Manager to patch and unpatch the context menu. Adds an option to add images to the library */
  const contextMenuPatcher = function () {
    let cleanupImage, cleanupMessage;
    function patch() {
      if (!cleanupImage) {
        // image modal
        cleanupImage = ContextMenu.patch('image-context', (menu, context) => {
          if (context.target.tagName === 'IMG') {
            menu.props.children.splice(menu.props.children.length, 0, BuildMenuItem(context.src));
          }
        });
      }
      if (!cleanupMessage) {
        cleanupMessage = ContextMenu.patch('message', (menu, context) => {
          let embed;
          // uploaded image
          if (context.mediaItem?.contentType?.startsWith('image')) {
            menu.props.children.splice(-1, 0, BuildMenuItem(context.mediaItem.url))
            // linked image
          } else if (context.target.classList.contains(constants.originalLink.originalLink) &&
            context.target.dataset.role === 'img' &&
            (embed = context.message.embeds?.find(e => e.image?.url === context.target.href))) {
            menu.props.children.splice(-1, 0, BuildMenuItem(embed.image.proxyURL))
          }
        })
      }
    }
    function unpatch() {
      if (cleanupImage) {
        cleanupImage();
        cleanupImage = null;
      }
      if (cleanupMessage) {
        cleanupMessage();
        cleanupMessage = null;
      }
    }
    return { patch, unpatch }
  }();

  function BuildMenuItem(src) {
    return jsx(ContextMenu.Group, null, jsx(ContextMenu.Item, {
      id: 'add-library',
      label: 'Add to Background Library',
      action: async () => {
        let mediaURL = function (src) {
          let safeURL = function (url) { try { return new URL(url) } catch (e) { return null } }(src);
          return null == safeURL || safeURL.host === "cdn.discordapp.com" ? src : safeURL.origin === "https://media.discordapp.net" ? (safeURL.host = "cdn.discordapp.com",
            safeURL.searchParams.delete("size"),
            safeURL.searchParams.delete("width"),
            safeURL.searchParams.delete("height"),
            safeURL.searchParams.delete("quality"),
            safeURL.searchParams.delete("format"),
            safeURL.toString()) : (safeURL.searchParams.delete("width"),
              safeURL.searchParams.delete("height"),
              safeURL.toString())
        }(src);
        fetch(new Request(mediaURL, {
          method: "GET",
          mode: "cors"
        })).then(response =>
          response.ok ? response : Promise.reject(response.status)
        ).then(response =>
          response.blob()
        ).then(blob => {
          setImageFromIDB(storedImages => {
            storedImages.push({ image: blob, selected: false, src: null, id: storedImages.length + 1 });
            BdApi.showToast("Successfully added to BackgroundLibrary", { type: 'success' });
          })
        }).catch(err => {
          console.error('Status ', err)
          BdApi.showToast("Failed to add to BackgroundLibrary. Status " + err, { type: 'error' });
        });
      }, icon: s => jsx('svg', {
        className: s.className,
        'aria-hidden': 'true',
        role: 'img',
        xmlns: "http://www.w3.org/2000/svg",
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        children: jsx('path', {
          fill: "currentColor",
          d: "M19 10v7h-12v-12h7v-2h-7c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-7zM10.5 12.67l1.69 2.26 2.48-3.1 3.33 4.17h-10zM1 7v14c0 1.1.9 2 2 2h14v-2h-14v-14zM21 3v-3h-2v3h-3c.01.01 0 2 0 2h3v2.99c.01.01 2 0 2 0v-2.99h3v-2z"
        })
      })

    }))
  }

  /** Patches the button to the HeaderBar */
  function addButton() {
    if (constants.settings.addContextMenu) {
      contextMenuPatcher.patch();
    }
    // Get headerbar
    const filter = module => module?.Icon && module.Title,
      modules = Webpack.getModule(m => Object.values(m).some(filter), { first: false });
    for (const module of modules) {
      const HeaderBar = [module, Object.keys(module).find(key => filter(module[key]))];
      patchToolbar(HeaderBar);
    }
  }

  /** Cleanup when plugin is disabled */
  function stop() {
    let db;
    // On unmount, check if there are any selected images inside the database, and if so, revoke the URL and remove URL from the database.
    openDB('images').then(database => {
      db = database;
      return getAllItems(db, 'images');
    }).then(storedItems => {
      storedItems.forEach(e => {
        if (e.selected) URL.revokeObjectURL(e.src);
        e.src = null;
      });
      saveItems(db, 'images', storedItems, storedItems);
    }).catch(err => {
      console.error('Error opening database:', err);
    }).finally(() => {
      db?.close();
    });
    // Terminate any slideshows
    slideShowManager.stop();
    // remove the icon
    document.getElementById(meta.slug)?.remove();
    // unpatch contextmenu
    contextMenuPatcher.unpatch();
    // unpatch the toolbar
    Patcher.unpatchAll(meta.slug);
    // remove styles and background image
    DOM.removeStyle(meta.slug + '-style');
    DOM.removeStyle('BackgroundLibrary-background');
    // destroy mutation observer
    themeObserver?.disconnect();
  }

  // utility
  /** Generates the main CSS for the plugin */
  function generateCSS() {
    DOM.removeStyle(meta.slug + '-style');
    DOM.addStyle(meta.slug + '-style',
      `
::view-transition-group(root) {
  animation-duration: ${constants.settings.transition.duration}ms;
}
@keyframes grow-y {
  from { transform: scaleY(0.9); opacity: 0; }
  to { transform: none; opacity: 1 }
}
@keyframes loading-animation {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg);  }
}
@keyframes fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.BackgroundLibrary-SettingsTextInput {
  flex-direction: row;
  align-items: center;
  margin-bottom: 20px;
}
.BackgroundLibrary-SettingsTextInput input {
  width: fit-content;
  flex: 0 1 150px;
  text-align: right;
}
.BackgroundLibrary-inputWrapper {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0.5rem 0.75rem 0.5rem 0.25rem;
  gap: 0.5rem;
}
.BackgroundLibrary-DropAndPasteArea {
  position: relative;
  border: 2px solid var(--blue-400, currentColor);
  border-radius: .5rem;
  outline: 2px dashed var(--blue-400, currentColor);
  outline-offset: -8px;
  grid-row: span 3;
  cursor: copy;
  caret-color: transparent;
  box-shadow: inset 0px 0px 16px 2px transparent;
  background: url( "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23333' d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'/%3E%3C/svg%3E" ) center / contain no-repeat rgba(0, 0, 0, 0.5);
  transition: box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundLibrary-DropAndPasteArea:is(:focus, .dragging, :focus-visible)::after {
  opacity: 1;
}
.BackgroundLibrary-DropAndPasteArea:is(:focus, .dragging, :focus-visible) {
  box-shadow: inset 0px 0px 16px 2px currentColor;
}
.BackgroundLibrary-DropAndPasteArea::after {
  content: 'Drop or Paste Image Here';
  position: absolute;
  display: grid;
  place-items: center;
  inset: 0;
  opacity: 0;
  cursor: inherit;
  font-size: 1.5rem;
  font-weight: 600;
  transition: opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundLibrary-UploadButton {
  color: var(--green-430);
}
.BackgroundLibrary-UploadButton:is(:hover, :focus-visible) {
  color: var(--green-500);
}
.BackgroundLibrary-UploadButton:is(:hover, :focus-visible) {
  color: var(--green-530);
}
.BackgroundLibrary-SettingsButton {
  color: var(--brand-500);
}
.BackgroundLibrary-SettingsButton:is(:hover, :focus-visible) {
  color: var(--brand-560);
}
.BackgroundLibrary-SettingsButton:active {
  color: var(--brand-600);
}
.BackgroundLibrary-RemoveBgButton {
  color: var(--red-430);
}
.BackgroundLibrary-RemoveBgButton:is(:hover, :focus-visible) {
  color: var(--red-500);
}
.BackgroundLibrary-RemoveBgButton:active {
  color: var(--red-530);
}
.BackgroundLibrary-UploadButton,
.BackgroundLibrary-SettingsButton,
.BackgroundLibrary-RemoveBgButton {
  display: grid;
  place-items: center;
  padding: 0.25rem;
  background-color: #0000;
  aspect-ratio: 1;
  border-radius: 0.25rem;
  transition: color 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundLibrary-imageWrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-radius: .25rem;
  background-color: #0000;
  flex: 0 0 calc(50% - 0.25rem);
  aspect-ratio: 16 / 9;
  isolation: isolate;
  outline: 2px solid transparent;
  padding: 0;
  overflow: hidden;
  box-shadow: 0px 3px 3px -2px rgba(80, 80, 80, 0.2), 0px 3px 4px 0px rgba(80, 80, 80, 0.14), 0px 1px 8px 0px rgba(80, 80, 80, 0.12);
  transition: outline-color 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundLibrary-imageWrapper.selected {
  outline-color: var(--blue-400,currentColor);
}
.BackgroundLibrary-image {
  font-style: italic;
  font-size: .75rem;
  background-repeat: no-repeat;
  background-size: cover;
  height: auto;
  display: block;
  object-fit: cover;
  min-height: 100%;
  min-width: 100%;
  animation: fade-in 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundLibrary-imageWrapper:is(:hover, :focus-visible) > .BackgroundLibrary-deleteButton {
  opacity: 1;
}
.BackgroundLibrary-imageData {
  position: absolute;
  z-index: 1;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0.25rem 0.25rem 0;
  font-size: .7rem;
  text-align: start;
  overflow: hidden;
  background: linear-gradient(#0000, rgba(25, 25, 25, 0.8) .175rem) no-repeat;
}
.BackgroundLibrary-deleteButton {
  display: flex;
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 1;
  border-radius: 4px;
  border: 0;
  padding: 1px;
  background-color: #c62828;
  opacity: 0;
  color: #fff;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundLibrary-deleteButton:is(:hover, :focus-visible) {
  background-color: #d15353; 
}
.BackgroundLibrary-gridWrapper {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  overflow: auto;
  padding: 0.5rem 0.25rem;
  margin-bottom: 0.5rem;
  justify-content: center;
  align-content: start;
  scrollbar-gutter: stable;
  mask-image: linear-gradient(#0000, #000 0.5rem, #000 calc(100% - 0.5rem), #0000 100%), linear-gradient(to left, #000 0.75rem, #0000 0.75rem);
}
.BackgroundLibrary-skeleton {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding-bottom: 1rem;
}
.BackgroundLibrary-loader {
  aspect-ratio: 1;
  height: 22.5%;
  display: inline-block;
  color: var(--blue-400, currentColor);
  animation: 1.4s linear 0s infinite normal none running loading-animation;
}
.BackgroundLibrary-loader circle {
  stroke: currentColor;
  stroke-dasharray: 80px, 200px;
  stroke-dashoffset: 0;
}

`);
  }

  /**
   * Adds a suffix to a number
   * @param {number} num The number to append a suffix to
   * @returns {string}
   */
  function formatNumber(num) {
    const units = [
      { value: 1e12, symbol: " T" },
      { value: 1e9, symbol: " G" },
      { value: 1e6, symbol: " M" },
      { value: 1e3, symbol: " k" },
    ];
    for (const unit of units) {
      if (num >= unit.value) {
        return (num / unit.value).toFixed(1).replace(/\.0$/, '') + unit.symbol;
      }
    }
    return num.toString();
  }

  /**
   * A more compatible verstion for startViewTransitions
   * @param {() => void | Promise<void>} domChange A callback to change the DOM. Animates between the old and the new view.
   * @returns {ViewTransition | undefined}
   */
  function viewTransition(domChange) {
    if (!document.startViewTransition || !constants.settings?.transition?.enabled) {
      domChange();
      return;
    }
    return document.startViewTransition(domChange);
  }

  /**
   * Sets the background image, and, if enabled, detects the CSS variable for the background image
   * @param {ImageItem} imageItem 
   */
  function updateImage(imageItem) {
    let property;
    if (constants.settings.cssVariableDetection.enabled) {
      const cssVariables = getCSSVariables((_, value) => value.startsWith('url'));
      if (!cssVariables) {
        DOM.removeStyle('BackgroundLibrary-background');
        return;
      }
      if (Object.keys(cssVariables).length === 1) {
        property = Object.keys(cssVariables)[0];
      } else {
        for (const key of Object.keys(cssVariables)) { // prioritize background, bg, backdrop, image, img
          if (key.toLowerCase().includes('background') || key.toLowerCase().includes('bg') || key.toLowerCase().includes('backdrop')) {
            property = key;
            break;
          }
        }
        if (!property) {
          for (const key of Object.keys(cssVariables)) { // if no variable is found, look for images.
            if (key.toLowerCase().includes('image') || key.toLowerCase().includes('img')) {
              property = key;
              break;
            }
          }
        }
      }
    } else {
      property = constants.settings.cssVariableDetection.defaultVariable;
    }
    viewTransition(() => {
      DOM.removeStyle('BackgroundLibrary-background');
      property && DOM.addStyle('BackgroundLibrary-background', `:root, :root *{${property}: url('${imageItem.src}') !important;`);
    });
  }

  /**
   * Accessing the database and either sets the selected image as a background, or calls the callback with all items.
   * @param {undefined | (storedItems: ImageItem[]) => void} callback Callback when the items have been loaded from the database
   */
  function setImageFromIDB(callback) {
    let db;
    openDB('images')
      .then(database => {
        db = database;
        return getAllItems(db, 'images');
      })
      .then(storedItems => {
        if (callback) {
          callback(storedItems);
        } else {
          storedItems.forEach(e => {
            e.src = e.selected ? URL.createObjectURL(e.image) : null;
            if (e.selected) {
              updateImage(e);
            }
          });
        }
        saveItems(db, 'images', storedItems, storedItems);
      })
      .catch(err => {
        console.error('Error opening database:', err);
      }).finally(() => {
        db?.close();
      });
  }

  class ErrorBoundary extends React.Component {
    state = { hasError: false }

    static getDerivedStateFromError(error) {
      return { hasError: true };
    }

    ComponentDidCatch(error, info) {
      console.error(error, info);
    }

    render() {
      if (this.state.hasError) {
        return this.props.fallback;
      }
      return this.props.children;
    }

  }

  /**
   * @param {(customProperty: string, value: string) => void} filter 
   * @returns { {[key:string]: string} }
   */
  function getCSSVariables(filter) {
    const styleElement = document.querySelector('bd-head  bd-themes style:last-child');
    if (!styleElement) return;
    const sheet = [...document.styleSheets].find(sheet => sheet.ownerNode === styleElement);
    if (!sheet) return;
    const cssVariables = {};

    // Iterate through the CSS rules in the stylesheet
    for (const rule of sheet.cssRules) {
      if (!rule || rule instanceof CSSImportRule) continue;
      for (const customProperty of rule.style) {
        if (customProperty.startsWith('--')) {
          const value = rule.style.getPropertyValue(customProperty).trim();
          if (filter(customProperty, value))
            cssVariables[customProperty] = value;
        }
      }

    }
    return cssVariables;
  }

  /**
   * Returns the first element that is a ancestor of node that matches selectors.
   * @param {HTMLElement} node The HTMLelement to start the search from.
   * @template {keyof HTMLElementTagNameMap} K
   * @param {K} query A string containing one or more CSS selectors to match against.
   * @returns {HTMLElementTagNameMap[K] | null} The first parent node that matches the specified group of selectors, or null if no matches are found.
   */
  function reverseQuerySelector(node, query) {
    while (node !== null && node !== document) {
      if (node.matches(query)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  // Inits and Event Listeners
  /**
   * Observe for changes to an HTMLelement
   * @param {HTMLElement} obj The object to observe
   * @param {() => void} callback Callback fired when the node changes
   * @returns {MutationObserver | undefined}
   */
  function nodeObserver(obj, callback) {
    if (!obj) return;
    var mutationObserver = new MutationObserver(callback)
    mutationObserver.observe(obj, { childList: true, subtree: true })
    return mutationObserver
  }
  let themeObserver;

  /**
   * Manager to start and stop the slideshow. Internally handles the interval
   */
  const slideShowManager = function () {
    let interval;

    function start() {
      if (interval != null) return; // Slideshow is already running
      interval = setInterval(() => {
        console.log('Slideshow interval', constants.settings.slideshow.interval)
        setImageFromIDB(storedImages => {
          const currentIndex = storedImages.reduce((p, c, i) => c.selected ? i : p, null);
          if (constants.settings.slideshow.shuffle && storedImages.length > 2) { // Shuffle only for 3 or more images
            let x, it = 0;
            do x = Math.floor(Math.random() * storedImages.length)
            while (x === currentIndex && it++ < 25)
            storedImages.forEach(e => {
              e.src && URL.revokeObjectURL(e.src);
              e.src = null;
              e.selected = false;
              if (e.id - 1 === x) {
                e.selected = true;
                e.src = URL.createObjectURL(e.image);
                updateImage(e);
                console.log('Background Image updated on:', new Date())
              }
            })
          } else {
            storedImages.forEach((e, i) => {
              e.src && URL.revokeObjectURL(e.src);
              e.src = null;
              e.selected = false;
              if (i === ((currentIndex + 1) || Math.floor(Math.random() * storedImages.length)) % storedImages.length) {
                e.selected = true;
                e.src = URL.createObjectURL(e.image);
                updateImage(e);
                console.log('Background Image updated on:', new Date())
              }
            })
          }
        })
      }, Math.max(constants.settings.slideshow.interval ?? 3e5, 3e4));
    }
    function stop() {
      if (interval != null) {
        clearInterval(interval);
        interval = null;
      }
    }
    function restart() {
      stop();
      start();
    }

    return {
      start,
      restart,
      stop
    }
  }();

  return {
    start: () => {
      try {
        const configs = Data.load(meta.slug, "settings");
        Object.assign(constants, {
          toolbarClasses: Webpack.getModule(Filters.byKeys("title", "toolbar")), // classes for toolbar
          messagesPopoutClasses: Webpack.getModule(Filters.byKeys("messagesPopout")), // classes for messages popout
          textStyles: Webpack.getModule(Filters.byKeys("defaultColor")), // calsses for general text styles
          markupStyles: Webpack.getModule(Filters.byKeys("markup")),
          disabled: Webpack.getModule(Filters.byKeys("disabled", "labelRow")), // classes for disabled inputs
          layerContainerClass: Webpack.getModule(Filters.byKeys('layerContainer')), // class of Discord's nativelayer container
          originalLink: Webpack.getModule(Filters.byKeys('originalLink')), // class for image embed
          scrollbar: Webpack.getModule(Filters.byKeys("thin")), // classes for scrollable content
          separator: Webpack.getModule(Filters.byKeys('scroller', 'separator')), // classes for separator
          popoutRoot: Webpack.getModule(Filters.byKeys("Popout")),  // popout module
          nativeUI: Webpack.getModule(Filters.byKeys('FormSwitch', 'FormItem')), // native ui module
          // DiscordNative: Webpack.getByKeys('copyImage') // copyImage, saveImage
          settings: {
            ...defaultSettings,
            ...configs,
            transition: { ...defaultSettings.transition, ...configs?.transition },
            slideshow: { ...defaultSettings.slideshow, ...configs?.slideshow },
            cssVariableDetection: { ...defaultSettings.cssVariableDetection, ...configs?.cssVariableDetection },
          }
        });
        // On startup, check if there are any selected images inside the database, and if so, set it as background.
        setImageFromIDB();
        themeObserver = nodeObserver(document.querySelector('bd-head  bd-themes'), () => setImageFromIDB());
        // Start Slideshow if enabled
        constants.settings.slideshow.enabled && slideShowManager.restart();
        addButton();
        generateCSS();
      } catch (e) {
        console.error(e);
        stop();
      }
    },
    stop: stop,
    getSettingsPanel: () => jsx(BuildSettings)
  }
};
