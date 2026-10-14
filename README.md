# ID sample

A standalone, visibly non-official personal card prototype:
[open the app](https://willzjc.github.io/id-sample/).

This is **not valid identification** and has no official verification capability.
The non-official warning appears in a compact bar fixed to the bottom of the
screen, stays visible while scrolling, and remains present in printed output.
Bottom spacing keeps page content clear of the bar and phone safe areas.
The site and repository are public. `noindex, nofollow` requests that search
engines avoid indexing the page; it is not a password or privacy boundary.

## Using the card

- Tap the phone icon to enable motion and grant permission when prompted.
  On iPhone Safari this calls `DeviceMotionEvent.requestPermission()` directly
  from the tap and uses accelerometer/gravity readings to drive the background.
  HTTPS is required.
- Use the three-dot menu to edit the top banner title, name, profile number, expiry date,
  birthdate, preview refreshed
  date/time, Class and Conditions.
- Choose a portrait, personal barcode/QR image, or your own/authorized logo
  from your phone's native photo-library/file chooser. Images are not uploaded.
- PNG/WebP logo transparency is preserved. For an opaque logo, enable
  **Remove background colour**, choose a colour, and adjust **Tolerance**.
  Zero matches the exact colour; larger values include nearby shades.
- The checkerboard preview updates live. Save changes to apply them to the card.
  The original resized logo is kept so lowering tolerance or disabling removal
  restores pixels without selecting the file again.
- Select **Remember on this device** to retain edits in this browser.
  **Reset details** clears the card's saved data and restores sample details.

The refreshed label is manually chosen preview text, not a live server refresh.
It displays the date/time as entered without timezone conversion.
The profile number accepts up to 32 characters. Expiry is a calendar date,
shown as entered without timezone conversion; past and future dates are allowed.
Older saved cards receive the sample number and expiry defaults without
changing their existing details or images.
The fixed top banner defaults to **Template License** and remains visible while
scrolling, with the phone and edit controls beside it. Its editable title accepts
up to 64 characters. Long titles use an ellipsis on small screens but remain
complete in the page title and accessible heading; printing displays the full
title. Older saved cards receive the default title without losing other edits.
The mobile header is a direct child of the page body, fixed to the viewport
above the card and motion notices, without transformed centring or scrolling
ancestors. A shared safe-area-aware height reserves space above the portrait.
The versioned stylesheet URL forces browsers to fetch the updated header styles.
The editor remains a modal above the header; printing removes the floating
position and shadow.
The original floral silhouette uses broader side petals and wider tapered
separations rather than rounded vein-like slits; it does not reproduce official
licence security artwork.
Do not use an official document's verification code in the personal-code slot.

### iPhone motion troubleshooting

Open the new site directly in Safari and tap the phone icon, then **Allow**
Motion & Orientation. The status panel appears above the bottom disclaimer:
it distinguishes waiting for data, active accelerometer/orientation, denied
permission and unavailable readings.

Accelerometer readings are preferred. If no usable data arrives within five
seconds, the app tries orientation automatically only when no additional
permission prompt is required. Otherwise **Try orientation** makes a fresh
user-initiated request, as required by Safari. Denied primary permission also
offers this alternative where supported. Zero/invalid gravity samples do not
claim the sensor is active. Safari's temporary permission-UI visibility changes
do not cancel activation; navigating away still cancels it.

If Safari has remembered a denial, check the website's Motion & Orientation
permission, reload, and tap the icon again. Reduce Motion pauses animation.
Physical device readings cannot be proven by simulated test events and should
be checked on the phone after deployment.

## Images and privacy

JPG, PNG and WebP files up to 5 MB are accepted. Portraits are resized to at most
1200 pixels on the longest edge and encoded as JPEG; codes to 1600 pixels and
lossless PNG; logos to 600 pixels and lossless PNG with alpha preserved.
Prepared data URLs are limited to 2 million characters each. Use a supported
export or screenshot if your phone does not offer an original HEIC photo in a
supported format.

Colour removal makes a pixel fully transparent when each RGB channel is within
the selected tolerance (0-255) of the chosen colour. Black with tolerance 24
matches RGB values 0-24 in every channel. Nonmatching pixels retain their alpha.
All matching pixels are affected, including details inside the logo.

Remembered edits and images use `id-sample-card-details-v1` in local storage.
The site has no external assets, analytics or server upload endpoints.
Storage/quota errors are reported in the editor. Retaining the original and
processed logo may consume additional browser storage.

The old CV subpage and this site use different saved-card keys because GitHub
Pages project sites share the `willzjc.github.io` origin. The new site starts with
sample details; selecting images on the old localhost preview does not transfer
them to this site. No CV content is included in this repository.

## Development and checks

The runtime is plain HTML, CSS and JavaScript and requires no build.
Open [index.html](index.html) or serve the repository with a static server.
Phone sensors require HTTPS or localhost. Pointer and horizontal drag provide
a fallback. Vertical scrolling remains enabled; Reduce Motion is respected,
and leaving the page stops sensor interaction.

Development tests require Node.js 20.6 or newer:

```sh
npm ci --ignore-scripts
npm test
```

The tests cover editing, input validation, saved-card migration, storage
failures, local image handling, logo alpha and colour thresholds, reversible
processing, permissions, sensor fallback, orientation, and reduced motion.
Native phone chooser behavior and physical sensor sensitivity still need
checks on an actual phone.

## Deployment

GitHub Pages publishes the root of `main` at
`https://willzjc.github.io/id-sample/`. `.nojekyll` serves the static files
without Jekyll processing. Asset URLs are relative and work under this subpath.
The CV repository and its existing subpage remain unchanged.
