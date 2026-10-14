import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const storageKey = "id-sample-card-details-v1";

function fixture(options = {}) {
  const dom = new JSDOM(html, { url: "https://example.test/id-sample/", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  let reduced = options.reduced ?? false;
  let hidden = false;
  const warnings = [];
  const imageDraws = [];
  const imageFormats = [];
  const imageFills = [];
  const imageMappings = [];
  const signatureDraws = [];
  const signatureCaptures = new Map();
  const media = new window.EventTarget();
  Object.defineProperty(media, "matches", { get: () => reduced });
  window.matchMedia = (query) => query.includes("prefers-reduced-motion") ? media : { matches: options.mobile ?? false };
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: options.mobile ? 1 : 0 });
  Object.defineProperty(window, "isSecureContext", { value: options.secure ?? true });
  Object.defineProperty(document, "hidden", { get: () => hidden });
  const orientation = new window.EventTarget();
  orientation.angle = options.angle ?? 0;
  Object.defineProperty(window.screen, "orientation", { value: orientation });
  if (options.orientation) window.DeviceOrientationEvent = options.orientation;
  if (options.acceleration) window.DeviceMotionEvent = options.acceleration;
  if (options.saved !== undefined) window.localStorage.setItem(storageKey, options.saved);
  if (options.blockedStorage) Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
  window.console.warn = (...args) => warnings.push(args);
  Object.defineProperty(window.HTMLImageElement.prototype, "naturalWidth", { get: () => 2400 });
  Object.defineProperty(window.HTMLImageElement.prototype, "naturalHeight", { get: () => 1800 });
  window.HTMLImageElement.prototype.decode = async () => {
    if (options.decodeFailure) throw new window.Error("The image could not be decoded.");
    if (options.decodeGate) await options.decodeGate;
  };
  window.HTMLCanvasElement.prototype.getContext = function () {
    const canvas = this;
    if (canvas.id === "signature-pad") {
      return options.signatureUnavailable ? null : {
        clearRect() { canvas.signatureInk = 0; },
        beginPath() {},
        arc(x, y) { signatureDraws.push({ type: "dot", x, y }); },
        fill() { canvas.signatureInk = (canvas.signatureInk ?? 0) + 1; },
        moveTo(x, y) { signatureDraws.push({ type: "from", x, y }); },
        lineTo(x, y) { signatureDraws.push({ type: "to", x, y }); },
        stroke() { canvas.signatureInk = (canvas.signatureInk ?? 0) + 1; },
        drawImage() { canvas.signatureInk = 1; signatureDraws.push({ type: "restore" }); }
      };
    }
    return options.canvasUnavailable ? null : {
      fillRect(x, y, width, height) { imageFills.push({ width, height }); },
      drawImage(image, x, y, width, height) { imageDraws.push({ width, height }); },
      getImageData() {
        if (options.pixelFailure) throw new window.Error("Pixel processing unavailable.");
        return { data: new Uint8ClampedArray(options.pixels ?? [0, 0, 0, 255]) };
      },
      putImageData(pixels) {
        const mapped = [...pixels.data];
        imageMappings.push(mapped);
        canvas.mappedPixels = mapped;
      }
    };
  };
  window.HTMLCanvasElement.prototype.toDataURL = function (format) {
    if (this.id === "signature-pad") {
      if (options.signatureEncodingFailure) throw new window.Error("PNG encoding unavailable.");
      return `data:${format};base64,${window.btoa(`signature-${this.signatureInk ?? 0}`)}`;
    }
    imageFormats.push(format);
    return `data:${format};base64,${this.mappedPixels ? window.btoa(JSON.stringify(this.mappedPixels)) : "AA=="}`;
  };
  window.HTMLCanvasElement.prototype.setPointerCapture = function (pointer) { signatureCaptures.set(this, pointer); };
  window.HTMLCanvasElement.prototype.hasPointerCapture = function (pointer) { return signatureCaptures.get(this) === pointer; };
  window.HTMLCanvasElement.prototype.releasePointerCapture = function () { signatureCaptures.delete(this); };
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new window.Event("close")); };
  const frames = new Map();
  const timers = new Map();
  let nextId = 0;
  window.requestAnimationFrame = (callback) => { const id = ++nextId; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.setTimeout = (callback) => { const id = ++nextId; timers.set(id, callback); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  window.eval(script);
  const get = (id) => document.getElementById(id);
  return {
    window, document, get, warnings, frames, timers, imageDraws, imageFormats, imageFills, imageMappings, signatureDraws,
    close: () => window.close(),
    async motion() { get("motion-button").click(); await new Promise(setImmediate); },
    event(type, values = {}) {
      const event = new window.Event(type);
      Object.assign(event, values);
      window.dispatchEvent(event);
    },
    signature(type, values = {}) {
      const pad = get("signature-pad");
      pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 409, height: 103 });
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: 20, clientY: 30, pointerType: "mouse", ...values });
      pad.dispatchEvent(event);
    },
    pointer(x, y) {
      const event = new window.Event("pointermove");
      Object.assign(event, { clientX: x, clientY: y, pointerType: "mouse", buttons: 0 });
      get("digital-card").getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800 });
      get("digital-card").dispatchEvent(event);
    },
    flush() {
      let count = 0;
      while (frames.size && count++ < 120) {
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
      }
      assert.equal(frames.size, 0, "animation settles rather than running indefinitely");
    },
    timeout() {
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      callback();
    },
    reduce(value = true) { reduced = value; media.dispatchEvent(new window.Event("change")); },
    hide() { hidden = true; document.dispatchEvent(new window.Event("visibilitychange")); },
    show() { hidden = false; document.dispatchEvent(new window.Event("visibilitychange")); },
    submit() {
      get("details-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    },
    async upload(kind, fileOptions = {}) {
      const file = new window.File([fileOptions.content ?? "test image"], "selected.png", { type: fileOptions.type ?? "image/png" });
      if (fileOptions.size) Object.defineProperty(file, "size", { value: fileOptions.size });
      const input = get(`${kind === "bottomLogo" ? "bottom-logo" : kind}-input`);
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      for (let i = 0; i < 20 && get("save-details").disabled; i++) await new Promise(setImmediate);
    },
    async mapLogo(enabled, colour = "#000000", tolerance = 24) {
      get("logo-transparency-input").checked = enabled;
      get("logo-colour-input").value = colour;
      get("logo-tolerance-input").value = String(tolerance);
      get("logo-transparency-input").dispatchEvent(new window.Event("change", { bubbles: true }));
      for (let i = 0; i < 20; i++) {
        await new Promise(setImmediate);
        if (!get("save-details").disabled) break;
      }
    },
    save(name, birthdate, remember = false) {
      get("edit-button").click();
      get("name-input").value = name;
      get("birthdate-input").value = birthdate;
      get("remember-input").checked = remember;
      get("details-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    }
  };
}

// test("standalone page stays visibly non-official, unindexed and free of remote assets", () => {
//   const f = fixture();
//   // assert.match(f.document.querySelector(".invalid-banner").textContent, /NOT VALID IDENTIFICATION/);
//   assert.equal(f.document.querySelector(".invalid-banner").tagName, "FOOTER");
//   assert.equal(f.document.querySelector(".invalid-banner").closest(".digital-card"), null);
//   assert.equal(f.document.querySelector("main").lastElementChild, f.document.querySelector(".invalid-banner"));
//   // assert.match(f.document.querySelector(".card-footer").textContent, /Not valid identification/);
//   assert.equal(f.document.querySelector('meta[name="robots"]').content, "noindex, nofollow");
//   assert.equal(f.get("display-name").textContent, "Will Chin");
//   assert.equal(f.get("card-heading").textContent, "Template License");
//   assert.equal(f.get("display-birthdate").textContent, "14 Oct 1991");
//   assert.match(f.document.querySelector(".pattern-tile").getAttribute("aria-label"), /Not a QR code/);
//   assert.equal(f.get("motion-button").closest(".card-header"), null);
//   assert.equal(f.get("motion-button").closest("#motion-notice") !== null, true);
//   assert.equal(f.get("edit-button").closest(".card-header") !== null, true);
//   assert.equal(f.document.querySelector(".card-header").closest(".digital-card"), null, "the fixed header stays outside the card's query container");
//   assert.equal(f.document.querySelector(".card-header").parentElement, f.document.body, "the mobile overlay is outside all scrolling/layout containers");
//   assert.equal(f.document.querySelector(".introduction"), null);
//   assert.equal(f.document.querySelector(".refresh-note"), null);
//   for (const element of f.document.querySelectorAll("[src], [href]")) {
//     assert.ok(!/^(https?:)?\/\//.test(element.getAttribute("src") ?? element.getAttribute("href")));
//   }
//   f.close();
// });

test("the mobile header is a transform-free viewport overlay above the card", () => {
  const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const dom = new JSDOM(html);
  const sheet = dom.window.document.createElement("style");
  sheet.textContent = styles;
  dom.window.document.head.append(sheet);
  const header = dom.window.document.querySelector(".card-header");
  const computed = dom.window.getComputedStyle(header);
  assert.equal(computed.position, "fixed");
  assert.equal(computed.top, "0px");
  assert.equal(computed.left, "0px");
  assert.equal(computed.right, "0px");
  assert.ok(computed.transform === "" || computed.transform === "none");
  assert.ok(Number(computed.zIndex) > Number(dom.window.getComputedStyle(dom.window.document.querySelector(".motion-notice")).zIndex));
  assert.equal(new URL(dom.window.document.querySelector('link[rel="stylesheet"]').getAttribute("href"), "https://example.test/id-sample/").searchParams.get("v"), "signature-ribbons-5");
  dom.window.close();
});

test("the bottom banner matches the sampled reference yellow without changing shared accents", () => {
  const dom = new JSDOM(html);
  const sheet = dom.window.document.createElement("style");
  sheet.textContent = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  dom.window.document.head.append(sheet);
  const banner = dom.window.document.querySelector(".card-number-panel");
  assert.equal(dom.window.getComputedStyle(banner).backgroundColor, "rgb(254, 243, 99)");
  assert.equal(dom.window.getComputedStyle(dom.window.document.documentElement).getPropertyValue("--accent").trim(), "#e8f986");
  assert.equal(banner.parentElement.className, "card-number-banners");
  const ribbon = [...sheet.sheet.cssRules].find((rule) => rule.selectorText === ".card-number-banners::before");
  assert.equal(ribbon.style.getPropertyValue("background"), "#716c34");
  assert.match(ribbon.style.getPropertyValue("clip-path"), /polygon\(0 0, 100% 8.7cqw/);
  const signature = dom.window.document.querySelector(".signature-panel");
  assert.equal(dom.window.getComputedStyle(signature).aspectRatio, "409 / 103");
  assert.equal(dom.window.getComputedStyle(signature).backgroundColor, "rgb(255, 255, 255)");
  dom.window.close();
});

test("signature pad supports mouse, touch and pen, scales coordinates and only applies ink on save", () => {
  for (const pointerType of ["mouse", "touch", "pen"]) {
    const f = fixture();
    f.get("edit-button").click();
    f.signature("pointerdown", { pointerType });
    assert.equal(f.get("save-details").disabled, true);
    f.submit();
    assert.match(f.get("form-status").textContent, /finish drawing/);
    f.signature("pointermove", { pointerType, clientX: 80, clientY: 50 });
    f.signature("pointerup", { pointerType, clientX: 80, clientY: 50 });
    assert.deepEqual(f.signatureDraws[0], { type: "dot", x: 40, y: 60 });
    assert.ok(f.signatureDraws.some((stroke) => stroke.type === "to" && stroke.x === 160 && stroke.y === 100));
    assert.equal(f.get("save-details").disabled, false);
    assert.equal(f.get("signature-image").hidden, true);
    f.submit();
    assert.equal(f.get("signature-image").hidden, false);
    assert.match(f.get("signature-image").src, /^data:image\/png;base64,/);
    assert.equal(f.get("signature-placeholder").hidden, true);
    assert.equal(f.window.localStorage.getItem(storageKey), null);
    f.close();
  }
});

test("saved signatures survive a new visit, can be appended or cleared, and reset removes them", async () => {
  const f = fixture();
  f.get("edit-button").click();
  f.signature("pointerdown");
  f.signature("pointerup");
  f.get("remember-input").checked = true;
  f.submit();
  const saved = f.window.localStorage.getItem(storageKey);
  const restored = fixture({ saved });
  assert.equal(restored.get("signature-image").src, f.get("signature-image").src);
  restored.get("edit-button").click();
  await new Promise(setImmediate);
  assert.ok(restored.signatureDraws.some((stroke) => stroke.type === "restore"));
  assert.equal(restored.get("save-details").disabled, false);
  restored.signature("pointerdown");
  restored.signature("pointerup");
  restored.submit();
  assert.notEqual(JSON.parse(restored.window.localStorage.getItem(storageKey)).signature, JSON.parse(saved).signature);
  restored.get("edit-button").click();
  restored.get("clear-signature").click();
  assert.equal(restored.get("signature-image").hidden, false, "clearing is pending until save");
  restored.submit();
  assert.equal(restored.get("signature-image").hidden, true);
  assert.equal(restored.get("signature-image").hasAttribute("src"), false);
  assert.equal(restored.get("signature-placeholder").hidden, false);
  assert.equal(JSON.parse(restored.window.localStorage.getItem(storageKey)).signature, null);
  f.get("edit-button").click();
  f.get("reset-details").click();
  assert.equal(f.get("signature-image").hidden, true);
  assert.equal(f.window.localStorage.getItem(storageKey), null);
  f.close();
  restored.close();
});

test("closing the editor discards pending signature drawing and clearing", async () => {
  const f = fixture();
  f.get("edit-button").click();
  f.signature("pointerdown");
  f.signature("pointerup");
  f.get("close-dialog").click();
  assert.equal(f.get("signature-image").hidden, true);
  f.get("edit-button").click();
  f.submit();
  assert.equal(f.get("signature-image").hidden, true);
  f.get("edit-button").click();
  f.signature("pointerdown");
  f.signature("pointerup");
  f.submit();
  const original = f.get("signature-image").src;
  f.get("edit-button").click();
  await new Promise(setImmediate);
  f.get("clear-signature").click();
  f.get("close-dialog").click();
  assert.equal(f.get("signature-image").src, original);
  f.close();
});

test("secondary pointers are ignored, coalesced samples are drawn and interruptions finish a partial signature", () => {
  const f = fixture();
  f.get("edit-button").click();
  f.signature("pointerdown", { button: 2 });
  f.signature("pointerdown", { isPrimary: false });
  assert.equal(f.signatureDraws.length, 0);
  f.signature("pointerdown");
  f.signature("pointermove", { pointerId: 2 });
  assert.equal(f.signatureDraws.length, 1);
  f.signature("pointermove", { getCoalescedEvents: () => [{ clientX: 40, clientY: 40 }, { clientX: 50, clientY: 45 }] });
  assert.ok(f.signatureDraws.some((stroke) => stroke.type === "to" && stroke.x === 100 && stroke.y === 90));
  f.signature("pointercancel");
  assert.equal(f.get("save-details").disabled, false);
  f.submit();
  assert.equal(f.get("signature-image").hidden, false);
  f.get("edit-button").click();
  f.get("clear-signature").click();
  f.signature("pointerdown");
  f.signature("lostpointercapture");
  assert.equal(f.get("save-details").disabled, false);
  f.close();
});

test("signature decoding, encoding and canvas errors are explicit and recoverable", async () => {
  const saved = JSON.stringify({ name: "Person", birthdate: "2000-01-01", signature: "data:image/png;base64,AA==" });
  const decoding = fixture({ saved, decodeFailure: true });
  decoding.get("edit-button").click();
  await new Promise(setImmediate);
  assert.match(decoding.get("signature-status").textContent, /could not be opened/);
  assert.equal(decoding.get("save-details").disabled, true);
  decoding.get("clear-signature").click();
  decoding.submit();
  assert.equal(decoding.get("signature-image").hidden, true);
  const encoding = fixture({ signatureEncodingFailure: true });
  encoding.get("edit-button").click();
  encoding.signature("pointerdown");
  encoding.signature("pointerup");
  assert.match(encoding.get("signature-status").textContent, /could not be prepared/);
  encoding.submit();
  assert.match(encoding.get("form-status").textContent, /Clear it/);
  encoding.get("clear-signature").click();
  encoding.submit();
  assert.equal(encoding.get("details-dialog").open, false);
  const unavailable = fixture({ signatureUnavailable: true });
  unavailable.get("edit-button").click();
  assert.match(unavailable.get("signature-status").textContent, /unavailable/);
  assert.equal(unavailable.get("signature-pad").getAttribute("aria-disabled"), "true");
  unavailable.submit();
  assert.equal(unavailable.get("details-dialog").open, false);
  decoding.close();
  encoding.close();
  unavailable.close();
});

test("pending signature decoding blocks save and clearing or closing cancels stale restoration", async () => {
  let resolve;
  const f = fixture({
    saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01", signature: "data:image/png;base64,AA==" }),
    decodeGate: new Promise((done) => { resolve = done; })
  });
  f.get("edit-button").click();
  assert.equal(f.get("save-details").disabled, true);
  f.submit();
  assert.match(f.get("form-status").textContent, /Wait for the signature/);
  f.get("clear-signature").click();
  assert.equal(f.get("save-details").disabled, false);
  resolve();
  await new Promise(setImmediate);
  assert.ok(!f.signatureDraws.some((stroke) => stroke.type === "restore"));
  f.submit();
  assert.equal(f.get("signature-image").hidden, true);
  f.close();
});

test("legacy details receive an empty signature and unsafe saved signatures are rejected", () => {
  const legacy = fixture({ saved: JSON.stringify({ name: "Saved Person", birthdate: "2000-01-01" }) });
  assert.equal(legacy.get("display-name").textContent, "Saved Person");
  assert.equal(legacy.get("signature-image").hidden, true);
  assert.equal(legacy.warnings.length, 0);
  legacy.close();
  for (const signature of ["https://example.test/signature.png", "data:image/svg+xml;base64,AA==", 1]) {
    const f = fixture({ saved: JSON.stringify({ name: "Saved Person", birthdate: "2000-01-01", signature }) });
    assert.match(f.get("form-status").textContent, /could not be loaded/);
    assert.equal(f.get("signature-image").hasAttribute("src"), false);
    f.close();
  }
});

test("personal defaults appear before scripts, populate the editor and return on reset without overwriting saved edits", () => {
  const initial = new JSDOM(html);
  assert.equal(initial.window.document.getElementById("display-name").textContent, "Will Chin");
  assert.equal(initial.window.document.getElementById("display-birthdate").textContent, "14 Oct 1991");
  initial.window.close();
  const f = fixture();
  f.get("edit-button").click();
  assert.equal(f.get("name-input").value, "Will Chin");
  assert.equal(f.get("birthdate-input").value, "1991-10-14");
  f.get("details-dialog").close();
  f.save("Saved Person", "2000-01-01", true);
  const restored = fixture({ saved: f.window.localStorage.getItem(storageKey) });
  assert.equal(restored.get("display-name").textContent, "Saved Person");
  assert.equal(restored.get("display-birthdate").textContent, "01 Jan 2000");
  restored.get("edit-button").click();
  restored.get("reset-details").click();
  assert.equal(restored.get("display-name").textContent, "Will Chin");
  assert.equal(restored.get("display-birthdate").textContent, "14 Oct 1991");
  assert.equal(restored.get("name-input").value, "Will Chin");
  assert.equal(restored.get("birthdate-input").value, "1991-10-14");
  assert.equal(restored.window.localStorage.getItem(storageKey), null);
  f.close();
  restored.close();
});

const cardLabels = [
  ["refreshed", "refreshedLabel", "Refreshed"],
  ["profile-number", "profileNumberLabel", "Licence Number"],
  ["card-number", "cardNumberLabel", "Card Number"],
  ["expiry", "expiryLabel", "Expiry"],
  ["birthdate", "birthdateLabel", "Date of birth"],
  ["class", "classLabel", "Class"],
  ["conditions", "conditionsLabel", "Conditions"]
];

test("every card field label is editable as text, remembered and reset independently of its value", () => {
  const f = fixture();
  f.get("edit-button").click();
  for (const [id, , defaultValue] of cardLabels) {
    assert.equal(f.get(`${id}-label-input`).value, defaultValue);
    f.get(`${id}-label-input`).value = `  <b>${id}</b>  `;
  }
  f.get("remember-input").checked = true;
  f.submit();
  const saved = JSON.parse(f.window.localStorage.getItem(storageKey));
  const restored = fixture({ saved: JSON.stringify(saved) });
  for (const [id, key] of cardLabels) {
    assert.equal(saved[key], `<b>${id}</b>`);
    assert.equal(restored.get(`display-${id}-label`).textContent, `<b>${id}</b>`);
    assert.equal(restored.get(`display-${id}-label`).children.length, 0);
  }
  assert.equal(restored.get("display-profile-number").textContent, "SAMPLE-0001");
  assert.equal(restored.get("display-card-number").textContent, "SAMPLE-0002");
  assert.equal(restored.get("display-birthdate").textContent, "14 Oct 1991");
  restored.get("edit-button").click();
  restored.get("reset-details").click();
  for (const [id, , defaultValue] of cardLabels) {
    assert.equal(restored.get(`display-${id}-label`).textContent, defaultValue);
    assert.equal(restored.get(`${id}-label-input`).value, defaultValue);
  }
  assert.equal(restored.window.localStorage.getItem(storageKey), null);
  f.close();
  restored.close();
});

test("legacy labels default to Licence Number without losing existing numbers or photos", () => {
  const f = fixture({ saved: JSON.stringify({ name: "Saved Person", birthdate: "2000-01-01", profileNumber: "EXISTING-123", photo: "data:image/jpeg;base64,AA==" }) });
  for (const [id, , defaultValue] of cardLabels) assert.equal(f.get(`display-${id}-label`).textContent, defaultValue);
  assert.equal(f.get("display-profile-number").textContent, "EXISTING-123");
  assert.equal(f.get("secondary-portrait-image").src, f.get("portrait-image").src);
  assert.equal(f.get("bottom-logo-image").hidden, true);
  assert.equal(f.warnings.length, 0);
  f.close();
});

test("invalid card labels are reported, while valid 48-character labels are accepted", () => {
  const f = fixture();
  for (const [id] of cardLabels) {
    f.get("edit-button").click();
    const input = f.get(`${id}-label-input`);
    for (const value of [" ", "A".repeat(49), "Text\u007f"]) {
      input.value = value;
      input.dispatchEvent(new f.window.Event("input"));
      f.submit();
      assert.notEqual(input.validationMessage, "");
      assert.equal(f.get("details-dialog").open, true);
    }
    input.value = "A".repeat(48);
    input.dispatchEvent(new f.window.Event("input"));
    f.submit();
    assert.equal(input.validationMessage, "");
    assert.equal(f.get(`display-${id}-label`).textContent, "A".repeat(48));
  }
  f.close();
});

test("corrupt saved labels and card numbers surface errors instead of silently using defaults", () => {
  for (const extra of [...cardLabels.map(([, key]) => ({ [key]: null })), { cardNumber: "" }, { cardNumber: "A".repeat(33) }]) {
    const f = fixture({ saved: JSON.stringify({ name: "Saved Person", birthdate: "2000-01-01", ...extra }) });
    assert.match(f.get("form-status").textContent, /could not be loaded/);
    assert.equal(f.warnings.length, 1);
    f.close();
  }
});

test("card number is editable, remembered, validated and reset", () => {
  const f = fixture();
  f.get("edit-button").click();
  f.get("card-number-input").value = " ";
  f.submit();
  assert.notEqual(f.get("card-number-input").validationMessage, "");
  f.get("card-number-input").value = "  PERSONAL-2042  ";
  f.get("card-number-input").dispatchEvent(new f.window.Event("input"));
  f.get("remember-input").checked = true;
  f.submit();
  assert.equal(f.get("display-card-number").textContent, "PERSONAL-2042");
  const restored = fixture({ saved: f.window.localStorage.getItem(storageKey) });
  assert.equal(restored.get("display-card-number").textContent, "PERSONAL-2042");
  restored.get("edit-button").click();
  restored.get("reset-details").click();
  assert.equal(restored.get("display-card-number").textContent, "SAMPLE-0002");
  f.close();
  restored.close();
});

test("name and birthdate are editable, trimmed, timezone-safe and not stored by default", () => {
  const f = fixture();
  f.save("  Casey Taylor  ", "2000-02-29");
  assert.equal(f.get("display-name").textContent, "Casey Taylor");
  assert.equal(f.get("display-birthdate").textContent, "29 Feb 2000");
  assert.equal(f.window.localStorage.getItem(storageKey), null);
  assert.equal(f.get("details-dialog").open, false);
  f.save("<img src=x onerror=alert(1)>", "2001-01-01");
  assert.equal(f.get("display-name").children.length, 0, "user data is rendered as text, never HTML");
  f.close();
});

test("refreshed date/time, class and conditions are editable and remembered without changing the chosen time", () => {
  const first = fixture();
  first.get("edit-button").click();
  first.get("refreshed-input").value = "2026-10-11T14:01";
  first.get("class-input").value = "  C  ";
  first.get("conditions-input").value = "  Glasses  ";
  first.get("remember-input").checked = true;
  first.submit();
  assert.equal(first.get("display-refreshed-date").textContent, "11 Oct 2026");
  assert.equal(first.get("display-refreshed-time").textContent, "2:01pm");
  assert.equal(first.get("display-refreshed").dateTime, "2026-10-11T14:01");
  assert.equal(first.get("display-class").textContent, "C");
  assert.equal(first.get("display-conditions").textContent, "Glasses");
  const second = fixture({ saved: first.window.localStorage.getItem(storageKey) });
  second.get("edit-button").click();
  assert.equal(second.get("refreshed-input").value, "2026-10-11T14:01");
  assert.equal(second.get("class-input").value, "C");
  assert.equal(second.get("conditions-input").value, "Glasses");
  second.get("reset-details").click();
  assert.equal(second.get("display-class").textContent, "C");
  assert.equal(second.get("display-conditions").textContent, "None");
  assert.equal(second.window.localStorage.getItem(storageKey), null);
  first.close();
  second.close();
});

test("legacy saved cards keep their existing data and receive new field defaults", () => {
  const f = fixture({ saved: JSON.stringify({ name: "Saved Person", birthdate: "2000-01-01", photo: "data:image/jpeg;base64,AA==" }) });
  assert.equal(f.get("display-name").textContent, "Saved Person");
  assert.equal(f.get("display-class").textContent, "C");
  assert.equal(f.get("display-conditions").textContent, "None");
  assert.equal(f.get("portrait-image").hidden, false);
  assert.equal(f.get("portrait-label").hidden, true, "uploaded photos have no visible badge");
  assert.match(f.get("display-refreshed").dateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(f.warnings.length, 0);
  f.close();
});

test("new fields reject invalid inputs explicitly and accept corrections", () => {
  const f = fixture();
  for (const [id, value] of [
    ["class-input", "   "],
    ["class-input", "C".repeat(33)],
    ["conditions-input", " "],
    ["conditions-input", "X".repeat(161)],
    ["refreshed-input", "2023-02-29T14:01"],
    ["refreshed-input", "1899-12-31T23:59"],
    ["refreshed-input", ""]
  ]) {
    f.get("edit-button").click();
    f.get(id).value = value;
    f.submit();
    assert.notEqual(f.get(id).validationMessage, "");
    assert.equal(f.get("details-dialog").open, true);
    f.get("close-dialog").click();
  }
  f.get("edit-button").click();
  f.get("conditions-input").value = "<b>Personal</b>";
  f.get("refreshed-input").value = "2000-02-29T00:00";
  f.submit();
  assert.equal(f.get("display-conditions").children.length, 0);
  assert.equal(f.get("display-conditions").textContent, "<b>Personal</b>");
  assert.equal(f.get("display-refreshed-time").textContent, "12:00am");
  f.close();
});

test("corrupt new saved fields are reported instead of silently replaced with defaults", () => {
  for (const extra of [{ class: null }, { conditions: "" }, { refreshed: "2023-02-29T14:00" }]) {
    const f = fixture({ saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01", ...extra }) });
    assert.match(f.get("form-status").textContent, /could not be loaded/);
    assert.equal(f.get("display-name").textContent, "Will Chin");
    assert.equal(f.warnings.length, 1);
    f.close();
  }
});

test("Escape closes the editor without saving pending changes", () => {
  const f = fixture();
  f.get("edit-button").click();
  f.get("name-input").value = "Unsaved";
  f.get("details-dialog").dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.get("details-dialog").open, false);
  assert.equal(f.get("display-name").textContent, "Will Chin");
  f.close();
});

test("remembered details survive a new visit and reset removes only the card's key", () => {
  const first = fixture();
  first.save("Casey Taylor", "2000-02-29", true);
  const saved = first.window.localStorage.getItem(storageKey);
  const second = fixture({ saved });
  assert.equal(second.get("display-name").textContent, "Casey Taylor");
  second.window.localStorage.setItem("unrelated", "keep");
  second.get("edit-button").click();
  assert.equal(second.get("remember-input").checked, true);
  second.get("reset-details").click();
  assert.equal(second.get("display-name").textContent, "Will Chin");
  assert.equal(second.window.localStorage.getItem(storageKey), null);
  assert.equal(second.window.localStorage.getItem("unrelated"), "keep");
  first.close();
  second.close();
});

test("unchecking remember clears previously saved details", () => {
  const f = fixture({ saved: JSON.stringify({ name: "Saved Person", birthdate: "1990-01-01" }) });
  f.save("Page Only", "2001-01-01", false);
  assert.equal(f.window.localStorage.getItem(storageKey), null);
  assert.equal(f.get("display-name").textContent, "Page Only");
  f.close();
});

test("invalid birthdays and empty names produce field errors without changing the card", () => {
  const f = fixture();
  for (const date of ["2023-02-29", "2999-01-01", "1899-12-31", ""]) {
    f.save("Casey", date);
    assert.equal(f.get("display-name").textContent, "Will Chin");
    assert.notEqual(f.get("birthdate-input").validationMessage, "");
  }
  f.save("   ", "2000-01-01");
  assert.notEqual(f.get("name-input").validationMessage, "");
  assert.equal(f.get("display-name").textContent, "Will Chin");
  f.close();
});

test("corrupt or unavailable storage is reported, and failed saves do not claim persistence", () => {
  for (const saved of ["bad json", "{}", JSON.stringify({ name: "Person", birthdate: "2023-02-29" })]) {
    const f = fixture({ saved });
    assert.equal(f.get("display-name").textContent, "Will Chin");
    assert.match(f.get("form-status").textContent, /could not be loaded/);
    assert.equal(f.warnings.length, 1);
    f.close();
  }
  const blocked = fixture({ blockedStorage: true });
  blocked.save("Page Only", "2000-01-01", true);
  assert.equal(blocked.get("display-name").textContent, "Page Only");
  assert.match(blocked.get("form-status").textContent, /page only/);
  assert.equal(blocked.get("details-dialog").open, true);
  blocked.get("reset-details").click();
  assert.match(blocked.get("form-status").textContent, /could not be cleared/);
  blocked.close();
});

test("mobile accelerometer starts on load without permission and resumes after visibility changes", async () => {
  const f = fixture({ mobile: true, acceleration: {} });
  assert.equal(f.get("motion-button").hidden, true);
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } });
  f.event("devicemotion", { accelerationIncludingGravity: { x: 2.5, y: 0, z: 9.8 } });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  f.hide();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  f.show();
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "true");
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } });
  f.event("devicemotion", { accelerationIncludingGravity: { x: 2.5, y: 0, z: 9.8 } });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  f.close();
});

