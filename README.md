# ID sample

A standalone, visibly non-official personal card prototype:
[open the app](https://willzjc.github.io/id-sample/).

This is **template identification** and has no official verification capability.
The non-official warning appears in a compact bar fixed to the bottom of the
screen, stays visible while scrolling, and remains present in printed output.
Bottom spacing keeps page content clear of the bar and phone safe areas.
The site and repository are public. `noindex, nofollow` requests that search
engines avoid indexing the page; it is not a password or privacy boundary.

## Using the card

- Motion starts automatically on touch/mobile devices when the sensor API does
  not require permission. iPhone Safari shows an **Enable motion** prompt once
  per visit; tap it and grant permission, or choose **Not now**. Safari requires
  that tap before `DeviceMotionEvent.requestPermission()` can run. HTTPS is required.
- Use the three-dot menu to edit the top banner title, name, licence number, card number, expiry date,
  birthdate, preview refreshed
  date/time, Class and Conditions. **Card labels** lets you rename Refreshed,
  Licence Number, Card Number, Expiry, Date of birth, Class and Conditions.
  Labels accept up to 48 characters and are saved/reset with the details.
- Choose a portrait, personal barcode/QR image, or your own/authorized top or bottom logo
  from your phone's native photo-library/file chooser. Images are not uploaded.
  Uploaded portraits have no visible photo badge; the placeholder keeps its
  **ILLUSTRATION** badge.
- Draw a signature in the editor using a mouse, trackpad, touch or stylus.
  **Clear signature** starts over or removes it when saved. Closing without
  saving discards signature edits. **Remember on this device** retains it;
  **Reset details** removes it along with the other saved details.
- PNG/WebP logo transparency is preserved. For an opaque logo, enable
  **Remove background colour**, choose a colour, and adjust **Tolerance**.
  Zero matches the exact colour; larger values include nearby shades.
- The checkerboard preview updates live. Save changes to apply them to the card.
  The original resized logo is kept so lowering tolerance or disabling removal
  restores pixels without selecting the file again.
- Select **Remember on this device** to retain edits in this browser.
  **Reset details** clears the card's saved data and restores sample details.

The default name is **Will Chin**, with a birthdate of **14 Oct 1991**.
These defaults are public in the site source. Existing remembered edits are
preserved; **Reset details** restores these defaults and removes saved edits.

The refreshed label is manually chosen preview text, not a live server refresh.
It displays the date/time as entered without timezone conversion.
The licence number and card number each accept up to 32 characters. The former
defaults to the label **Licence Number** (previously Profile number), keeping
existing saved number values. Older saved cards receive the new label defaults,
sample card number and empty bottom logo without losing other details.
Expiry is a calendar date,
shown as entered without timezone conversion; past and future dates are allowed.
Older saved cards receive the sample number and expiry defaults without
changing their existing details or images.
The fixed top banner defaults to **Template License** and remains visible while
scrolling, with the edit control beside it. Its editable title accepts
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
The lower section reuses the exact uploaded portrait data, rendered in grayscale
at 24% opacity without creating or storing another image. Its reference ratios
are 200/738 of the card width, 200:245 aspect ratio, 30/738 left offset and
32/738 spacing below the class tiles. CSS scales these proportions with the card.
The bottom banner uses `#fef363` (RGB 254, 243, 99), sampled from the supplied
reference screenshot, independently of the other UI accent colours.
An opposing diagonal strip behind it uses the screenshot's faded yellow
`#716c34` (RGB 113, 108, 52), producing the crossed-band edge.
The footer is at least 44.85% of the card width
high, with an editable Card Number and independent, transparency-preserving
bottom logo. The white signature slot is 409/738 of the card width with a
409:103 aspect ratio; adding it preserves the lower section's overall spacing.
Signatures are local transparent PNG drawings, not official verification.
No official logo, address or prefilled signature is included.
Do not use an official document's verification code in the personal-code slot.

### iPhone motion troubleshooting

Open the new site directly in Safari and choose **Enable motion**, then **Allow**
Motion & Orientation. If dismissed, reload to see the permission prompt again.
The status panel appears above the bottom disclaimer:
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
permission, reload, and choose **Enable motion** again. Reduce Motion pauses animation.
Returning to the page resumes mobile sensors without a second prompt when
permission was granted during this visit; no permission request is made on load.
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

This repository is the single source for the app. The older CV card subpage and
local copy have been removed; the CV itself remains unchanged. The saved-card
key differs from the old copy because GitHub Pages project sites share the
`willzjc.github.io` origin. Images saved in the old browser preview do not transfer
to this site. No CV content is included in this repository.

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
Only this repository is used for app edits and deployment. The CV remains
unchanged, and its older card subpage has been removed.

Run the deploy script from this app folder:

```sh
# macOS/Linux:
./deploy.sh
# Windows (PowerShell 7):
./deploy.ps1
# Either platform:
npm run deploy
# Optional commit message:
npm run deploy -- "Update card styling"
```

`npm run deploy` picks `deploy.ps1` on Windows and `deploy.sh` elsewhere; both
run the same checks in the same order.

Requires Git, Node.js/npm, and the GitHub CLI (`gh`), signed in with permission
to push to `willzjc/id-sample` (`gh auth login`). Install the test dependencies
with `npm ci --ignore-scripts` if needed.

The script runs tests, automatically stages and commits **all non-ignored edits,
new files and deletions in this repository without prompting**, then pushes
`main`, waits for the Pages deployment, and verifies the five live assets against
the local files. Review changes before running it: this repository is public,
and GitHub Pages is not private. Browser-saved card details and uploads are not
part of a deployment unless you deliberately put them in source files.

It requires the correct origin and the `main` branch, stops if upstream is
ahead, and never force-pushes or skips Git hooks. If there are no local edits,
it deploys/verifies the current commit. Failed tests, pushes, builds or public
asset checks exit with an error rather than reporting a successful deployment.
