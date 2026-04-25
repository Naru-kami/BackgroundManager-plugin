# Background Manager

A Plugin enhancing your Discord themes to easily access, set and swap your background images. Add Images directly from within your client; no more replacing URLs in the theme file.

<ins style="font-size:large;">__IMPORTANT__</ins>: This plugin only works in conjunction with themes, which allow the use of background images. Compatible with most such themes.

## Key features: 
- Background Slideshow with a shuffle option
- Transitions for smooth swapping animations
- A Popup with an image gallery to quickly select new background images

## Exposed CSS variables

Two CSS Variables are being exported, to use freely in your themes or customCSS: 
- `--bgm-url`: This is the ObjectURL of the current background image (if any), and automatically changes when switching backgrounds. You can use this to manually overwrite the background of some parts inside the theme, e.g. if the automatic detection fails. An example use case would look like this:
    ```css
    /*
    Example for the theme "T1".
    We can overwrite the server background variable.
    */
    :root {
    --background-server:
        linear-gradient(rgba(0, 0, 0, 0.6)),
        var(--bgm-url) center / cover fixed;
    }

    /*
    Or if your theme doesn't set a background image for the context menu (right-click menu), you could manually add it like this.
    */
    [class*=menu]::before {
    content: "";
    inset: 0;
    position: absolute;
    background:
        linear-gradient(rgba(0, 0, 0, 0.6)),
        var(--bgm-url) center / cover fixed;
    }
    ```

- `--bgm-accentcolor`: When the accent color option is enabled, you can pick a color from the currently active background image's color palette, which can be accessed in CSS via `--bgm-accentcolor`. You could overwrite the theme's main color to match the background image more closely:
    ```css
    /*
    Overwrite the main color in ClearVision.
    */
    :root {
        --main-color: var(--bgm-accentcolor, #2780e6);
    }

    /*
    It is possible to transition between the colors, by registering the it as a custom property. Hoewver, depending on the theme, this might be computationally expensive, and may feel laggy.
    */
    @property --bgm-accentcolor {
        syntax: "<color>";
        inherits: true;
        initial-value: #2780e6;
    }
    :root {
        transition: --bgm-accentcolor 200ms ease-in-out;
    }

    /*
    Using relative colors, you can extract and modify components of the color. For example, you can make the lightness a constant value, to have a consistent experience across different accent colors:
    */
    :root {
        --main-color: oklch(
            from var(--bgm-accentcolor, #2780e6) 0.6 calc(c * 1.2) h
        );
    }
    ```

## How to use

1. Open the popup from the titlebar / channel toolbar and add your images.
2. Set the Background image by clicking on their respective preview.
3. Open the settings from the cog icon to adjust slideshow and transition timings.

_Pro-tip_: Since IndexedDB is used to store the images inside the Discord client, you can use more efficient image formats, like AVIF, WebP or even JPG to save on memory space.