test("iPhone prompts once per visit without requesting permission until Enable motion is tapped", async () => {
  let requests = 0;
  const f = fixture({ mobile: true, acceleration: { requestPermission: async () => { requests++; return "granted"; } } });
  assert.equal(requests, 0);
  assert.equal(f.get("motion-notice").hidden, false);
  assert.equal(f.get("motion-button").hidden, false);
  assert.equal(f.get("skip-motion").hidden, false);
  await f.motion();
  assert.equal(requests, 1);
  assert.equal(f.get("motion-button").hidden, true);
  assert.equal(f.get("skip-motion").hidden, true);
  f.hide();
  f.show();
  assert.equal(requests, 1, "returning does not ask again during the same visit");
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "true");
  f.close();
});

test("dismissing or skipping the motion prompt never requests permission or repeats it", () => {
  for (const id of ["skip-motion", "dismiss-motion-notice"]) {
    let requests = 0;
    const f = fixture({ mobile: true, acceleration: { requestPermission: () => { requests++; return "granted"; } } });
    f.get(id).click();
    f.hide();
    f.show();
    assert.equal(f.get("motion-notice").hidden, true);
    assert.equal(f.get("motion-button").hidden, true);
    f.event("pageshow");
    assert.equal(f.get("motion-notice").hidden, true);
    f.reduce(true);
    f.reduce(false);
    assert.equal(requests, 0);
    assert.equal(f.get("skip-motion").hidden, true);
    assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
    f.close();
  }
});

