Enhance your themes with a library for easy access to set and swap your background images. Images are no longer limited to https urls! No more searching for the image URL, opening the theme folder and replacing code lines.

Adds a slideshow feature, that will shuffle your backgrounds. Enabling transitions will allow for smooth swapping animation.


_**Note**_: This plugin works in conjunction with themes that allow the use of background images. Inside the theme, the background image must be set as a custom property! These will be overwritten by the plugin, to set the new background.

```css
/* like this */
:root {
  --background-image: url('your-image.jpg');
}

/* or like this */
.bg__12180 {
  --bg-image: url('your-image.jpg');
}
```

_Pro tip_: Since IndexedDB is used to store the images inside the Discord client, you can use more efficient image formats, like AVIF, WebP or even JPG to save on memory space.