/**
 * @name BackgroundManager
 * @author Narukami
 * @description Enhances themes supporting background images with features (local folder, slideshow, transitions).
 * @version 1.2.14
 * @source https://github.com/Naru-kami/BackgroundManager-plugin
 */

const { React, Webpack, UI, Webpack: { Filters }, Patcher, DOM, ContextMenu, Data } = BdApi;

/** @type {typeof import("react")} */
const { useState, useEffect, useRef, useCallback, useId, useMemo, createElement: jsx, Fragment } = React;

const DATA_BASE_NAME = 'BackgroundManager';

module.exports = meta => {
  'use strict';
  const defaultSettings = {
    enableDrop: false,
    transition: { enabled: true, duration: 1000 },
    slideshow: { enabled: false, interval: 300000, shuffle: true },
    overwriteCSS: true,
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

  /** @type { {settings: typeof defaultSettings, [key: string]: unknown} } */
  const constants = {};
  /**
   * @typedef {Object} ImageItem
   * @property {Blob} image - The image blob.
   * @property {boolean} selected - The selected Image for the background.
   * @property {string} src - The objectURL for the image
   * @property {number} id - The ID of the image.
   * @property {width} width - The width of the image.
   * @property {height} height - The height of the image.
  */

  // Hooks
  /** @returns {[typeof defaultSettings, React.Dispatch<typeof defaultSettings>]} */
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
      const request = indexedDB.open(DATA_BASE_NAME);

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
   * Utility function to save items to the store.
   * @param {IDBDatabase} db - The database instance.
   * @param {string} storeName - The name of the object store.
   * @param {ImageItem[]} newItems - The items to save.
   * @param {ImageItem[]} prevItems - The previous state of items.
   * @returns {Promise<void>}
   */
  function saveItems(db, storeName, newItems, prevItems) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const newIds = new Set(newItems.map(item => item.id));
      const prevIds = new Set(prevItems.map(item => item.id));

      // Add/update items
      newItems.forEach(e => {
        if (!prevIds.has(e.id)) {
          store.add(e);
        } else {
          store.put(e);
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
    const accessDB = useCallback(/** @param {(storedItems: ImageItem[], database: IDBDatabase) => void} cb */ cb => {
      /** @type {IDBDatabase | undefined} db */
      let db;
      openDB(storeName).then(database => {
        db = database;
        return getAllItems(db, storeName);
      }).then(storedItems =>
        cb(storedItems, db)
      ).catch(err => {
        console.error('Error opening database: ', err);
      }).finally(() => {
        db?.close();
      });
    }, []);

    useEffect(() => {
      accessDB(storedItems => {
        setItems(storedItems.map(e => {
          if (!e.src) e.src = URL.createObjectURL(e.image);
          return e;
        }))
      })
      return () => {
        accessDB((storedItems, db) => {
          const clearedItems = storedItems.map(e => {
            if (!e.selected) {
              URL.revokeObjectURL(e.src);
              e.src = null;
            }
            return e;
          });
          saveItems(db, storeName, clearedItems, storedItems);
        })
      }
    }, []);
    useEffect(() => {
      countEffect.current++;
      if (countEffect.current > 1) {
        accessDB((storedItems, db) => {
          saveItems(db, storeName, items, storedItems);
        })
      }
    }, [items]);

    return [items, setItems];
  };

  // Similar to useState, but also returns a ref with the current state. Useful when you need the most recent state when unmounting.
  function useStateWithRef(initial) {
    const [state, setState] = useState(initial);
    const ref = useRef(state);
    const setStateAndRef = useCallback((newState) => {
      ref.current = newState instanceof Function ? newState(ref.current) : newState;
      setState(newState);
    }, [setState]);

    return [state, setStateAndRef, ref];
  }

  // Components
  function IconComponent({ onClick, ...props }) {
    const handleKeyDown = useCallback(e => {
      props.onKeyDown?.(e);
      if (e.key === 'Enter' || e.key === ' ') onClick();
    }, [onClick, props.onKeyDown]);
    return jsx(IconButton, {
      TooltipProps: { text: 'Background Manager', position: 'bottom', shouldShow: props.showTooltip },
      ButtonProps: {
        ...props,
        component: 'div',
        tabIndex: '0',
        onKeyDown: handleKeyDown,
        onClick: onClick,
        className: [constants.toolbarClasses?.iconWrapper, !props.showTooltip ? constants.toolbarClasses?.selected : undefined, constants.toolbarClasses?.clickable].join(' '),
      },
      SvgProps: {
        path: "M20 4v12H8V4zm0-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-8.5 9.67 1.69 2.26 2.48-3.1L19 15H9zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6z",
        className: constants.toolbarClasses?.icon,
      }
    })
  }

  function ManagerComponent({ onRequestClose }) {
    const mainComponent = useRef(null);
    useEffect(() => {
      let mouseDownOnPopout = false;
      const layerContainer = reverseQuerySelector(mainComponent.current, '.' + constants.layerContainerClass?.layerContainer);
      if (!layerContainer) return;

      const ctrl = new AbortController();
      constants.settings.enableDrop && layerContainer.style.setProperty('z-index', '2002');
      addEventListener('mousedown', e => {
        mouseDownOnPopout = layerContainer.contains(e.target)
      }, ctrl);
      addEventListener('mouseup', e => {
        !mouseDownOnPopout && !layerContainer.contains(e.target) && !e.target.closest('#' + meta.slug) && onRequestClose()
      }, ctrl);
      addEventListener('keydown', e => {
        e.key === 'Escape' && layerContainer.childElementCount === 1 && (onRequestClose(), e.stopPropagation())
      }, { capture: true, signal: ctrl.signal });

      return () => {
        layerContainer.style.removeProperty('z-index');
        ctrl.abort();
      }
    }, []);
    !constants.settings.enableDrop && constants.nativeUI.useFocusLock?.(mainComponent);

    return jsx('div', {
      ref: mainComponent,
      role: "dialog",
      tabIndex: "-1",
      "aria-modal": "true",
      style: { maxHeight: "85vh" },
      className: constants.messagesPopoutClasses?.messagesPopoutWrap,
    }, jsx(ManagerHead),
      jsx(ManagerBody)
    )
  }

  function ManagerHead() {
    return jsx('div', {
      className: constants.messagesPopoutClasses?.header
    }, jsx('h1', {
      className: [constants.textStyles?.defaultColor, constants.textStyles?.['heading-md/medium']].join(' '),
    }, "Background Manager"));
  }

  function ManagerBody() {
    const [images, setImages] = useIDB();
    const contextMenuObj = useMemo(() => {
      const saveAndCopy = givenItem => [givenItem.image.type !== 'image/gif' && {
        label: "Copy Image",
        action: async () => {
          try {
            if (givenItem.image.type === 'image/png' || givenItem.image.type === 'image/jpeg') {
              const arrayBuffer = await givenItem.image.arrayBuffer()
              DiscordNative.clipboard.copyImage(new Uint8Array(arrayBuffer), givenItem.src)
            } else {
              const imageBitmap = await createImageBitmap(givenItem.image);
              const Canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
              const ctx = Canvas.getContext('2d');
              ctx.drawImage(imageBitmap, 0, 0);
              const pngBlob = await Canvas.convertToBlob({ type: 'image/png' });
              const arrayBuffer = await pngBlob.arrayBuffer()
              DiscordNative.clipboard.copyImage(new Uint8Array(arrayBuffer), givenItem.src)
            }
            UI.showToast("Image copied to clipboard!", { type: 'success' });
          } catch (err) {
            UI.showToast("Failed to copy Image. " + err, { type: 'error' });
          }
        }
      }, {
        label: "Save Image",
        action: async () => {
          try {
            const arrayBuffer = new Uint8Array(await givenItem.image.arrayBuffer());
            let url = givenItem.image.name
            if (!url) {
              url = (new URL(givenItem.src)).pathname.split('/').pop() || 'unknown';
              const FileExtension = {
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
              loop: for (const [ext, signs] of Object.entries(FileExtension)) {
                for (const sign of signs) {
                  if (sign.every((e, i) => e === null || e === arrayBuffer[i])) {
                    url += '.' + ext;
                    break loop;
                  }
                }
              }
            }
            DiscordNative.fileManager.saveWithDialog(arrayBuffer, url).then(() => {
              UI.showToast("Saved Image!", { type: 'success' });
            });
          } catch (err) {
            UI.showToast("Failed to save Image. " + err, { type: 'error' });
          }
        }
      }].filter(Boolean);
      return {
        saveAndCopy,
        lazyCarousel: constants.lazyCarousel ? (givenItem) => {
          try {
            constants.lazyCarousel({
              items: images.map(img => ({
                url: img.src, original: "",
                zoomThumbnailPlaceholder: img.src,
                contentType: img.image.type,
                srcIsAnimated: img.image.type === 'image/gif',
                type: 'IMAGE',
                width: img.width, height: img.height,
                sourceMetadata: {
                  identifier: {
                    filename: img.image.name,
                    size: img.image.size,
                    type: "attachment"
                  }
                },
              })),
              location: "Media Mosaic",
              startingIndex: givenItem.id - 1,
              onContextMenu: e => {
                const src = e.target.closest(`img`)?.src;
                if (!src) return;
                ContextMenu.open(e, ContextMenu.buildMenu(saveAndCopy(images.find(e => e.src === src))))
              },
            })
          } catch (err) { console.error(err) }
        } : null
      }
    }, [images]);
    const handleSelect = useCallback(index => {
      setImages(prev => {
        prev.forEach(e => {
          e.selected = e.id === index;
        });
        return [...prev];
      });
    }, [setImages]);
    const onNextShuffle = useCallback(() => {
      const currentIndex = images.reduce((p, c, i) => c.selected ? i : p, null);
      let x, it = 0;
      do x = constants.settings.slideshow.shuffle || currentIndex === null ? Math.floor(Math.random() * images.length) : (currentIndex + 1) % images.length
      while (x === currentIndex && it++ < 25)
      const item = images[x];
      handleSelect(item.id);
      constants.settings.slideshow.enabled ? slideShowManager.start() : slideShowManager.stop();
      viewTransition.setImage(item.src);
    }, [images, handleSelect]);

    return jsx('div', {
      className: [constants.messagesPopoutClasses?.messageGroupWrapper, constants.markupStyles?.markup, constants.messagesPopoutClasses?.messagesPopout].join(' '),
      style: { display: "grid", gridTemplateRows: 'auto auto 1fr', overflow: 'hidden', border: '0' },
      children: [
        jsx(InputComponent, { setImages }),
        jsx('div', {
          role: 'separator',
          className: constants.separator?.separator,
          style: { marginRight: '0.75rem' }
        }),
        images.length ? jsx('div', {
          style: { paddingInline: '0.25rem 0.75rem', display: 'flex', justifyContent: 'space-between' },
          className: constants.textStyles?.['text-sm/semibold'],
          children: [
            'Total size in memory: ' + formatNumber(images.reduce((p, c) => p + c.image.size, 0)),
            constants.settings.slideshow.enabled && images.length >= 2 ? jsx(IconButton, {
              TooltipProps: { text: 'Next Background Image' },
              ButtonProps: {
                style: { padding: 0, marginRight: 9 },
                onClick: onNextShuffle,
                className: 'BackgroundManager-nextButton ' + constants.textStyles?.defaultColor,
              },
              SvgProps: {
                width: '18', height: '18',
                path: 'M5.7 6.71c-.39.39-.39 1.02 0 1.41L9.58 12 5.7 15.88c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l4.59-4.59c.39-.39.39-1.02 0-1.41L7.12 6.71c-.39-.39-1.03-.39-1.42 0M12.29 6.71c-.39.39-.39 1.02 0 1.41L16.17 12l-3.88 3.88c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l4.59-4.59c.39-.39.39-1.02 0-1.41L13.7 6.7c-.38-.38-1.02-.38-1.41.01'
              }
            }) : null
          ],
        }) : null,
        jsx('div', {
          className: ['BackgroundManager-gridWrapper', constants.scrollbar?.thin].join(' '),
          children: images.map(e => jsx(ImageComponent, {
            key: e.src,
            item: e,
            contextMenuObj,
            setImages,
            onSelect: handleSelect
          }))
        })
      ]
    })
  }

  function ImageComponent({ item, onSelect, contextMenuObj, setImages }) {
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(false);
    const handleImageClick = useCallback(() => {
      onSelect(item.id);
      viewTransition.setImage(item.src);
    }, [onSelect, item.id, item.src]);
    const handleDelete = useCallback(e => {
      e.stopPropagation();
      URL.revokeObjectURL(item.src);
      setImages(prev => prev.filter(e => e.id !== item.id).map((e, i) => { e.id = i + 1; return e; }));
      item.selected && viewTransition.removeImage();
    }, [setImages, item.id, item.selected, item.src]);
    const handleContextMenu = useCallback(e => {
      const ImageContextMenu = ContextMenu.buildMenu([
        contextMenuObj.lazyCarousel ? {
          label: "View Image",
          action: () => contextMenuObj.lazyCarousel(item)
        } : undefined,
        ...contextMenuObj.saveAndCopy(item)
      ].filter(Boolean));
      ContextMenu.open(e, ImageContextMenu)
    }, [item.image, item.src, contextMenuObj]);

    useEffect(() => {
      let first = true;
      const img = new Image();
      img.src = item.src || '';
      img.onload = () => {
        setLoaded(true);
        if (!item.height && !item.width) {
          setImages(prev => {
            const loadedItem = prev.find(e => e.id === item.id);
            loadedItem.width = img.width;
            loadedItem.height = img.height;
            return [...prev];
          });
        }
      };
      img.onerror = () => {
        if (first) {
          URL.revokeObjectURL(item.src);
          item.src = URL.createObjectURL(item.image);
          img.src = item.src;
          first = false;
        }
        else {
          setError(true);
          setLoaded(true);
        }
      };
    }, []);

    return jsx(constants.nativeUI.FocusRing, null,
      jsx('button', {
        className: 'BackgroundManager-imageWrapper' + (item.selected ? ' selected' : ''),
        onClick: handleImageClick,
        onContextMenu: handleContextMenu,
        children: [
          !loaded ? jsx(constants.nativeUI.Spinner) : error ? jsx('div', { className: constants.textStyles?.defaultColor }, 'Could not load image') : jsx('img', {
            tabIndex: '-1',
            src: item.src || '',
            className: 'BackgroundManager-image',
          }), !error ? jsx(Fragment, {
            children: [
              jsx('div', {
                className: 'BackgroundManager-imageData',
                'data-size': formatNumber(item.image.size),
                'data-dimensions': item.width && item.height ? item.width + ' x ' + item.height : null,
                'data-mime': item.image.type?.split('/').pop().toUpperCase() || null,
              })
            ]
          }) : null, jsx(IconButton, {
            TooltipProps: { text: 'Delete Image' },
            ButtonProps: {
              onClick: handleDelete,
              className: 'BackgroundManager-deleteButton',
            },
            SvgProps: {
              width: '16', height: '16',
              path: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            }
          })
        ]
      })
    )
  }

  function InputComponent({ setImages }) {
    const [processing, setProcessing] = useState([]);
    const dropArea = useRef(null);

    const handleFileTransfer = useCallback(blob => {
      const img = new Image();
      img.onload = () => setImages(prev => [...prev, { id: prev.length + 1, image: blob, width: img.width, height: img.height, selected: false, src: img.src }]);
      img.onerror = () => URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
    }, [setImages]);
    const handleUpload = useCallback(() => {
      DiscordNative.fileManager.openFiles({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All images', extensions: ['png', 'jpg', 'jpeg', 'jpe', 'jfif', 'exif', 'bmp', 'dib', 'rle', 'gif', 'avif', 'webp', 'svg', 'ico'] },
          { name: 'PNG', extensions: ['png'] },
          { name: 'JPEG', extensions: ['jpg', 'jpeg', 'jpe', 'jfif', 'exif'] },
          { name: 'BMP', extensions: ['bmp', 'dib', 'rle'] },
          { name: 'GIF', extensions: ['gif'] },
          { name: 'AV1 (AVIF)', extensions: ['avif'] },
          { name: 'WebP', extensions: ['webp'] },
          { name: 'SVG', extensions: ['svg'] },
          { name: 'ICO', extensions: ['ico'] },
        ]
      }).then(files => {
        if (!files.length) return;
        files.forEach(file => {
          if (!file.data || !['png', 'jpg', 'jpeg', 'jpe', 'jfif', 'exif', 'bmp', 'dib', 'rle', 'gif', 'avif', 'webp', 'svg', 'ico'].includes(file.filename?.split('.').pop()?.toLowerCase())) {
            console.warn('Could not upload ' + file.filename + '. Data is empty, or ' + file.filename + ' is not an image.');
            return UI.showToast('Could not upload ' + file.filename + '. Data is empty, or ' + file.filename + ' is not an image.', { type: 'error' });
          }
          handleFileTransfer(new Blob([file.data], { type: getImageType(file.data) }));
        });
      }).catch(e => { console.error(e); UI.showToast('Could not upload image. ' + e, { type: 'error' }) });
    }, [setImages]);
    const handleInput = useCallback(e => {
      e.preventDefault?.();
      e.target.textContent = '';
    }, []);
    const handleDragEnter = useCallback(() => {
      dropArea.current.classList.add('dragging');
    }, [dropArea.current]);
    const handleDragOver = useCallback(e => {
      e.preventDefault?.();
      e.stopPropagation?.();
      e.dataTransfer.dropEffect = 'copy';
    }, []);
    const handleDragEnd = useCallback(() => {
      dropArea.current.classList.remove('dragging');
    }, [dropArea.current]);
    const handleDrop = useCallback(e => {
      const timeStamp = Date.now();
      handleDragEnd();
      if (e.dataTransfer?.files?.length) {
        setProcessing(prev => [...prev, timeStamp]);
        for (const droppedFile of e.dataTransfer.files) {
          handleFileTransfer(droppedFile);
        }
        setProcessing(prev => prev.filter(t => t !== timeStamp));
      } else if (e.dataTransfer?.getData('URL')) {
        setProcessing(prev => [...prev, timeStamp]);
        fetch(e.dataTransfer.getData('URL')).then(async response => {
          return response.ok ? response : Promise.reject(response.status);
        }).then(res =>
          res.headers.get('Content-Type').startsWith('image/') ?
            res.blob() :
            Promise.reject('Dropped item is not an image.')
        ).then(handleFileTransfer).catch(err => {
          UI.showToast('Cannot get image data. ' + err, { type: 'error' });
          console.error('Status: ', err)
        }).finally(() => {
          setProcessing(prev => prev.filter(t => t !== timeStamp));
        });
      }
    }, [handleFileTransfer, handleDragEnd, setProcessing]);
    const handlePaste = useCallback(e => {
      e.preventDefault?.();
      const timeStamp = Date.now();
      setProcessing(prev => [...prev, timeStamp]);
      let items = e.clipboardData.items;
      for (let index in items) {
        let item = items[index];
        if (item.kind === 'file') {
          handleFileTransfer(item.getAsFile());
          break;
        }
      }
      setProcessing(prev => prev.filter(t => t !== timeStamp));
    }, [handleFileTransfer, setProcessing]);
    const handleRemove = useCallback(() => {
      setImages(prev => {
        prev.forEach(e => {
          e.selected = false;
        });
        viewTransition.removeImage();
        return [...prev];
      });
    }, [setImages]);

    useEffect(() => { dropArea.current.focus() }, []);

    return jsx('div', {
      className: 'BackgroundManager-inputWrapper',
      children: [
        jsx(constants.nativeUI.FocusRing, null, jsx('div', {
          className: 'BackgroundManager-DropAndPasteArea',
          contentEditable: 'true',
          ref: dropArea,
          onInput: handleInput,
          onDrop: handleDrop,
          onPaste: handlePaste,
          onDragOver: handleDragOver,
          onDragEnter: handleDragEnter,
          onDragEnd: handleDragEnd,
          onDragLeave: handleDragEnd,
          children: processing.length ? jsx(constants.nativeUI.Spinner) : null
        })),
        jsx(IconButton, {
          TooltipProps: { text: 'Open Images' },
          ButtonProps: {
            className: 'BackgroundManager-UploadButton',
            onClick: handleUpload,
          },
          SvgProps: { path: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2m0 12H4V6h5.17l2 2H20zM9.41 14.42 11 12.84V17h2v-4.16l1.59 1.59L16 13.01 12.01 9 8 13.01z' }
        }),
        jsx(InPopoutSettings, { rerender: setImages }),
        jsx(IconButton, {
          TooltipProps: { text: 'Remove Custom Background' },
          ButtonProps: {
            className: 'BackgroundManager-RemoveBgButton',
            onClick: handleRemove,
          },
          SvgProps: { path: 'M22 8h-8v-2h8v2zM19 10H12V5H5c-1.1 0 -2 0.9 -2 2v12c 0 1.1 0.9 2 2 2h12c1.1 0 2 -0.9 2 -2zM5 19l3 -4l2 3l3 -4l4 5H5z' }
        })
      ]
    })
  }

  function PopoutComponent() {
    const [open, setOpen] = useState(false);
    const targetElementRef = useRef(null);
    const handleClick = useCallback(() => {
      setOpen(op => !op);
    }, [setOpen]);

    return jsx(constants.nativeUI.Popout, {
      shouldShow: open,
      animation: '1',
      position: 'bottom',
      align: 'right',
      autoInvert: false,
      spacing: 8,
      targetElementRef,
      renderPopout: () => jsx(ManagerComponent, { onRequestClose: () => setOpen(false) }),
      children: (e, t) => {
        return jsx(IconComponent, {
          ...e,
          id: meta.slug,
          onClick: handleClick,
          showTooltip: !t.isShown,
          ref: targetElementRef
        })
      }
    })
  }

  function IconButton({ TooltipProps, ButtonProps, SvgProps }) {
    const { component = 'button', ...buttonRestProps } = ButtonProps;
    const { path = '', ...svgRestProps } = SvgProps;
    return jsx(constants.nativeUI.Tooltip, {
      spacing: 8,
      position: 'top',
      color: 'primary',
      hideOnClick: true,
      ...TooltipProps,
      children: ({ onContextMenu, ...restProp }) => jsx(constants.nativeUI.FocusRing, {
        children: jsx(component, {
          ...restProp,
          ...buttonRestProps,
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
              d: path
            }),
            ...svgRestProps,
          })
        })
      })
    })
  }

  // Setting Components
  function BuildSettings() {
    const [setting, setSetting] = useSettings();

    return jsx(Fragment, {
      children: [
        jsx(constants.nativeUI.FormTitle, { children: 'Transitions' }),
        jsx(constants.nativeUI.FormSwitch, {
          hideBorder: true,
          value: setting.transition.enabled,
          onChange: newVal => {
            setSetting(prev => ({ ...prev, transition: { ...prev.transition, enabled: newVal } }));
            viewTransition.bgContainer()?.style.setProperty('--BgManager-transition-duration', (newVal ? setting.transition.duration ?? 0 : 0) + 'ms');
          },
        }, 'Enable Background Transitions'),
        jsx(FormNumberInput, {
          disabled: !setting.transition.enabled,
          min: 1,
          value: setting.transition.duration + '',
          label: 'Transition Duration',
          suffix: 'ms',
          onChange: newVal => {
            setSetting(prev => ({ ...prev, transition: { ...prev.transition, duration: newVal } }));
            viewTransition.bgContainer()?.style.setProperty('--BgManager-transition-duration', (setting.transition.enabled ? newVal ?? 0 : 0) + 'ms');
          },
        }),
        jsx('div', { role: 'separator', className: constants.separator?.separator }),
        jsx(constants.nativeUI.FormTitle, { children: 'Slide Show' }),
        jsx(constants.nativeUI.FormSwitch, {
          hideBorder: true,
          value: setting.slideshow.enabled,
          onChange: newVal => {
            setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, enabled: newVal } }));
            newVal ? slideShowManager.start() : slideShowManager.stop();
          },
        }, 'Enable Slideshow Mode'),
        jsx(FormNumberInput, {
          disabled: !setting.slideshow.enabled,
          min: 0.5,
          value: setting.slideshow.interval / 1000 / 60 + '',
          label: 'Slideshow Interval',
          suffix: 'min',
          onChange: newVal => {
            setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, interval: newVal * 1000 * 60 } }));
            slideShowManager.start();
          },
        }),
        jsx(constants.nativeUI.FormSwitch, {
          disabled: !setting.slideshow.enabled,
          hideBorder: true,
          value: setting.slideshow.shuffle,
          onChange: newVal => setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, shuffle: newVal } })),
        }, 'Enable Shuffle'),
        jsx('div', { role: 'separator', className: constants.separator?.separator, style: { marginBottom: "1rem" } }),
        jsx(constants.nativeUI.FormSwitch, {
          hideBorder: true,
          value: setting.enableDrop,
          note: "When enabled, the popout will move infront of Discord's native drop area. It will also disable the popout's focus trap to enable dragging.",
          onChange: newVal => setSetting(prev => ({ ...prev, enableDrop: newVal })),
        }, 'Enable Drop Area'),
        jsx(constants.nativeUI.FormSwitch, {
          hideBorder: true,
          value: setting.overwriteCSS,
          note: 'Auto detects and overwrites the custom property of the themes\' background image. If no custom Propery is found, the original Wallpaper will not be overwritten.',
          onChange: newVal => {
            setSetting(prev => ({ ...prev, overwriteCSS: newVal }));
            newVal ? (themeObserver.start(), viewTransition.setProperty()) : themeObserver.stop();
          },
        }, "Overwrite theme's CSS variable"),
        jsx(constants.nativeUI.FormSwitch, {
          hideBorder: true,
          value: setting.addContextMenu,
          onChange: newVal => {
            setSetting(prev => ({ ...prev, addContextMenu: newVal }));
            newVal ? contextMenuPatcher.patch() : contextMenuPatcher.unpatch();
          },
        }, 'Add context menu option on images'),
        jsx('div', { role: 'separator', className: constants.separator?.separator, style: { marginBottom: "1rem" } }),
        jsx(constants.nativeUI.Button, {
          style: { marginLeft: "auto" },
          color: constants.nativeUI.Button.Colors.RED,
          onClick: () => {
            UI.showConfirmationModal(
              "Delete Database",
              "This will delete the entire indexedDB database, including every Image saved on it.\n\nAre you sure you want to delete all your saved images?",
              {
                danger: true,
                confirmText: "Yes, Delete",
                onConfirm: () => {
                  viewTransition.removeImage();
                  slideShowManager.stop();
                  setSetting(prev => ({ ...prev, slideshow: { ...prev.slideshow, enabled: false } }));
                  indexedDB.deleteDatabase(DATA_BASE_NAME);
                }
              }
            );
          }
        }, "Delete Database")
      ]
    })
  }

  function FormNumberInput({ value, onChange, label, suffix, ...restProps }) {
    const [val, setVal] = useState(value + '');
    const lastVal = useRef(value);
    const inputRef = useRef(null);

    const handleChange = useCallback(newVal => { setVal(newVal) }, [setVal]);
    const handleBlur = useCallback(() => {
      lastVal.current = !isNaN(Number(val)) ? Math.max(Number(val), restProps.min ?? Number(val)) : lastVal.current;
      onChange(lastVal.current);
      setVal(lastVal.current + '');
    }, [val, onChange, lastVal.current, setVal]);
    const handleKeyDown = useCallback(e => {
      e.key === 'Enter' && e.target?.blur?.();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation?.();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault?.();
          const delta = e.key === 'ArrowUp' ? 1 : -1;
          setVal(newValue => { newValue = (Number(newValue) + delta).toFixed(Math.ceil(Math.abs(Math.log10(Math.abs(restProps.min ?? 1))))); return Math.max(Number(newValue), restProps.min ?? Number(newValue)) + '' });
        }
      }
    }, [setVal]);

    useEffect(() => {
      const ctrl = new AbortController();

      inputRef.current?.addEventListener?.('wheel', e => {
        if (e.deltaY && inputRef.current === document.activeElement) {
          e.preventDefault?.();
          setVal(oldValue => {
            oldValue = (Number(oldValue) - Math.sign(e.deltaY)).toFixed(Math.ceil(Math.abs(Math.log10(Math.abs(restProps.min ?? 1)))));
            return Math.max(Number(oldValue), restProps.min ?? Number(oldValue)) + '';
          });
        }
      }, ctrl);
      inputRef.current?.addEventListener?.("beforeinput", e => {
        if (e.data && /[^0-9e\+\-.]+/.test(e.data)) e.preventDefault?.();
      }, ctrl);

      return () => ctrl.abort();
    }, []);

    return jsx('label', {
      className: 'BackgroundManager-FormNumberInput',
      children: [
        jsx("span", { className: constants.textStyles?.defaultColor }, label ?? ''),
        jsx(constants.nativeUI.TextInput, {
          ...restProps,
          inputRef,
          rows: 1,
          value: val,
          className: 'BackgroundManager-NumberInput',
          onChange: handleChange,
          onBlur: handleBlur,
          onKeyDown: handleKeyDown
        }), suffix ? jsx('span', { className: constants.textStyles?.defaultColor }, suffix) : null
      ]
    })
  }

  function MenuNumberInput({ value, onChange, ...restProps }) {
    const [textValue, setTextValue, textStateRef] = useStateWithRef(value + '');
    const [sliderValue, setSliderValue, sliderStateRef] = useStateWithRef(value);
    const oldValue = useRef(value);
    const ID = useId();
    const sliderRef = useRef(null);
    const inputRef = useRef(null);

    const handleTextChange = useCallback(newValue => { setTextValue(newValue) }, [setTextValue]);
    const handleSliderChange = useCallback(newValue => {
      newValue = Number(newValue.toFixed(restProps.decimals ?? 0));
      restProps.onSlide?.(newValue);
      setSliderValue(newValue);
    }, [setSliderValue, restProps.onSlide]);

    const onTextCommit = useCallback(() => {
      oldValue.current = !isNaN(Number(textValue)) ? Math.max(Number(textValue), restProps.minValue ?? Number(textValue)) : oldValue.current;
      setTextValue(oldValue.current + '');
      setSliderValue(oldValue.current);
      sliderRef.current._reactInternals.stateNode.setState({ value: oldValue.current });
      onChange(oldValue.current);
    }, [onChange, setSliderValue, textValue, setTextValue]);
    const handleKeyDown = useCallback(e => {
      e.key === 'Enter' && e.target?.blur?.();
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation?.();
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault?.();
          const delta = (e.key === 'ArrowUp' ? 10 : -10) * (restProps.decimals ? Math.pow(10, -1 * restProps.decimals) : 0.1);
          setTextValue(val => {
            val = (Number(val) + delta).toFixed(restProps.decimals ?? 0);
            return Math.max(Number(val), restProps.minValue ?? Number(val)) + '';
          });
        }
      }
    }, [setTextValue]);
    const onSliderCommit = useCallback(newValue => {
      const fixedValue = Number(newValue.toFixed(restProps.decimals ?? 0));
      setTextValue(fixedValue + '');
      onChange(fixedValue)
    }, [onChange, setTextValue]);

    useEffect(() => {
      const ctrl = new AbortController();

      inputRef.current?.addEventListener?.('wheel', e => {
        if (e.deltaY) {
          const delta = -10 * Math.sign(e.deltaY) * (restProps.decimals ? Math.pow(10, -1 * restProps.decimals) : 0.1);
          setTextValue(val => {
            val = (Number(val) + delta).toFixed(restProps.decimals ?? 0);
            return Math.max(Number(val), restProps.minValue ?? Number(val)) + '';
          });
        }
      }, ctrl);
      inputRef.current?.addEventListener?.("beforeinput", e => {
        if (e.data && /[^0-9e\+\-.]+/.test(e.data)) e.preventDefault?.();
      }, ctrl);

      return () => {
        ctrl.abort();
        Number(textStateRef.current) != sliderStateRef.current && onChange(sliderStateRef.current);
      }
    }, []);

    return jsx('div', {
      style: {
        display: 'grid', gap: "0.5rem", maxWidth: '16rem'
      },
      className: [constants.separator?.item, constants.separator?.labelContainer, (restProps.disabled ? constants.separator?.disabled : '')].join(' '),
      children: [
        jsx('div', {
          className: constants.textStyles?.defaultColor,
          style: { display: 'flex', gap: '0.25rem', alignItems: 'center' },
          onMouseEnter: () => inputRef.current?.focus?.(),
          onMouseLeave: () => inputRef.current?.blur?.(),
          children: [
            jsx('label', {
              htmlFor: ID,
              children: restProps.label,
              style: {
                marginRight: 'auto', paddingRight: '0.75rem',
                cursor: 'inherit',
                flex: '1 0 calc(55% - .5rem)'
              },
              className: [constants.separator?.label].join(' '),
            }),
            jsx(constants.nativeUI.TextInput, {
              inputRef,
              value: textValue,
              rows: 1,
              className: "BackgroundManager-NumberInput",
              disabled: restProps.disabled,
              id: ID,
              onChange: handleTextChange,
              onBlur: onTextCommit,
              onKeyDown: handleKeyDown,
            }),
            restProps.suffix ? jsx('span', { children: restProps.suffix }) : null
          ]
        }), jsx("div", {
          children: jsx(constants.nativeUI.MenuSliderControl, {
            ref: sliderRef,
            mini: true, className: constants.slider?.slider,
            disabled: restProps.disabled,
            initialValue: sliderValue,
            onValueRender: e => Number(e.toFixed(restProps.decimals ?? 0)) + (restProps.suffix ?? ''),
            minValue: restProps.minValue,
            maxValue: restProps.maxValue,
            onValueChange: onSliderCommit,
            asValueChanges: handleSliderChange,
            keyboardStep: restProps.decimals ? Math.pow(10, -1 * restProps.decimals + 1) : 1
          })
        })
      ]
    })
  }

  function InPopoutSettings({ rerender }) {
    const [settings, setSettings] = useSettings();
    const handleClick = useCallback(e => {
      const MyContextMenu = ContextMenu.buildMenu([
        {
          label: "Enable Transition",
          type: 'toggle',
          checked: settings.transition.enabled,
          action: () => {
            setSettings(prev => {
              prev.transition.enabled = !prev.transition.enabled;
              return prev;
            });
            viewTransition.bgContainer()?.style.setProperty('--BgManager-transition-duration', (settings.transition.enabled ? settings.transition.duration ?? 0 : 0) + 'ms');
          }
        }, {
          label: "Transition Duration",
          type: "custom",
          render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
            disabled: !settings.transition.enabled,
            label: "Transition Duration",
            value: settings.transition.duration,
            minValue: 0, maxValue: 3000,
            onChange: newVal => {
              setSettings(prev => {
                prev.transition.duration = Number(newVal);
                return prev;
              });
              viewTransition.bgContainer()?.style.setProperty('--BgManager-transition-duration', (settings.transition.enabled ? Number(newVal) ?? 0 : 0) + 'ms');
            },
            suffix: " ms"
          })),
        }, {
          type: 'group',
          items: [{
            label: "Enable Slideshow",
            type: 'toggle',
            checked: settings.slideshow.enabled,
            action: () => setSettings(prev => {
              (prev.slideshow.enabled = !prev.slideshow.enabled) ? slideShowManager.start() : slideShowManager.stop();
              rerender(e => [...e]);
              return prev;
            })
          }, {
            label: "Slideshow Interval",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              disabled: !settings.slideshow.enabled,
              label: "Slideshow Interval",
              value: settings.slideshow.interval / 6e4,
              minValue: 0.5, maxValue: 120,
              decimals: 1,
              onChange: newVal => {
                let oldValue;
                setSettings(prev => {
                  oldValue = prev.slideshow.interval;
                  prev.slideshow.interval = Number(newVal) * 6e4;
                  return prev;
                });
                if (oldValue !== newVal * 6e4) slideShowManager.start();
              },
              suffix: " min"
            })),
          }, {
            label: "Shuffle Slideshow",
            type: 'toggle',
            checked: settings.slideshow.shuffle,
            action: () => setSettings(prev => {
              prev.slideshow.shuffle = !prev.slideshow.shuffle;
              return prev;
            })
          }]
        }, { type: 'separator', }, {
          label: "Enable Drop Area",
          type: 'toggle',
          checked: settings.enableDrop,
          action: () => setSettings(prev => {
            prev.enableDrop = !prev.enableDrop;
            return prev;
          })
        }, {
          label: "Overwrite CSS variable",
          type: 'toggle',
          checked: settings.overwriteCSS,
          action: () => setSettings(prev => {
            (prev.overwriteCSS = !prev.overwriteCSS) ? (themeObserver.start(), viewTransition.setProperty()) : themeObserver.stop();
            return prev;
          })
        }, {
          label: "Add Context Menus",
          type: 'toggle',
          checked: settings.addContextMenu,
          action: () => setSettings(prev => {
            (prev.addContextMenu = !prev.addContextMenu) ? contextMenuPatcher.patch() : contextMenuPatcher.unpatch();
            return prev;
          })
        }, {
          label: "Adjust Image",
          type: "submenu",
          items: [{
            label: "x-Position",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "x-Position",
              value: settings.adjustment.xPosition,
              minValue: -50, maxValue: 50,
              decimals: 0,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.xPosition = Math.min(50, Math.max(-50, newVal));
                viewTransition.bgContainer()?.style.setProperty('--BgManager-position-x', Math.min(50, Math.max(-50, newVal)) + '%')
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-position-x', Math.min(50, Math.max(-50, newVal)) + '%'),
              suffix: ' %'
            })),
          }, {
            label: "y-Position",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "y-Position",
              value: settings.adjustment.yPosition,
              minValue: -50, maxValue: 50,
              decimals: 0,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.yPosition = Math.min(50, Math.max(-50, newVal));
                viewTransition.bgContainer()?.style.setProperty('--BgManager-position-y', Math.min(50, Math.max(-50, newVal)) + '%')
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-position-y', Math.min(50, Math.max(-50, newVal)) + '%'),
              suffix: ' %'
            })),
          }, { type: 'separator' }, {
            label: 'Dimming',
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "Dimming",
              value: settings.adjustment.dimming,
              minValue: 0, maxValue: 1,
              decimals: 2,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.dimming = newVal;
                viewTransition.bgContainer()?.style.setProperty('--BgManager-dimming', newVal);
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-dimming', newVal),
              suffix: ''
            })),
          }, {
            label: "Blur",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "Blur",
              value: settings.adjustment.blur,
              minValue: 0, maxValue: 100,
              decimals: 0,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.blur = Math.min(100, Math.max(0, newVal));
                viewTransition.bgContainer()?.style.setProperty('--BgManager-blur', Math.min(100, Math.max(0, newVal)) + 'px')
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-blur', Math.min(100, Math.max(0, newVal)) + 'px'),
              suffix: ' px'
            })),
          }, {
            label: "Grayscale",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "Grayscale",
              value: settings.adjustment.grayscale,
              minValue: 0, maxValue: 100,
              decimals: 0,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.grayscale = Math.min(100, Math.max(0, newVal));
                viewTransition.bgContainer()?.style.setProperty('--BgManager-grayscale', Math.min(100, Math.max(0, newVal)) + '%')
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-grayscale', Math.min(100, Math.max(0, newVal)) + '%'),
              suffix: ' %'
            })),
          }, {
            label: "Saturate",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "Saturation",
              value: settings.adjustment.saturate,
              minValue: 0, maxValue: 300,
              decimals: 0,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.saturate = Math.min(300, Math.max(0, newVal));
                viewTransition.bgContainer()?.style.setProperty('--BgManager-saturation', Math.min(300, Math.max(0, newVal)) + '%')
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-saturation', Math.min(300, Math.max(0, newVal)) + '%'),
              suffix: ' %'
            })),
          }, {
            label: "Contrast",
            type: "custom",
            render: () => jsx(ErrorBoundary, null, jsx(MenuNumberInput, {
              label: "Contrast",
              value: settings.adjustment.contrast,
              minValue: 0, maxValue: 300,
              decimals: 0,
              onChange: newVal => setSettings(prev => {
                prev.adjustment.contrast = Math.min(300, Math.max(0, newVal));
                viewTransition.bgContainer()?.style.setProperty('--BgManager-contrast', Math.min(300, Math.max(0, newVal)) + '%')
                return prev;
              }),
              onSlide: newVal => viewTransition.bgContainer()?.style.setProperty('--BgManager-contrast', Math.min(300, Math.max(0, newVal)) + '%'),
              suffix: ' %'
            })),
          }]
        }
      ]);
      ContextMenu.open(e, MyContextMenu);
    }, [open, settings]);

    return jsx(IconButton, {
      TooltipProps: { text: 'Open Settings' },
      ButtonProps: {
        className: 'BackgroundManager-SettingsButton',
        onClick: handleClick,
      },
      SvgProps: { path: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6' }
    })
  }

  // Patching functions
  /** Context menu un-/patcher */
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
          if (
            context.target.classList.contains(constants.originalLink?.originalLink) &&
            context.target.dataset.role === 'img' &&
            Array.isArray(menu?.props?.children?.props?.children)
          ) {
            if (context.mediaItem?.contentType?.startsWith('image')) {
              // uploaded image
              menu.props.children.props.children.splice(-1, 0, BuildMenuItem(context.mediaItem.url))
            } else if ((embed = context.message.embeds?.find(e => e.image?.url === context.target.href))) {
              // linked image
              menu.props.children.props.children.splice(-1, 0, BuildMenuItem(embed.image.proxyURL))
            } else if ((embed = context.message.messageSnapshots[0].message.embeds?.find(e => e.image?.url === context.target.href))) {
              // forwarded linked image
              menu.props.children.props.children.splice(-1, 0, BuildMenuItem(embed.image.proxyURL))
            } else if ((embed = context.message.messageSnapshots[0].message.attachments?.find(e => e.url === context.target.href))) {
              // forwarded uploaded image
              menu.props.children.props.children.splice(-1, 0, BuildMenuItem(embed.proxy_url))
            }
          }
        })
      }
    }
    function unpatch() {
      cleanupImage?.();
      cleanupImage = null;
      cleanupMessage?.();
      cleanupMessage = null;
    }
    function BuildMenuItem(src) {
      return jsx(ContextMenu.Group, null, jsx(ContextMenu.Item, {
        id: 'add-Manager',
        label: 'Add to Background Manager',
        action: async () => {
          let mediaURL = function (src) {
            let safeURL = function (url) { try { return new URL(url) } catch (e) { return null } }(src);
            return null == safeURL || safeURL.host === "cdn.discordapp.com" ? src : safeURL.origin === "https://media.discordapp.net" ? (safeURL.host = "cdn.discordapp.com",
              ["size", "width", "height", "quality", "format"].forEach(param => safeURL.searchParams.delete(param)),
              safeURL.toString()) : (safeURL.searchParams.delete("width"),
                safeURL.searchParams.delete("height"),
                safeURL.toString())
          }(src);
          try {
            const response = await fetch(new Request(mediaURL, { method: "GET", mode: "cors" }));
            if (!response.ok) throw new Error(response.status);
            if (!response.headers.get('Content-Type').startsWith('image/')) throw new Error('Item is not an image.');
            const blub = await response.blob();
            const image = new Image();
            image.onload = () => setImageFromIDB(storedImages => {
              storedImages.push({ id: storedImages.length + 1, image: blub, width: image.width, height: image.height, selected: false, src: null });
              URL.revokeObjectURL(image.src);
              UI.showToast("Successfully added to BackgroundManager", { type: 'success' });
            });
            image.onerror = () => URL.revokeObjectURL(image.src);
            image.src = URL.createObjectURL(blub);
          } catch (err) {
            console.error('Status ', err)
            UI.showToast("Failed to add to BackgroundManager. Status " + err, { type: 'error' });
          };
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

    return { patch, unpatch }
  }();

  /** Patches the button to the HeaderBar */
  function addButton() {
    if (constants.settings.addContextMenu) contextMenuPatcher.patch();
    try {
      // patch image Modal to be able to show blobs as well
      const filter2 = m => m instanceof Function && (str => ['sourceWidth:', 'sourceHeight:'].every(s => str.includes(s)))(m.toString());
      const getSrcModule = Webpack.getModule(m => Object.values(m).some(filter2));
      const getSrc = [getSrcModule, Object.keys(getSrcModule).find(key => filter2(getSrcModule[key]))];
      if (!getSrc) throw new Error("Cannot find src module");
      Patcher.after(meta.slug, ...getSrc, (_, args) => {
        if (args[0].src.startsWith('blob:'))
          return args[0].src;
      })
    } catch (e) {
      console.error('%c[BackgroundManager]%c ', e, "color:#DBDCA6;font-weight:bold", "")
    }
    // patch headerbar
    const filter = module => module?.Icon && module.Title && module.toString().includes('section');
    const HeaderBarModule = Webpack.getModule(m => Object.values(m).some(filter));
    const HeaderBar = [HeaderBarModule, Object.keys(HeaderBarModule).find(key => filter(HeaderBarModule[key]))];
    if (!HeaderBar) throw new Error("Cannot find toolbar module");
    Patcher.before(meta.slug, ...HeaderBar, (_, args) => {
      // Check if toolbar children exists and if its an Array. Also, check if our component is already there.
      if (Array.isArray(args[0]?.toolbar?.props?.children) && !args[0].toolbar.props.children.some?.(e => e?.key === meta.slug))
        // Render the component behind the search bar.
        args[0].toolbar.props.children.splice(-2, 0, jsx(ErrorBoundary, {
          children: jsx(PopoutComponent), key: meta.slug
        }));
    })
    forceRerenderElement('.' + constants.toolbarClasses?.toolbar);
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
        if (e.src) URL.revokeObjectURL(e.src);
        e.src = null;
      });
      saveItems(db, 'images', storedItems, storedItems);
    }).catch(err => {
      console.error('Error opening database:', err);
    }).finally(() => {
      db?.close();
    });
    // destroy any slideshows, mutation observer and image containers
    slideShowManager.stop();
    themeObserver.stop();
    viewTransition.destroy();
    // remove the icon
    constants.toolbarClasses?.toolbar && forceRerenderElement('.' + constants.toolbarClasses?.toolbar);
    // unpatch contextmenu
    contextMenuPatcher.unpatch();
    // unpatch the toolbar
    Patcher.unpatchAll(meta.slug);
    // remove styles
    DOM.removeStyle(meta.slug + '-style');
    DOM.removeStyle('BackgroundManager-background');
  }

  // utility
  /** Generates the main CSS for the plugin */
  function generateCSS() {
    DOM.removeStyle(meta.slug + '-style');
    DOM.addStyle(meta.slug + '-style', `
.BackgroundManager-NumberInput::-webkit-scrollbar {
  display: none;
}
#app-mount .${constants.baseLayer.bg} {
  isolation: isolate;
  display: block;
}
.BackgroundManager-bgContainer {
  position: absolute;
  inset: 0;
  z-index: -1;
  isolation: isolate;
}
.BackgroundManager-bgContainer::after {
  content: '';
  position: absolute;
  inset: 0;
  backdrop-filter: blur(var(--BgManager-blur, 0px));
}
.BackgroundManager-bg {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: calc(50% - var(--BgManager-position-x, 0%)) calc(50% - var(--BgManager-position-y, 0%)) / cover no-repeat fixed;
  filter: grayscale(var(--BgManager-grayscale, 0%)) contrast(var(--BgManager-contrast, 100%)) saturate(var(--BgManager-saturation, 100%));
  mix-blend-mode: plus-lighter;
  transition: opacity var(--BgManager-transition-duration, 0ms) ease-out;
}
.BackgroundManager-bg.active {
  opacity: 1;
}
@keyframes fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.BackgroundManager-FormNumberInput {
  display: grid;
  grid-template-columns: 1fr 100px auto;
  align-items: center;
  gap: 4px;
  margin-bottom: 20px;
  &:has([disabled]) {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
.BackgroundManager-NumberInput {
  white-space: nowrap;
  padding-block: 0.25rem;
  text-align: right;
}
.BackgroundManager-inputWrapper {
  display: grid;
  grid-template-columns: 1fr auto;
  padding: 0.5rem 0.75rem 0.5rem 0.25rem;
  gap: 0.5rem;
}
.BackgroundManager-DropAndPasteArea {
  position: relative;
  display: grid;
  border: 2px solid var(--blue-430, currentColor);
  border-radius: .5rem;
  outline: 2px dashed var(--blue-430, currentColor);
  outline-offset: -8px;
  grid-row: span 3;
  caret-color: transparent;
  background: url( "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23333' d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'/%3E%3C/svg%3E" ) center / contain no-repeat rgba(0, 0, 0, 0.5);
}
.BackgroundManager-DropAndPasteArea:is(:focus, .dragging, :focus-visible)::before {
  opacity: 1;
}
.BackgroundManager-DropAndPasteArea::before {
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
.BackgroundManager-UploadButton {color: var(--green-430); }
.BackgroundManager-UploadButton:is(:hover, :focus-visible) { color: var(--green-500); }
.BackgroundManager-UploadButton:active { color: var(--green-530); }
.BackgroundManager-SettingsButton { color: var(--blue-430); }
.BackgroundManager-SettingsButton:is(:hover, :focus-visible) { color: var(--blue-500); }
.BackgroundManager-SettingsButton:active { color: var(--blue-530); }
.BackgroundManager-RemoveBgButton { color: var(--red-430); }
.BackgroundManager-RemoveBgButton:is(:hover, :focus-visible) { color: var(--red-500); }
.BackgroundManager-RemoveBgButton:active { color: var(--red-530); }

.BackgroundManager-UploadButton,
.BackgroundManager-SettingsButton,
.BackgroundManager-nextButton,
.BackgroundManager-RemoveBgButton {
  display: grid;
  place-items: center;
  padding: 0.25rem;
  background-color: #0000;
  aspect-ratio: 1;
  border-radius: 0.25rem;
  transition: color 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundManager-imageWrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-radius: .25rem;
  background-color: #0000;
  flex: 0 0 calc(50% - 0.25rem);
  aspect-ratio: 16 / 9;
  outline: 2px solid transparent;
  padding: 0;
  overflow: hidden;
  transition: outline-color 400ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundManager-imageWrapper.selected {
  outline-color: var(--focus-primary, currentColor);
}
.BackgroundManager-image {
  object-fit: cover;
  min-height: 100%;
  min-width: 100%;
  animation: fade-in 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundManager-imageWrapper:hover > .BackgroundManager-deleteButton,
.BackgroundManager-deleteButton:focus-visible {
  opacity: 1;
}
.BackgroundManager-imageData {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0.25rem 0;
  font-size: .75rem;
  color: rgba(255, 255, 255, 0.6667);
  background: linear-gradient(#0000, rgba(25, 25, 25, 0.8) .175rem) no-repeat;
}
.BackgroundManager-imageData::before {
  content: 'SIZE: 'attr(data-size)'';
}
.BackgroundManager-imageData[data-dimensions]::after {
  content: attr(data-dimensions);
}
.BackgroundManager-imageWrapper:is(:hover, :focus-visible, :focus-within) .BackgroundManager-imageData[data-mime]::after,
.BackgroundManager-imageData[data-mime]:not([data-dimensions])::after {
  content: attr(data-mime);
  font-family: 'gg mono';
}
.BackgroundManager-deleteButton {
  display: flex;
  position: absolute;
  inset: 3px 3px auto auto;
  border-radius: 4px;
  border: 0;
  padding: 1px;
  background-color: #c62828;
  opacity: 0;
  color: #fff;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms cubic-bezier(0.4, 0, 0.2, 1);
}
.BackgroundManager-deleteButton:is(:hover, :focus-visible) {
  background-color: #d15353; 
}
.BackgroundManager-gridWrapper {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  overflow: auto;
  padding: 0.5rem 0.25rem;
  margin-bottom: 0.5rem;
  align-content: start;
  scrollbar-gutter: stable;
  mask-image: linear-gradient(#0000, #000 0.5rem, #000 calc(100% - 0.5rem), #0000 100%), linear-gradient(to left, #000 0.75rem, #0000 0.75rem);
}`);
  }

  /**
   * Adds a suffix to a number
   * @param {number} num The number to append a suffix to
   * @returns {string}
   */
  function formatNumber(num) {
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
  }

  /**
   * Accessing the database and either sets the selected image as a background, or calls the callback with all items.
   * @param {undefined | (storedItems: ImageItem[]) => void} callback Callback when the items have been loaded from the database
   */
  async function setImageFromIDB(callback) {
    let db;
    return openDB('images')
      .then(database => {
        db = database;
        return getAllItems(db, 'images');
      })
      .then(storedItems => {
        callback(storedItems);
        saveItems(db, 'images', storedItems, storedItems);
      })
      .catch(err => {
        console.error('Error opening database:', err);
      }).finally(() => {
        db?.close();
      });
  }

  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
      return { hasError: true };
    }

    componentDidCatch(error, info) {
      console.error(error, info);
    }

    render() {
      return this.state.hasError ? jsx('div', { style: { color: '#f03' } }, 'Component Error') : this.props.children;
    }
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
      if (node.matches(query)) return node;
      node = node.parentElement;
    }
    return null;
  }

  /** Force rerenders a given element, or the first found element that matches the given selector.
   * @param {HTMLElement | string} element An HTMLElement or Selector
   */
  function forceRerenderElement(element) {
    // taken and refactored from Zerthox - https://github.com/Zerthox/BetterDiscord-Plugins/blob/8ae5b44c2fc29753336cc67f31b6b99ead5608d5/packages/dium/src/utils/react.ts#L189-L208
    const queryFiber = (fiber, callback) => {
      let count = 50, parent = fiber;

      do {
        if (callback(parent)) {
          return parent;
        }
        parent = parent.return;
      } while (parent && --count);

      return null;
    };

    const forceFullRerender = fiber => new Promise(resolve => {
      const owner = queryFiber(fiber, node => node?.stateNode instanceof React.Component);
      if (owner) {
        owner.stateNode.forceUpdate(() => resolve(true));
      } else {
        resolve(false);
      }
    });
    const node = element instanceof HTMLElement ? element : document.querySelector(element);
    node ? forceFullRerender(BdApi.ReactUtils.getInternalInstance(node)) : console.warn('%c[BackgroundManager] %cCould not rerender element', "color:#DBDCA6;font-weight:bold", "");
  }

  /** Returns the mime type of the image @param {Uint8Array} buffer The UInt8Array buffer */
  function getImageType(buffer) {
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
  }

  // Inits and Event Listeners
  /** Manager to start and stop the slideshow. Internally handles the interval */
  const slideShowManager = function () {
    let interval, triggeredWhileHidden = false;

    function handleVisibilityChange(e) {
      e.target.visibilityState === 'visible' && (triggeredWhileHidden = false);
    }
    function start() {
      stop();
      document.addEventListener("visibilitychange", handleVisibilityChange);
      interval = setInterval(() => {
        if (document.visibilityState === 'hidden') {
          if (triggeredWhileHidden) return;
          else triggeredWhileHidden = true;
        }
        setImageFromIDB(storedImages => {
          const mounted = document.querySelector('.BackgroundManager-gridWrapper');
          const currentIndex = storedImages.reduce((p, c, i) => c.selected ? i : p, null);
          if (constants.settings.slideshow.shuffle && storedImages.length > 2) { // Shuffle only for 3 or more images
            let x, counter = 0;
            do x = Math.floor(Math.random() * storedImages.length)
            while (x === currentIndex && counter++ < 25)
            storedImages.forEach(e => {
              if (!mounted) {
                e.src && URL.revokeObjectURL(e.src);
                e.src = null;
              }
              e.selected = false;
              if (e.id - 1 === x) {
                e.selected = true;
                !mounted && (e.src = URL.createObjectURL(e.image));
                viewTransition.setImage(e.src);
                console.log('%c[BackgroundManager] %cImage updated on:', "color:#DBDCA6;font-weight:bold", "", new Date())
              }
            })
          } else if (storedImages.length) {
            storedImages.forEach((e, i) => {
              if (!mounted) {
                e.src && URL.revokeObjectURL(e.src);
                e.src = null;
              }
              e.selected = false;
              if (i === ((currentIndex + 1) || Math.floor(Math.random() * storedImages.length)) % storedImages.length) {
                e.selected = true;
                !mounted && (e.src = URL.createObjectURL(e.image));
                viewTransition.setImage(e.src);
                console.log('%c[BackgroundManager] %cImage updated on:', "color:#DBDCA6;font-weight:bold", "", new Date())
              }
            })
          }
        })
      }, Math.max(constants.settings.slideshow.interval ?? 3e5, 3e4));
    }
    function stop() {
      interval && clearInterval(interval);
      interval = null;
      triggeredWhileHidden = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }
    return { start, stop }
  }();

  /**  Controller for switching images */
  const viewTransition = function () {
    let bgContainer, activeIndex = 0, domBG = [], property, originalBackground = true, cleanupPatch, currentSrc, timer;
    function applyProperties() {
      bgContainer.style.setProperty('--BgManager-transition-duration', (constants.settings.transition.enabled ? constants.settings.transition.duration ?? 0 : 0) + 'ms');
      constants.settings.adjustment.xPosition && bgContainer?.style.setProperty('--BgManager-position-x', constants.settings.adjustment.xPosition + '%');
      constants.settings.adjustment.yPosition && bgContainer?.style.setProperty('--BgManager-position-y', constants.settings.adjustment.yPosition + '%');
      constants.settings.adjustment.dimming && bgContainer?.style.setProperty('--BgManager-dimming', constants.settings.adjustment.dimming);
      constants.settings.adjustment.blur && bgContainer?.style.setProperty('--BgManager-blur', constants.settings.adjustment.blur + 'px');
      constants.settings.adjustment.grayscale && bgContainer?.style.setProperty('--BgManager-grayscale', constants.settings.adjustment.grayscale + '%');
      constants.settings.adjustment.saturate !== 100 && bgContainer?.style.setProperty('--BgManager-saturation', constants.settings.adjustment.saturate + '%');
      constants.settings.adjustment.contrast !== 100 && bgContainer?.style.setProperty('--BgManager-contrast', constants.settings.adjustment.contrast + '%');
    }
    // Use React component instead of DOM manipulation, as Discord sometimes removes those.
    function baseLayerBg() {
      const containerRef = useRef();
      const bg0Ref = useRef();
      const bg1Ref = useRef();
      useEffect(() => {
        bgContainer = containerRef.current;
        domBG = [bg0Ref.current, bg1Ref.current];
        applyProperties();
        return () => {
          bgContainer = null;
          domBG = [];
        }
      }, []);
      return jsx('div', {
        ref: containerRef,
        className: 'BackgroundManager-bgContainer',
        children: [
          jsx('div', { ref: bg0Ref, className: 'BackgroundManager-bg' + (activeIndex === 0 ? ' active' : ''), style: activeIndex === 0 && currentSrc ? { backgroundImage: 'linear-gradient(rgba(0,0,0,var(--BgManager-dimming,0)), rgba(0,0,0,var(--BgManager-dimming,0))), url(' + currentSrc + ')' } : null }),
          jsx('div', { ref: bg1Ref, className: 'BackgroundManager-bg' + (activeIndex === 1 ? ' active' : ''), style: activeIndex === 1 && currentSrc ? { backgroundImage: 'linear-gradient(rgba(0,0,0,var(--BgManager-dimming,0)), rgba(0,0,0,var(--BgManager-dimming,0))), url(' + currentSrc + ')' } : null })
        ]
      })
    }
    function create() {
      //  The actual targeted function to patch is in this module, but it's not exported ("renderArtisanalHack()" in class "R"):
      //  -> BdApi.Webpack.getWithKey(BdApi.Webpack.Filters.byStrings(".fullScreenLayers.length", ".darkSidebar", ".getLayers()", ".DARK")).next().value
      //  However, it's directly calling ThemeProvider, so I'm patching this instead and check for the correct className.
      const nativeUI = Webpack.getModule(m => m.ConfirmModal);
      const ThemeProviderKey = nativeUI && Object.keys(nativeUI).filter((key) => (source =>
        ['gradient:', '"disable-adaptive-theme":'].every(str => source.includes(str))
      )(nativeUI[key].toString()))[0];
      if (!ThemeProviderKey) {
        throw new Error("Cannot patch ThemeProvider");
      }
      cleanupPatch = Patcher.after(meta.slug, nativeUI, ThemeProviderKey, (_, __, returnVal) => {
        if (returnVal.props?.children?.props?.className?.includes(constants.baseLayer.bg))
          returnVal.props.children.props.children = jsx(baseLayerBg)
      })
      forceRerenderElement('.' + constants.baseLayer.bg);
    }
    /** @param {string} src  */
    function setImage(src) {
      currentSrc = src;
      if (domBG.length === 2) {
        document.visibilityState === 'visible' && (activeIndex ^= 1);
        domBG[activeIndex].style.backgroundImage = 'linear-gradient(rgba(0,0,0,var(--BgManager-dimming,0)), rgba(0,0,0,var(--BgManager-dimming,0))), url(' + src + ')';
        domBG[activeIndex].classList.add('active');
        domBG[activeIndex ^ 1].classList.remove('active');
      }
      if (!property || !constants.settings.overwriteCSS) return;
      if (originalBackground) {
        originalBackground = false;
        timer = setTimeout(() => {
          DOM.removeStyle('BackgroundManager-background');
          DOM.addStyle('BackgroundManager-background', property.map(e => `${e.selector} {${e.property}: url('${src}') !important;}`).join('\n'));
          timer = null;
        }, constants.settings.transition.duration)
      } else {
        DOM.removeStyle('BackgroundManager-background');
        DOM.addStyle('BackgroundManager-background', property.map(e => `${e.selector} {${e.property}: url('${src}') !important;}`).join('\n'));
      }
    }
    function removeImage() {
      domBG.forEach(e => e.classList.remove('active'));
      originalBackground = true
      DOM.removeStyle('BackgroundManager-background');
    }
    function destroy() {
      cleanupPatch?.();
      constants.baseLayer?.bg && forceRerenderElement('.' + constants.baseLayer.bg);
      timer && (clearTimeout(timer), timer = null);
      originalBackground = true;
      DOM.removeStyle('BackgroundManager-background');
      bgContainer = null;
      currentSrc = null;
      activeIndex = 0;
      domBG = [];
    }
    function setProperty(overwrite = true) {
      const themes = document.querySelectorAll('bd-head  bd-themes style');
      if (!themes?.length) return;
      const foundProperties = [];
      for (const theme of themes) {
        const sheet = [...document.styleSheets].find(sheet => sheet.ownerNode === theme);
        if (!sheet) continue;
        const cssVariables = {};

        // Iterate through the CSS rules in the stylesheet
        for (const rule of sheet.cssRules) {
          if (!rule || rule instanceof CSSImportRule || !(rule instanceof CSSStyleRule)) continue;
          for (const customProperty of rule.style) {
            if (customProperty.startsWith('--')) {
              const value = rule.style.getPropertyValue(customProperty).trim();
              if (value.startsWith('url')) {
                if (!cssVariables[customProperty])
                  cssVariables[customProperty] = { value, selectors: [] };
                cssVariables[customProperty].selectors.push(rule.selectorText || ':root');
              }
            }
          }
        }
        if (!cssVariables) continue;
        let customProperty;
        block: if (Object.keys(cssVariables).length === 1) {
          customProperty = Object.keys(cssVariables)[0];
        } else {
          for (const key of Object.keys(cssVariables)) { // prioritize background, bg, backdrop
            if (['background', 'bg', 'wallpaper', 'backdrop'].some(e => key.toLowerCase().includes(e))) {
              customProperty = key;
              break block;
            }
          }
          for (const key of Object.keys(cssVariables)) { // if no variable is found, look for images.
            if (['image', 'img'].some(e => key.toLowerCase().includes(e))) {
              customProperty = key;
              break block;
            }
          }
        }
        if (!customProperty) continue;
        foundProperties.push({ property: customProperty, selector: cssVariables[customProperty].selectors[0] });
      }
      if (!foundProperties.length) return (property = null);
      property = foundProperties;
      overwrite && setImageFromIDB(storedImages => {
        storedImages.forEach(image => {
          if (image.selected && image.src) {
            DOM.removeStyle('BackgroundManager-background');
            DOM.addStyle('BackgroundManager-background', property.map(e => `${e.selector} {${e.property}: url('${image.src}') !important;}`).join('\n'));
          }
        })
      });
    }
    return { create, setImage, removeImage, destroy, bgContainer: () => bgContainer, setProperty }
  }();

  const themeObserver = function () {
    let nodeObserver;
    function start() {
      if (nodeObserver) stop();
      nodeObserver = new MutationObserver(() => {
        viewTransition.setProperty();
      })
      nodeObserver.observe(document.querySelector('bd-head  bd-themes'), { childList: true, subtree: true });
    }
    function stop() {
      DOM.removeStyle('BackgroundManager-background');
      nodeObserver?.disconnect();
      nodeObserver = null;
    }
    return { start, stop }
  }();

  return {
    start: async () => {
      try {
        !Object.keys(constants).length && console.log('%c[BackgroundManager] %cInitialized', "color:#DBDCA6;font-weight:bold", "")
        const configs = Data.load(meta.slug, "settings");
        const modules = {
          toolbarClasses: Webpack.getByKeys("iconWrapper", "toolbar"), // classes for toolbar
          messagesPopoutClasses: Webpack.getByKeys("messagesPopout"), // classes for messages popout
          textStyles: Webpack.getByKeys("defaultColor"), // classes for general text styles
          markupStyles: Webpack.getByKeys("markup"),
          slider: Webpack.getByKeys("sliderContainer", "slider"),
          layerContainerClass: Webpack.getByKeys("trapClicks"), // classes of Discord"s nativelayer container
          originalLink: Webpack.getByKeys("originalLink"), // classes for image embed
          scrollbar: Webpack.getByKeys("thin"), // classes for scrollable content
          separator: Webpack.getByKeys("scroller", "label"), // classes for separator
          baseLayer: Webpack.getByKeys("baseLayer", "bg"), // classes of Discord's base layer
          lazyCarousel: Object.values(Webpack.getBySource(".MEDIA_VIEWER", ".OPEN_MODAL"))[0],  // Module for lazy carousel
          settings: {
            ...defaultSettings, ...configs,
            transition: { ...defaultSettings.transition, ...configs?.transition },
            slideshow: { ...defaultSettings.slideshow, ...configs?.slideshow },
            adjustment: { ...defaultSettings.adjustment, ...configs?.adjustment }
          },
          nativeUI: Webpack.getMangled(m => m.ConfirmModal, { // native ui module
            FocusRing: Filters.byStrings("FocusRing was given a focusTarget"),
            FormTitle: Filters.byStrings(".errorSeparator"),
            FormSwitch: Filters.byStrings("tooltipNote:", "focusProps:"),
            MenuSliderControl: Filters.byStrings("moveGrabber"),
            Popout: Filters.byStrings("Unsupported animation config:"),
            Spinner: Filters.byStrings(".stopAnimation]:"),
            Tooltip: Filters.byStrings("this.renderTooltip()]"),
            useFocusLock: Filters.byStrings("disableReturnRef:"),
          }),
        }
        Object.assign(modules.nativeUI, {   // Don't need the whole module, just the right function inside it.
          Button: (([mod, key]) => mod[key])([...Webpack.getWithKey(Filters.byStrings(",submittingFinishedLabel:"))]),
          TextInput: (([mod, key]) => mod[key])([...Webpack.getWithKey(Filters.byStrings("allowOverflow", "autoFocus"))])
        })
        if (!modules.baseLayer || !new Set(["Popout", "Tooltip", "Spinner", "FocusRing"]).isSubsetOf(new Set(Object.keys(modules.nativeUI)))) {
          throw new Error("Missing essential modules.");
        }
        Object.assign(constants, modules);
        generateCSS();
        // On startup, refresh objectURL of stored selected image. Wait until changes are saved.
        await setImageFromIDB(storedImages =>
          storedImages.forEach(e => {
            e.src && URL.revokeObjectURL(e.src);
            e.src = e.selected ? URL.createObjectURL(e.image) : null;
          })
        );
        // create image containers
        viewTransition.create();
        // set up css property using refreshed objectURL
        constants.settings.overwriteCSS && viewTransition.setProperty(false);
        // finally, set the selected image, if any, as background. A bit convoluted, but order is important.
        await setImageFromIDB(storedImages => {
          const img = storedImages.find(image => image.selected);
          img && viewTransition.setImage(img.src)
        });
        // Start Slideshow if enabled
        constants.settings.slideshow.enabled && slideShowManager.start();
        constants.settings.overwriteCSS && themeObserver.start();
        addButton();
      } catch (e) {
        console.error(e);
        UI.showToast("Could not start BackgroundManager", { type: 'error' });
        BdApi.Plugins.disable(meta.id);
      }
    },
    stop: stop,
    getSettingsPanel: () => jsx(ErrorBoundary, null, jsx(BuildSettings))
  }
}