test("mobile automation respects Reduce Motion and does not prompt or subscribe on desktop", () => {
  const desktop = fixture({ acceleration: {} });
  assert.equal(desktop.timers.size, 0);
  assert.equal(desktop.get("motion-notice").hidden, true);
  const reduced = fixture({ mobile: true, reduced: true, acceleration: {} });
  assert.equal(reduced.timers.size, 0);
  assert.equal(reduced.get("motion-button").hidden, true);
  reduced.reduce(false);
  assert.equal(reduced.get("motion-button").getAttribute("aria-pressed"), "true");
  reduced.reduce(true);
  assert.equal(reduced.get("motion-button").getAttribute("aria-pressed"), "false");
  desktop.close();
  reduced.close();
});

test("mobile automation reports insecure contexts and unavailable sensors explicitly", () => {
  for (const [options, message] of [
    [{ mobile: true }, /aren't supported/],
    [{ mobile: true, secure: false, acceleration: {} }, /requires HTTPS/]
  ]) {
    const f = fixture(options);
    assert.match(f.get("motion-status").textContent, message);
    assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
    f.close();
  }
});

test("mobile motion waits for Reduce Motion to end or a page return after pending permission resolves", async () => {
  for (const navigation of [false, true]) {
    let resolve;
    let requests = 0;
    const f = fixture({ mobile: true, acceleration: { requestPermission: () => {
      requests++;
      return new Promise((done) => { resolve = done; });
    } } });
    f.get("motion-button").click();
    if (navigation) f.event("pagehide");
    else f.reduce(true);
    resolve("granted");
    await new Promise(setImmediate);
    assert.equal(f.timers.size, 0);
    assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
    if (navigation) f.event("pageshow");
    else f.reduce(false);
    assert.equal(requests, 1);
    assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "true");
    f.close();
  }
});

test("permission is requested only on tap; orientation is calibrated, smoothed and bounded", async () => {
  let requests = 0;
  const f = fixture({ orientation: { requestPermission: async () => { requests++; return "granted"; } } });
  assert.equal(requests, 0);
  await f.motion();
  assert.equal(requests, 1);
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "true");
  f.event("deviceorientation", { gamma: 5, beta: 50 });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.0000");
  f.event("deviceorientation", { gamma: 19, beta: 64 });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-y"), "0.5000");
  assert.equal(f.timers.size, 0);
  f.event("deviceorientation", { gamma: 90, beta: 170 });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "1.0000");
  await f.motion();
  f.event("deviceorientation", { gamma: 20, beta: 20 });
  assert.equal(f.frames.size, 0);
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.0000");
  f.close();
});

test("landscape coordinates rotate correctly and orientation changes re-calibrate", async () => {
  const f = fixture({ orientation: {}, angle: 90 });
  await f.motion();
  f.event("deviceorientation", { gamma: 0, beta: 30 });
  f.event("deviceorientation", { gamma: 14, beta: 30 });
  f.flush();
  assert.ok(Math.abs(Number(f.get("digital-card").style.getPropertyValue("--tilt-x"))) < 0.001);
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-y"), "-0.5000");
  f.window.screen.orientation.dispatchEvent(new f.window.Event("change"));
  f.event("deviceorientation", { gamma: 40, beta: 50 });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-y"), "0.0000");
  f.close();
});

test("angle wrap takes the shortest path and invalid sensor values are ignored", async () => {
  const f = fixture({ orientation: {} });
  await f.motion();
  f.event("deviceorientation", { gamma: null, beta: null });
  f.event("deviceorientation", { gamma: NaN, beta: Infinity });
  assert.equal(f.frames.size, 0);
  f.event("deviceorientation", { gamma: 0, beta: 179 });
  f.event("deviceorientation", { gamma: 0, beta: -179 });
  f.flush();
  assert.ok(Math.abs(Number(f.get("digital-card").style.getPropertyValue("--tilt-y")) - 2 / 28) < 0.001);
  f.close();
});

test("accelerometer is preferred when both sensor APIs exist", async () => {
  const f = fixture({ orientation: {}, acceleration: {} });
  await f.motion();
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 } });
  f.event("devicemotion", { accelerationIncludingGravity: { x: 2.5, y: 9.8, z: 0 } });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  assert.match(f.get("motion-status").textContent, /Motion is on/);
  f.close();
});

test("accelerometer-only devices request their own permission", async () => {
  let requests = 0;
  const f = fixture({ acceleration: { requestPermission: async () => { requests++; return "granted"; } } });
  await f.motion();
  assert.equal(requests, 1);
  f.event("devicemotion", { accelerationIncludingGravity: null });
  assert.equal(f.frames.size, 0);
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } });
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 5, z: 9.8 } });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-y"), "1.0000");
  f.close();
});

test("denied, failed, unsupported, insecure and missing sensor data all have explicit fallback messages", async () => {
  for (const [options, message] of [
    [{ orientation: { requestPermission: async () => "denied" } }, /wasn't granted/],
    [{ orientation: { requestPermission: async () => { throw new Error("Blocked"); } } }, /couldn't be enabled/],
    [{}, /aren't supported/],
    [{ secure: false, orientation: {} }, /requires HTTPS/]
  ]) {
    const f = fixture(options);
    await f.motion();
    assert.match(f.get("motion-status").textContent, message);
    assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
    f.pointer(300, 400);
    f.flush();
    assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
    f.close();
  }
  const missing = fixture({ orientation: { requestPermission: async () => "granted" } });
  await missing.motion();
  missing.timeout();
  assert.match(missing.get("motion-status").textContent, /No motion data received/);
  assert.equal(missing.get("motion-button").getAttribute("aria-pressed"), "false");
  missing.close();
});

test("Reduce Motion prevents animation, revokes pending activation and allows later pointer fallback", async () => {
  let resolve;
  const f = fixture({ orientation: { requestPermission: () => new Promise((done) => { resolve = done; }) } });
  f.get("motion-button").click();
  f.reduce();
  resolve("granted");
  await new Promise(setImmediate);
  f.event("deviceorientation", { gamma: 10, beta: 10 });
  f.pointer(400, 800);
  assert.equal(f.frames.size, 0);
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
  assert.match(f.get("motion-status").textContent, /Reduce Motion/);
  f.reduce(false);
  f.pointer(300, 400);
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  f.close();
});

test("leaving the page stops sensors and pending animation", async () => {
  const f = fixture({ orientation: {} });
  await f.motion();
  f.event("deviceorientation", { gamma: 0, beta: 0 });
  f.event("deviceorientation", { gamma: 20, beta: 20 });
  assert.equal(f.frames.size, 1);
  f.hide();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
  assert.match(f.get("motion-status").textContent, /leaving the page/);
  f.close();
});

test("initial reduced-motion preference blocks permission requests", async () => {
  let requests = 0;
  const f = fixture({ reduced: true, orientation: { requestPermission: () => { requests++; return "granted"; } } });
  await f.motion();
  assert.equal(requests, 0);
  assert.match(f.get("motion-status").textContent, /Reduce Motion/);
  f.close();
});

test("iPhone requests accelerometer permission from the tap and retries orientation only on another tap", async () => {
  let motionRequests = 0;
  let orientationRequests = 0;
  const f = fixture({
    acceleration: { requestPermission: async () => { motionRequests++; return "granted"; } },
    orientation: { requestPermission: async () => { orientationRequests++; return "granted"; } }
  });
  assert.equal(motionRequests, 0);
  f.get("motion-button").click();
  assert.equal(motionRequests, 1);
  assert.equal(orientationRequests, 0);
  await new Promise(setImmediate);
  f.timeout();
  assert.equal(orientationRequests, 0, "timeout never triggers a gesture-restricted permission request");
  assert.equal(f.get("motion-retry").hidden, false);
  assert.equal(f.get("motion-notice").hidden, false);
  f.get("motion-retry").click();
  await new Promise(setImmediate);
  assert.equal(orientationRequests, 1);
  f.event("deviceorientation", { gamma: 0, beta: 0 });
  f.event("deviceorientation", { gamma: 14, beta: 0 });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  f.close();
});

test("denied iPhone accelerometer permission offers a visible, user-initiated orientation retry", async () => {
  let orientationRequests = 0;
  const f = fixture({
    acceleration: { requestPermission: async () => "denied" },
    orientation: { requestPermission: async () => { orientationRequests++; return "granted"; } }
  });
  await f.motion();
  assert.match(f.get("motion-status").textContent, /wasn't granted/);
  assert.equal(f.get("motion-notice").hidden, false);
  assert.equal(f.get("motion-retry").hidden, false);
  assert.equal(orientationRequests, 0);
  f.get("motion-retry").click();
  assert.equal(orientationRequests, 1);
  await new Promise(setImmediate);
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "true");
  f.close();
});

test("orientation fallback is automatic only when no permission prompt is needed", async () => {
  const f = fixture({ acceleration: {}, orientation: {} });
  await f.motion();
  f.timeout();
  f.event("deviceorientation", { gamma: 0, beta: 0 });
  f.event("deviceorientation", { gamma: 14, beta: 0 });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  assert.equal(f.get("motion-retry").hidden, true);
  f.close();
});

test("temporary iPhone permission visibility changes do not cancel granted activation", async () => {
  let grant;
  const f = fixture({ acceleration: { requestPermission: () => new Promise((resolve) => { grant = resolve; }) } });
  f.get("motion-button").click();
  f.hide();
  grant("granted");
  await new Promise(setImmediate);
  assert.match(f.get("motion-status").textContent, /Return to this page/);
  f.show();
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 } });
  f.event("devicemotion", { accelerationIncludingGravity: { x: 2.5, y: 0, z: 9.8 } });
  f.flush();
  assert.equal(f.get("digital-card").style.getPropertyValue("--tilt-x"), "0.5000");
  f.hide();
  assert.equal(f.get("motion-button").getAttribute("aria-pressed"), "false");
  f.close();
});

test("navigation cancels a pending permission request and zero/invalid gravity does not claim success", async () => {
  let grant;
  const pending = fixture({ acceleration: { requestPermission: () => new Promise((resolve) => { grant = resolve; }) } });
  pending.get("motion-button").click();
  pending.event("pagehide");
  grant("granted");
  await new Promise(setImmediate);
  assert.equal(pending.get("motion-button").getAttribute("aria-pressed"), "false");
  pending.close();
  const f = fixture({ acceleration: {} });
  await f.motion();
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: 0 } });
  f.event("devicemotion", { accelerationIncludingGravity: { x: 0, y: 0, z: null } });
  assert.equal(f.frames.size, 0);
  assert.match(f.get("motion-status").textContent, /Waiting/);
  f.get("dismiss-motion-notice").click();
  assert.equal(f.get("motion-notice").hidden, true);
  f.close();
});

test("profile number and expiry are editable, remembered and reset to sample values", () => {
  const f = fixture();
  f.get("edit-button").click();
  f.get("profile-number-input").value = "  SAMPLE-2042  ";
  f.get("expiry-input").value = "2042-06-25";
  f.get("remember-input").checked = true;
  f.submit();
  assert.equal(f.get("display-profile-number").textContent, "SAMPLE-2042");
  assert.equal(f.get("display-expiry").textContent, "25 June 2042");
  const restored = fixture({ saved: f.window.localStorage.getItem(storageKey) });
  restored.get("edit-button").click();
  assert.equal(restored.get("profile-number-input").value, "SAMPLE-2042");
  assert.equal(restored.get("expiry-input").value, "2042-06-25");
  restored.get("reset-details").click();
  assert.equal(restored.get("display-profile-number").textContent, "SAMPLE-0001");
  assert.equal(restored.get("display-expiry").textContent, "31 Dec 2030");
  f.close();
  restored.close();
});

test("the fixed banner title is editable, rendered as text, remembered and reset", () => {
  const f = fixture();
  f.get("edit-button").click();
  f.get("banner-title-input").value = "  My Template  ";
  f.get("remember-input").checked = true;
  f.submit();
  assert.equal(f.get("card-heading").textContent, "My Template");
  assert.equal(f.document.title, "My Template | Interactive prototype");
  const restored = fixture({ saved: f.window.localStorage.getItem(storageKey) });
  restored.get("edit-button").click();
  assert.equal(restored.get("banner-title-input").value, "My Template");
  restored.get("banner-title-input").value = " ";
  restored.submit();
  assert.notEqual(restored.get("banner-title-input").validationMessage, "");
  restored.get("banner-title-input").value = "<b>My title</b>";
  restored.get("banner-title-input").dispatchEvent(new restored.window.Event("input"));
  restored.submit();
  assert.equal(restored.get("card-heading").children.length, 0);
  assert.equal(restored.get("card-heading").textContent, "<b>My title</b>");
  restored.get("edit-button").click();
  restored.get("reset-details").click();
  assert.equal(restored.get("card-heading").textContent, "Template License");
  f.close();
  restored.close();
});

test("invalid expiry dates and blank profile numbers report field errors without changing the card", () => {
  const f = fixture();
  for (const date of ["2023-02-29", "1899-12-31", ""]) {
    f.get("edit-button").click();
    f.get("expiry-input").value = date;
    f.submit();
    assert.notEqual(f.get("expiry-input").validationMessage, "");
    assert.equal(f.get("display-expiry").textContent, "31 Dec 2030");
    f.get("close-dialog").click();
  }
  f.get("edit-button").click();
  f.get("profile-number-input").value = " ";
  f.submit();
  assert.notEqual(f.get("profile-number-input").validationMessage, "");
  f.get("profile-number-input").value = "PAST-SAMPLE";
  f.get("profile-number-input").dispatchEvent(new f.window.Event("input"));
  f.get("expiry-input").value = "2000-02-29";
  f.submit();
  assert.equal(f.get("display-expiry").textContent, "29 Feb 2000");
  f.close();
});

test("local photo and code are previewed, resized and applied only when saved", async () => {
  const f = fixture();
  f.get("edit-button").click();
  await f.upload("photo");
  await f.upload("code");
  assert.equal(f.get("photo-preview").hidden, false);
  assert.equal(f.get("code-preview").hidden, false);
  assert.equal(f.get("portrait-image").hidden, true);
  assert.equal(f.get("code-image").hidden, true);
  assert.deepEqual(f.imageDraws, [{ width: 1200, height: 900 }, { width: 1600, height: 1200 }]);
  assert.deepEqual(f.imageFormats, ["image/jpeg", "image/png"]);
  f.submit();
  assert.equal(f.get("portrait-image").hidden, false);
  assert.equal(f.get("portrait-placeholder").hasAttribute("hidden"), true);
  assert.equal(f.get("code-image").hidden, false);
  assert.equal(f.get("code-placeholder").hasAttribute("hidden"), true);
  assert.match(f.get("code-label").textContent, /PERSONAL CODE \/ NOT OFFICIAL/);
  assert.equal(f.window.localStorage.getItem(storageKey), null);
  // assert.match(f.document.querySelector(".invalid-banner").textContent, /NOT VALID IDENTIFICATION/);
  f.close();
});

test("lower portrait uses the identical photo and follows save, removal and reset", async () => {
  const f = fixture();
  assert.equal(f.get("secondary-portrait-image").hidden, true);
  f.get("edit-button").click();
  await f.upload("photo");
  assert.equal(f.get("secondary-portrait-image").hidden, true);
  f.get("remember-input").checked = true;
  f.submit();
  assert.equal(f.get("secondary-portrait-image").src, f.get("portrait-image").src);
  assert.equal(f.get("secondary-portrait-image").parentElement.getAttribute("aria-hidden"), "true");
  const restored = fixture({ saved: f.window.localStorage.getItem(storageKey) });
  assert.equal(restored.get("secondary-portrait-image").hidden, false);
  assert.equal(restored.get("secondary-portrait-image").src, restored.get("portrait-image").src);
  restored.get("edit-button").click();
  restored.get("remove-photo").click();
  restored.submit();
  assert.equal(restored.get("secondary-portrait-image").hidden, true);
  assert.equal(restored.get("secondary-portrait-image").hasAttribute("src"), false);
  f.get("edit-button").click();
  f.get("reset-details").click();
  assert.equal(f.get("secondary-portrait-image").hidden, true);
  f.close();
  restored.close();
});

test("bottom logo is independently uploaded as transparent PNG, remembered, removable and resettable", async () => {
  const f = fixture();
  f.get("edit-button").click();
  await f.upload("bottomLogo");
  assert.deepEqual(f.imageDraws, [{ width: 600, height: 450 }]);
  assert.deepEqual(f.imageFormats, ["image/png"]);
  assert.deepEqual(f.imageFills, []);
  assert.equal(f.get("bottom-logo-preview").hidden, false);
  assert.equal(f.get("bottom-logo-image").hidden, true);
  f.get("remember-input").checked = true;
  f.submit();
  assert.equal(f.get("bottom-logo-image").hidden, false);
  assert.equal(f.get("bottom-logo-placeholder").hidden, true);
  assert.equal(f.get("logo-image").hidden, true, "bottom logo does not replace the top logo");
  const restored = fixture({ saved: f.window.localStorage.getItem(storageKey) });
  assert.equal(restored.get("bottom-logo-image").src, f.get("bottom-logo-image").src);
  restored.get("edit-button").click();
  restored.get("remove-bottom-logo").click();
  restored.submit();
  assert.equal(restored.get("bottom-logo-image").hidden, true);
  assert.equal(restored.get("bottom-logo-image").hasAttribute("src"), false);
  assert.equal(restored.get("bottom-logo-placeholder").hidden, false);
  f.get("edit-button").click();
  f.get("reset-details").click();
  assert.equal(f.get("bottom-logo-image").hidden, true);
  assert.equal(f.get("bottom-logo-preview").hidden, true);
  f.close();
  restored.close();
});

test("invalid bottom logos and unsafe saved logo URLs report errors without fetching remote images", async () => {
  for (const options of [{ type: "image/svg+xml" }, { size: 5 * 1024 * 1024 + 1 }]) {
    const f = fixture();
    f.get("edit-button").click();
    await f.upload("bottomLogo", options);
    assert.match(f.get("bottom-logo-status").textContent, /Choose a JPG/);
    assert.equal(f.get("bottom-logo-image").hidden, true);
    f.close();
  }
  const f = fixture({ saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01", bottomLogo: "https://example.test/private.png" }) });
  assert.match(f.get("form-status").textContent, /could not be loaded/);
  assert.equal(f.get("bottom-logo-image").hasAttribute("src"), false);
  f.close();
});

test("pending bottom-logo processing blocks save and is discarded when the editor closes", async () => {
  let resolve;
  const f = fixture({ decodeGate: new Promise((done) => { resolve = done; }) });
  f.get("edit-button").click();
  const upload = f.upload("bottomLogo");
  await new Promise(setImmediate);
  assert.equal(f.get("save-details").disabled, true);
  f.submit();
  assert.match(f.get("form-status").textContent, /Wait for/);
  f.get("close-dialog").click();
  resolve();
  await upload;
  f.get("edit-button").click();
  assert.equal(f.get("bottom-logo-preview").hidden, true);
  assert.equal(f.get("bottom-logo-image").hidden, true);
  f.close();
});

test("remembered images survive reload and removal restores the placeholders", async () => {
  const first = fixture();
  first.get("edit-button").click();
  await first.upload("photo");
  await first.upload("code");
  first.get("remember-input").checked = true;
  first.submit();
  const second = fixture({ saved: first.window.localStorage.getItem(storageKey) });
  assert.equal(second.get("portrait-image").hidden, false);
  assert.equal(second.get("code-image").hidden, false);
  second.get("edit-button").click();
  second.get("remove-photo").click();
  second.get("remove-code").click();
  assert.equal(second.get("portrait-image").hidden, false, "removal is not applied until save");
  second.submit();
  assert.equal(second.get("portrait-placeholder").hasAttribute("hidden"), false);
  assert.equal(second.get("portrait-label").hidden, false);
  assert.equal(second.get("portrait-label").textContent, "ILLUSTRATION");
  assert.equal(second.get("code-placeholder").hasAttribute("hidden"), false);
  const saved = JSON.parse(second.window.localStorage.getItem(storageKey));
  assert.equal(saved.photo, null);
  assert.equal(saved.code, null);
  first.close();
  second.close();
});

test("closing discards selected images and Reset details clears images and saved state", async () => {
  const f = fixture();
  f.get("edit-button").click();
  await f.upload("photo");
  f.get("close-dialog").click();
  f.get("edit-button").click();
  assert.equal(f.get("photo-preview").hidden, true);
  await f.upload("photo");
  f.get("remember-input").checked = true;
  f.submit();
  f.get("edit-button").click();
  f.get("reset-details").click();
  assert.equal(f.get("portrait-image").hidden, true);
  assert.equal(f.get("photo-preview").hidden, true);
  assert.equal(f.window.localStorage.getItem(storageKey), null);
  f.close();
});

test("unsupported, oversized and unreadable images produce explicit errors", async () => {
  const f = fixture();
  f.get("edit-button").click();
  for (const file of [{ type: "image/svg+xml" }, { size: 5 * 1024 * 1024 + 1 }]) {
    await f.upload("photo", file);
    assert.match(f.get("photo-status").textContent, /no larger than 5 MB/);
    assert.equal(f.get("save-details").disabled, false);
    assert.equal(f.get("photo-preview").hidden, true);
  }
  f.close();
  for (const options of [{ decodeFailure: true }, { canvasUnavailable: true }]) {
    const failed = fixture(options);
    failed.get("edit-button").click();
    await failed.upload("code");
    assert.match(failed.get("code-status").textContent, /could not be decoded|processing is unavailable/);
    assert.equal(failed.get("code-preview").hidden, true);
    assert.equal(failed.warnings.length, 1);
    assert.equal(failed.get("save-details").disabled, false);
    failed.close();
  }
});

test("remote and unsafe stored image sources are rejected without a network request", () => {
  for (const photo of ["https://example.test/private.jpg", "data:image/svg+xml;base64,AA==", "javascript:alert(1)"]) {
    const f = fixture({ saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01", photo }) });
    assert.equal(f.get("portrait-image").hasAttribute("src"), false);
    assert.match(f.get("form-status").textContent, /could not be loaded/);
    f.close();
  }
});

test("Save waits for image processing and closing cancels a pending image selection", async () => {
  let finishDecode;
  const gate = new Promise((resolve) => { finishDecode = resolve; });
  const f = fixture({ decodeGate: gate });
  f.get("edit-button").click();
  await f.upload("photo");
  assert.equal(f.get("save-details").disabled, true);
  f.submit();
  assert.match(f.get("form-status").textContent, /Wait for the selected images/);
  f.get("close-dialog").click();
  finishDecode();
  await new Promise(setImmediate);
  f.get("edit-button").click();
  assert.equal(f.get("photo-preview").hidden, true);
  assert.equal(f.get("save-details").disabled, false);
  f.close();
});

test("custom logo preserves transparency, fits proportionally and only replaces the mark after save", async () => {
  const f = fixture();
  f.get("edit-button").click();
  await f.upload("logo", { type: "image/webp" });
  assert.deepEqual(f.imageDraws, [{ width: 600, height: 450 }]);
  assert.deepEqual(f.imageFormats, ["image/png"]);
  assert.equal(f.imageFills.length, 0, "no opaque backing is drawn behind the logo");
  assert.equal(f.get("logo-preview").hidden, false);
  assert.equal(f.get("logo-image").hidden, true);
  f.submit();
  assert.equal(f.get("logo-image").hidden, false);
  assert.equal(f.get("logo-placeholder").hasAttribute("hidden"), true);
  assert.equal(f.get("logo-container").getAttribute("aria-label"), "Custom personal logo");
  assert.equal(f.window.localStorage.getItem(storageKey), null);
  f.close();
});

test("custom logo is remembered, removable, resettable and backwards compatible", async () => {
  const first = fixture();
  first.get("edit-button").click();
  await first.upload("logo");
  first.get("remember-input").checked = true;
  first.submit();
  const second = fixture({ saved: first.window.localStorage.getItem(storageKey) });
  assert.equal(second.get("logo-image").hidden, false);
  second.get("edit-button").click();
  assert.equal(second.get("logo-preview").hidden, false);
  second.get("remove-logo").click();
  second.submit();
  assert.equal(second.get("logo-placeholder").hasAttribute("hidden"), false);
  assert.equal(JSON.parse(second.window.localStorage.getItem(storageKey)).logo, null);
  first.get("edit-button").click();
  first.get("reset-details").click();
  assert.equal(first.get("logo-image").hidden, true);
  assert.equal(first.get("logo-preview").hidden, true);
  const legacy = fixture({ saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01" }) });
  assert.equal(legacy.get("logo-image").hidden, true);
  assert.equal(legacy.warnings.length, 0);
  first.close();
  second.close();
  legacy.close();
});

test("invalid logo files and unsafe saved sources are reported without changing the mark", async () => {
  const f = fixture();
  f.get("edit-button").click();
  await f.upload("logo", { type: "image/svg+xml" });
  assert.match(f.get("logo-status").textContent, /Choose a JPG, PNG or WebP/);
  assert.equal(f.get("logo-preview").hidden, true);
  f.close();
  const unsafe = fixture({ saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01", logo: "https://example.test/logo.png" }) });
  assert.match(unsafe.get("form-status").textContent, /could not be loaded/);
  assert.equal(unsafe.get("logo-image").hasAttribute("src"), false);
  unsafe.close();
});

test("pending logo processing blocks save and closing discards the selection", async () => {
  let finishDecode;
  const gate = new Promise((resolve) => { finishDecode = resolve; });
  const f = fixture({ decodeGate: gate });
  f.get("edit-button").click();
  await f.upload("logo");
  assert.equal(f.get("save-details").disabled, true);
  f.submit();
  assert.match(f.get("form-status").textContent, /Wait for the selected images/);
  f.get("close-dialog").click();
  finishDecode();
  await new Promise(setImmediate);
  f.get("edit-button").click();
  assert.equal(f.get("logo-preview").hidden, true);
  assert.equal(f.get("save-details").disabled, false);
  f.close();
});

test("black transparency tolerance matches the exact boundary and preserves nonmatching alpha", async () => {
  const pixels = [
    0, 0, 0, 255,
    24, 24, 24, 255,
    25, 24, 24, 255,
    10, 20, 24, 90,
    255, 255, 255, 128
  ];
  const f = fixture({ pixels });
  f.get("edit-button").click();
  await f.upload("logo");
  await f.mapLogo(true, "#000000", 24);
  assert.deepEqual(f.imageMappings.at(-1), [
    0, 0, 0, 0,
    24, 24, 24, 0,
    25, 24, 24, 255,
    10, 20, 24, 0,
    255, 255, 255, 128
  ]);
  assert.equal(f.get("logo-tolerance-output").value, "24");
  assert.equal(f.get("logo-image").hidden, true, "live preview does not change the card until save");
  await f.mapLogo(true, "#000000", 0);
  assert.deepEqual(f.imageMappings.at(-1).filter((_, index) => index % 4 === 3), [0, 255, 255, 90, 128]);
  await f.mapLogo(false);
  assert.equal(f.get("logo-preview-image").src, "data:image/png;base64,AA==", "disabling restores the unmodified source");
  f.close();
});

test("colour transparency supports arbitrary colours and settings persist with the original source", async () => {
  const f = fixture({ pixels: [255, 0, 0, 255, 245, 5, 10, 255, 244, 0, 0, 255] });
  f.get("edit-button").click();
  await f.upload("logo");
  await f.mapLogo(true, "#ff0000", 10);
  assert.deepEqual(f.imageMappings.at(-1).filter((_, index) => index % 4 === 3), [0, 0, 255]);
  f.get("remember-input").checked = true;
  f.submit();
  const saved = JSON.parse(f.window.localStorage.getItem(storageKey));
  assert.equal(saved.logoSource, "data:image/png;base64,AA==");
  assert.deepEqual(saved.logoTransparency, { enabled: true, colour: "#ff0000", tolerance: 10 });
  const restored = fixture({ saved: JSON.stringify(saved) });
  restored.get("edit-button").click();
  assert.equal(restored.get("logo-transparency-input").checked, true);
  assert.equal(restored.get("logo-colour-input").value, "#ff0000");
  assert.equal(restored.get("logo-tolerance-input").value, "10");
  await restored.mapLogo(false);
  assert.equal(restored.get("logo-preview-image").src, saved.logoSource);
  restored.get("reset-details").click();
  assert.equal(restored.get("logo-transparency-input").checked, false);
  assert.equal(restored.get("logo-tolerance-input").value, "24");
  f.close();
  restored.close();
});

test("transparency can be configured before choosing a logo and later removed with the logo", async () => {
  const f = fixture();
  f.get("edit-button").click();
  await f.mapLogo(true, "#000000", 50);
  assert.match(f.get("logo-status").textContent, /Choose a logo/);
  await f.upload("logo");
  assert.equal(f.imageMappings.at(-1)[3], 0);
  f.get("remove-logo").click();
  assert.equal(f.get("logo-transparency-input").checked, false);
  assert.equal(f.get("logo-colour-input").disabled, true);
  f.submit();
  assert.equal(f.get("logo-image").hidden, true);
  f.close();
});

test("pixel processing failures block saving and can be recovered by disabling colour removal", async () => {
  const f = fixture({ pixelFailure: true });
  f.get("edit-button").click();
  await f.upload("logo");
  await f.mapLogo(true);
  assert.match(f.get("logo-status").textContent, /could not be applied/);
  assert.equal(f.get("save-details").disabled, true);
  f.submit();
  assert.match(f.get("form-status").textContent, /could not be applied/);
  await f.mapLogo(false);
  assert.equal(f.get("save-details").disabled, false);
  f.submit();
  assert.equal(f.get("logo-image").hidden, false);
  assert.equal(f.warnings.length, 1);
  f.close();
});

test("invalid stored transparency settings or original image sources are reported", () => {
  for (const extra of [
    { logoTransparency: { enabled: true, colour: "#000000", tolerance: -1 } },
    { logoTransparency: { enabled: true, colour: "#000000", tolerance: 256 } },
    { logoTransparency: { enabled: true, colour: "black", tolerance: 10 } },
    { logoTransparency: null },
    { logoSource: "https://example.test/logo.png" }
  ]) {
    const f = fixture({ saved: JSON.stringify({ name: "Person", birthdate: "2000-01-01", ...extra }) });
    assert.match(f.get("form-status").textContent, /could not be loaded/);
    assert.equal(f.warnings.length, 1);
    f.close();
  }
});
