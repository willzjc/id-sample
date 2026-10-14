(() => {
  "use strict";

  const storageKey = "id-sample-card-details-v1";
  const card = document.getElementById("digital-card");
  const motionButton = document.getElementById("motion-button");
  const motionLabel = document.getElementById("motion-button-label");
  const motionStatus = document.getElementById("motion-status");
  const motionNotice = document.getElementById("motion-notice");
  const motionRetry = document.getElementById("motion-retry");
  const skipMotion = document.getElementById("skip-motion");
  const mobileDevice = window.matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
  const dialog = document.getElementById("details-dialog");
  const form = document.getElementById("details-form");
  const nameInput = document.getElementById("name-input");
  const bannerTitleInput = document.getElementById("banner-title-input");
  const birthdateInput = document.getElementById("birthdate-input");
  const profileNumberInput = document.getElementById("profile-number-input");
  const expiryInput = document.getElementById("expiry-input");
  const refreshedInput = document.getElementById("refreshed-input");
  const classInput = document.getElementById("class-input");
  const conditionsInput = document.getElementById("conditions-input");
  const rememberInput = document.getElementById("remember-input");
  const formStatus = document.getElementById("form-status");
  const saveButton = document.getElementById("save-details");
  const logoTransparencyInput = document.getElementById("logo-transparency-input");
  const logoColourInput = document.getElementById("logo-colour-input");
  const logoToleranceInput = document.getElementById("logo-tolerance-input");
  const logoToleranceOutput = document.getElementById("logo-tolerance-output");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const formatter = new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const timeFormatter = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
  const today = new Date();
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const defaults = {
    bannerTitle: "Template License",
    name: "Will Chin",
    birthdate: "1991-10-14",
    profileNumber: "SAMPLE-0001",
    cardNumber: "SAMPLE-0002",
    expiry: "2030-12-31",
    refreshed: `${maxDate}T${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`,
    class: "C",
    conditions: "None",
    refreshedLabel: "Refreshed",
    profileNumberLabel: "Licence Number",
    cardNumberLabel: "Card Number",
    expiryLabel: "Expiry",
    birthdateLabel: "Date of birth",
    classLabel: "Class",
    conditionsLabel: "Conditions",
    photo: null,
    code: null,
    logo: null,
    bottomLogo: null,
    logoSource: null,
    logoTransparency: { enabled: false, colour: "#000000", tolerance: 24 }
  };
  birthdateInput.max = maxDate;
  let details = { ...defaults };
  let remembered = false;
  const imageTargets = { photo: "portrait", code: "code", logo: "logo", bottomLogo: "bottom-logo" };
  const imageKinds = Object.keys(imageTargets);
  const imageControlId = (kind) => kind === "bottomLogo" ? "bottom-logo" : kind;
  let pendingImages = Object.fromEntries(imageKinds.map((kind) => [kind, null]));
  let pendingLogoSource = null;
  let pendingLogoTransparency = { ...defaults.logoTransparency };
  let logoLoading = false;
  let logoError = false;
  let editorVersion = 0;
  const imageVersions = Object.fromEntries(imageKinds.map((kind) => [kind, 0]));
  const imageBusy = Object.fromEntries(imageKinds.map((kind) => [kind, false]));
  const permittedSensors = new Set();
  let motionPromptShown = false;
  let motionSkipped = false;
  let pageActive = true;
  let sensorType = null;
  let retrySensorType = null;
  let pendingSensor = null;
  let baseline = null;
  let sensorTimeout = null;
  let sensorReceived = false;
  let requesting = false;
  let requestVersion = 0;
  let frame = null;
  let target = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };

  const clamp = (value) => Math.max(-1, Math.min(1, value));
  const labelFields = [
    { key: "refreshedLabel", id: "refreshed", label: "refreshed label" },
    { key: "profileNumberLabel", id: "profile-number", label: "licence number label" },
    { key: "cardNumberLabel", id: "card-number", label: "card number label" },
    { key: "expiryLabel", id: "expiry", label: "expiry label" },
    { key: "birthdateLabel", id: "birthdate", label: "birthdate label" },
    { key: "classLabel", id: "class", label: "class label" },
    { key: "conditionsLabel", id: "conditions", label: "conditions label" }
  ].map((field) => ({ ...field, input: document.getElementById(`${field.id}-label-input`), limit: 48 }));
  const textFields = [
    { key: "bannerTitle", input: bannerTitleInput, limit: 64, label: "banner title" },
    { key: "name", input: nameInput, limit: 64, label: "display name" },
    { key: "profileNumber", input: profileNumberInput, limit: 32, label: "licence number" },
    { key: "cardNumber", input: document.getElementById("card-number-input"), limit: 32, label: "card number" },
    { key: "class", input: classInput, limit: 32, label: "class" },
    { key: "conditions", input: conditionsInput, limit: 160, label: "conditions (use None when there are no conditions)" },
    ...labelFields
  ];

  function validText(value, limit) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
  }

  function validRefreshed(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || value < "1900-01-01T00:00") return false;
    const date = new Date(`${value}:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value;
  }

  function validCalendarDate(value, maximum) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > maximum) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validImage(value) {
    return value === null || value === undefined || (typeof value === "string" && value.length <= 2000000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
  }

  function validLogoTransparency(value) {
    return value && typeof value.enabled === "boolean" && typeof value.colour === "string" && /^#[0-9a-f]{6}$/i.test(value.colour) && Number.isInteger(value.tolerance) && value.tolerance >= 0 && value.tolerance <= 255;
  }

  function validateDetails(value) {
    if (!value || typeof value.name !== "string" || typeof value.birthdate !== "string") return false;
    if (!textFields.every((field) => validText(value[field.key], field.limit)) || !validRefreshed(value.refreshed)) return false;
    if (!imageKinds.every((kind) => validImage(value[kind]))) return false;
    if (!validImage(value.logoSource) || !validLogoTransparency(value.logoTransparency)) return false;
    return validCalendarDate(value.birthdate, maxDate) && validCalendarDate(value.expiry, "9999-12-31");
  }

  function renderDetails() {
    for (const field of labelFields) {
      document.getElementById(`display-${field.id}-label`).textContent = details[field.key];
    }
    document.getElementById("card-heading").textContent = details.bannerTitle;
    document.getElementById("card-heading").title = details.bannerTitle;
    document.title = `${details.bannerTitle} | Interactive prototype`;
    document.getElementById("display-name").textContent = details.name;
    document.getElementById("display-birthdate").textContent = formatter.format(new Date(`${details.birthdate}T00:00:00Z`));
    document.getElementById("display-profile-number").textContent = details.profileNumber;
    document.getElementById("display-card-number").textContent = details.cardNumber;
    document.getElementById("display-expiry").textContent = formatter.format(new Date(`${details.expiry}T00:00:00Z`));
    const refreshed = new Date(`${details.refreshed}:00Z`);
    document.getElementById("display-refreshed").dateTime = details.refreshed;
    document.getElementById("display-refreshed-date").textContent = formatter.format(refreshed);
    document.getElementById("display-refreshed-time").textContent = timeFormatter.format(refreshed).replace(/\s/g, "").toLowerCase();
    document.getElementById("display-class").textContent = details.class;
    document.getElementById("display-conditions").textContent = details.conditions;
    for (const kind of imageKinds) {
      const image = document.getElementById(`${imageTargets[kind]}-image`);
      const placeholder = document.getElementById(`${imageTargets[kind]}-placeholder`);
      image.hidden = !details[kind];
      placeholder.toggleAttribute("hidden", Boolean(details[kind]));
      if (details[kind]) image.src = details[kind];
      else image.removeAttribute("src");
    }
    document.getElementById("portrait-label").hidden = Boolean(details.photo);
    document.getElementById("portrait-container").setAttribute("aria-label", details.photo ? "Personal photo" : "Illustrated placeholder portrait");
    document.getElementById("code-label").textContent = details.code ? "PERSONAL CODE / NOT OFFICIAL" : "DECORATIVE ONLY";
    document.getElementById("code-container").setAttribute("aria-label", details.code ? "User-selected personal code. Not official ID verification." : "Decorative pattern. Not a QR code.");
    document.getElementById("logo-container").setAttribute("aria-label", details.logo ? "Custom personal logo" : "Personal card concept");
    const secondaryPortrait = document.getElementById("secondary-portrait-image");
    secondaryPortrait.hidden = !details.photo;
    if (details.photo) secondaryPortrait.src = details.photo;
    else secondaryPortrait.removeAttribute("src");
  }

  function renderImageEditor(kind) {
    const value = pendingImages[kind];
    const id = imageControlId(kind);
    const preview = document.getElementById(`${id}-preview-image`);
    document.getElementById(`${id}-preview`).hidden = !value;
    document.getElementById(`remove-${id}`).hidden = !value;
    if (value) preview.src = value;
    else preview.removeAttribute("src");
    saveButton.disabled = imageKinds.some((kind) => imageBusy[kind]) || logoError;
    logoTransparencyInput.disabled = logoLoading;
    logoColourInput.disabled = logoLoading || !logoTransparencyInput.checked;
    logoToleranceInput.disabled = logoLoading || !logoTransparencyInput.checked;
  }

  function fillLogoControls() {
    logoTransparencyInput.checked = pendingLogoTransparency.enabled;
    logoColourInput.value = pendingLogoTransparency.colour;
    logoToleranceInput.value = String(pendingLogoTransparency.tolerance);
    logoToleranceOutput.value = String(pendingLogoTransparency.tolerance);
  }

  function resetImageEditor() {
    editorVersion += 1;
    pendingImages = Object.fromEntries(imageKinds.map((kind) => [kind, details[kind]]));
    pendingLogoSource = details.logoSource ?? details.logo;
    pendingLogoTransparency = { ...details.logoTransparency };
    logoLoading = false;
    logoError = false;
    fillLogoControls();
    for (const kind of imageKinds) {
      imageBusy[kind] = false;
      const id = imageControlId(kind);
      document.getElementById(`${id}-input`).value = "";
      document.getElementById(`${id}-status`).textContent = "";
      renderImageEditor(kind);
    }
  }

  function fillEditor() {
    for (const field of textFields) {
      field.input.value = details[field.key];
      field.input.setCustomValidity("");
    }
    birthdateInput.value = details.birthdate;
    expiryInput.value = details.expiry;
    refreshedInput.value = details.refreshed;
    birthdateInput.setCustomValidity("");
    expiryInput.setCustomValidity("");
    refreshedInput.setCustomValidity("");
    rememberInput.checked = remembered;
    resetImageEditor();
  }

  async function prepareImage(file, kind) {
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result), { once: true });
      reader.addEventListener("error", () => reject(reader.error ?? new Error("The image could not be read.")), { once: true });
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = source;
    await image.decode();
    const limit = { photo: 1200, code: 1600, logo: 600, bottomLogo: 600 }[kind];
    const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    // Both logos keep alpha; photos and codes retain a white backing.
    if (kind !== "logo" && kind !== "bottomLogo") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL(kind === "photo" ? "image/jpeg" : "image/png", 0.86);
    if (!validImage(data)) throw new Error("The image is too large after processing. Choose a smaller or simpler image.");
    return data;
  }

  async function mapLogoColour(source, settings) {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Logo transparency processing is unavailable in this browser.");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const channels = [1, 3, 5].map((offset) => parseInt(settings.colour.slice(offset, offset + 2), 16));
    // Match each RGB channel within tolerance, preserving all nonmatching alpha.
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (channels.every((channel, index) => Math.abs(pixels.data[i + index] - channel) <= settings.tolerance)) {
        pixels.data[i + 3] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
    const data = canvas.toDataURL("image/png");
    if (!validImage(data)) throw new Error("The processed logo is too large. Choose a smaller or simpler logo.");
    return data;
  }

  async function refreshLogo() {
    const selection = ++imageVersions.logo;
    const version = editorVersion;
    const settings = {
      enabled: logoTransparencyInput.checked,
      colour: logoColourInput.value,
      tolerance: Number(logoToleranceInput.value)
    };
    const source = pendingLogoSource;
    const status = document.getElementById("logo-status");
    logoToleranceOutput.value = String(settings.tolerance);
    logoError = false;
    imageBusy.logo = Boolean(source);
    renderImageEditor("logo");
    if (!validLogoTransparency(settings)) {
      logoError = true;
      imageBusy.logo = false;
      status.textContent = "Choose a valid colour and a tolerance between 0 and 255.";
      renderImageEditor("logo");
      return;
    }
    if (!source) {
      pendingLogoTransparency = settings;
      status.textContent = "Choose a logo to preview the transparency settings.";
      return;
    }
    status.textContent = "Updating logo transparency on your device...";
    try {
      const data = settings.enabled ? await mapLogoColour(source, settings) : source;
      if (version !== editorVersion || selection !== imageVersions.logo) return;
      pendingImages.logo = data;
      pendingLogoTransparency = settings;
      status.textContent = "Ready. Save changes to apply this logo.";
    } catch (error) {
      console.warn("Could not apply logo colour transparency.", error);
      if (version === editorVersion && selection === imageVersions.logo) {
        logoError = true;
        status.textContent = "Logo transparency could not be applied. Turn off colour removal or choose another logo.";
      }
    } finally {
      if (version === editorVersion && selection === imageVersions.logo) {
        imageBusy.logo = false;
        renderImageEditor("logo");
      }
    }
  }

  logoTransparencyInput.addEventListener("change", refreshLogo);
  logoColourInput.addEventListener("input", refreshLogo);
  logoToleranceInput.addEventListener("input", refreshLogo);

  for (const kind of imageKinds) {
    const id = imageControlId(kind);
    const input = document.getElementById(`${id}-input`);
    const status = document.getElementById(`${id}-status`);
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      const selection = ++imageVersions[kind];
      const version = editorVersion;
      if (kind === "logo") {
        logoLoading = false;
        logoError = false;
      }
      imageBusy[kind] = false;
      renderImageEditor(kind);
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        status.textContent = "Choose a JPG, PNG or WebP image no larger than 5 MB.";
        input.value = "";
        return;
      }
      imageBusy[kind] = true;
      if (kind === "logo") logoLoading = true;
      status.textContent = "Preparing image on your device...";
      renderImageEditor(kind);
      try {
        const data = await prepareImage(file, kind);
        if (version !== editorVersion || selection !== imageVersions[kind]) return;
        if (kind === "logo") {
          pendingLogoSource = data;
          logoLoading = false;
          await refreshLogo();
        } else {
          pendingImages[kind] = data;
          status.textContent = "Ready. Save changes to apply this image.";
        }
      } catch (error) {
        console.warn(`Could not prepare personal ${kind} image.`, error);
        if (version === editorVersion && selection === imageVersions[kind]) status.textContent = error instanceof Error ? error.message : "This image could not be opened. Choose another image.";
      } finally {
        if (version === editorVersion && selection === imageVersions[kind]) {
          if (kind === "logo") logoLoading = false;
          imageBusy[kind] = false;
          renderImageEditor(kind);
        }
      }
    });
    document.getElementById(`remove-${id}`).addEventListener("click", () => {
      imageVersions[kind] += 1;
      imageBusy[kind] = false;
      pendingImages[kind] = null;
      if (kind === "logo") {
        pendingLogoSource = null;
        pendingLogoTransparency = { ...defaults.logoTransparency };
        logoLoading = false;
        logoError = false;
        fillLogoControls();
      }
      input.value = "";
      status.textContent = "Image removed. Save changes to apply.";
      renderImageEditor(kind);
    });
  }

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.name !== "string" || typeof parsed.birthdate !== "string") throw new Error("Saved card details are invalid.");
      const restored = { ...defaults, ...parsed };
      if (!validateDetails(restored)) throw new Error("Saved card details are invalid.");
      details = {
        ...Object.fromEntries(textFields.map((field) => [field.key, restored[field.key].trim()])),
        birthdate: restored.birthdate,
        expiry: restored.expiry,
        refreshed: restored.refreshed,
        ...Object.fromEntries(imageKinds.map((kind) => [kind, restored[kind] ?? null])),
        logoSource: restored.logoSource ?? null,
        logoTransparency: { ...restored.logoTransparency }
      };
      remembered = true;
    }
  } catch (error) {
    console.warn("Could not restore personal card details.", error);
    formStatus.textContent = "Saved details could not be loaded. Sample details are shown; reset details to clear the saved copy.";
  }
  renderDetails();

  document.getElementById("edit-button").addEventListener("click", () => {
    fillEditor();
    dialog.showModal();
  });
  document.getElementById("close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    editorVersion += 1;
    for (const kind of imageKinds) imageBusy[kind] = false;
    logoLoading = false;
    logoError = false;
    saveButton.disabled = false;
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dialog.close();
    }
  });
  for (const input of [...textFields.map((field) => field.input), birthdateInput, expiryInput, refreshedInput]) {
    input.addEventListener("input", () => input.setCustomValidity(""));
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (imageKinds.some((kind) => imageBusy[kind])) {
      formStatus.textContent = "Wait for the selected images to finish preparing.";
      return;
    }
    if (logoError) {
      formStatus.textContent = "Logo transparency could not be applied. Turn off colour removal or choose another logo.";
      return;
    }
    const updated = {
      ...Object.fromEntries(textFields.map((field) => [field.key, field.input.value.trim()])),
      birthdate: birthdateInput.value,
      expiry: expiryInput.value,
      refreshed: refreshedInput.value,
      ...pendingImages,
      logoSource: pendingLogoSource === pendingImages.logo ? null : pendingLogoSource,
      logoTransparency: { ...pendingLogoTransparency }
    };
    for (const field of textFields) {
      if (!validText(updated[field.key], field.limit)) {
        field.input.setCustomValidity(`Enter a ${field.label}, up to ${field.limit} characters, without control characters.`);
        field.input.reportValidity();
        return;
      }
    }
    if (!validRefreshed(updated.refreshed)) {
      refreshedInput.setCustomValidity("Enter a real date and time from 1 January 1900 onwards.");
      refreshedInput.reportValidity();
      return;
    }
    if (!validCalendarDate(updated.expiry, "9999-12-31")) {
      expiryInput.setCustomValidity("Enter a real expiry date between 1 January 1900 and 31 December 9999.");
      expiryInput.reportValidity();
      return;
    }
    if (!validateDetails(updated)) {
      birthdateInput.setCustomValidity("Enter a real birthdate between 1 January 1900 and today.");
      birthdateInput.reportValidity();
      return;
    }
    try {
      if (rememberInput.checked) window.localStorage.setItem(storageKey, JSON.stringify(updated));
      else window.localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Could not update personal card storage.", error);
      formStatus.textContent = "Browser storage is unavailable or full. Changes apply to this page only; any previously saved details could not be cleared. Try smaller images or disable Remember on this device.";
      details = updated;
      remembered = false;
      renderDetails();
      return;
    }
    details = updated;
    remembered = rememberInput.checked;
    renderDetails();
    formStatus.textContent = "";
    dialog.close();
  });

  document.getElementById("reset-details").addEventListener("click", () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn("Could not clear personal card storage.", error);
      formStatus.textContent = "Saved details could not be cleared. Allow browser storage and try again.";
      return;
    }
    details = { ...defaults };
    remembered = false;
    renderDetails();
    fillEditor();
    formStatus.textContent = "Sample details restored and the saved copy removed.";
  });

  function paint() {
    card.style.setProperty("--tilt-x", current.x.toFixed(4));
    card.style.setProperty("--tilt-y", current.y.toFixed(4));
    card.style.setProperty("--light-x", `${50 + current.x * 32}%`);
    card.style.setProperty("--light-y", `${50 + current.y * 32}%`);
    card.style.setProperty("--hue", `${current.x * 65 + current.y * 35}deg`);
  }

  function animate() {
    frame = null;
    if (reducedMotion.matches || document.hidden) return;
    current.x += (target.x - current.x) * 0.12;
    current.y += (target.y - current.y) * 0.12;
    if (Math.abs(target.x - current.x) + Math.abs(target.y - current.y) < 0.002) {
      current = { ...target };
    } else {
      frame = window.requestAnimationFrame(animate);
    }
    paint();
  }

  function moveLight(x, y) {
    if (reducedMotion.matches || document.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return;
    target = { x: clamp(x), y: clamp(y) };
    if (frame === null) frame = window.requestAnimationFrame(animate);
  }

  function resetLight() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    target = { x: 0, y: 0 };
    current = { ...target };
    paint();
  }

  function sensorCoordinates(x, y) {
    const angle = (window.screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
    return { x: x * Math.cos(angle) + y * Math.sin(angle), y: y * Math.cos(angle) - x * Math.sin(angle) };
  }

  function showMotionStatus(message) {
    motionStatus.textContent = message;
    motionNotice.hidden = false;
  }

  document.getElementById("dismiss-motion-notice").addEventListener("click", () => {
    if (!skipMotion.hidden) {
      motionSkipped = true;
      motionButton.hidden = true;
    }
    skipMotion.hidden = true;
    motionNotice.hidden = true;
  });
  skipMotion.addEventListener("click", () => {
    motionSkipped = true;
    skipMotion.hidden = true;
    motionButton.hidden = true;
    motionNotice.hidden = true;
  });

  function sensorApi(type) {
    return type === "devicemotion" ? window.DeviceMotionEvent : window.DeviceOrientationEvent;
  }

  function acknowledgeSensor() {
    if (sensorReceived) return;
    sensorReceived = true;
    window.clearTimeout(sensorTimeout);
    showMotionStatus(`Motion is on (${sensorType === "devicemotion" ? "accelerometer" : "orientation"}). Tilt your phone to shift the light.`);
  }

  function orientationChanged(event) {
    if (document.hidden || reducedMotion.matches || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
    acknowledgeSensor();
    if (!baseline) baseline = { x: event.gamma, y: event.beta };
    // Use the shortest angle so crossing +/-180 degrees does not flash the pattern.
    const difference = (value, origin) => ((value - origin + 540) % 360) - 180;
    const position = sensorCoordinates(difference(event.gamma, baseline.x) / 28, difference(event.beta, baseline.y) / 28);
    moveLight(position.x, position.y);
  }

  function accelerationChanged(event) {
    const gravity = event.accelerationIncludingGravity;
    if (document.hidden || reducedMotion.matches || !gravity || ![gravity.x, gravity.y, gravity.z].every(Number.isFinite) || Math.hypot(gravity.x, gravity.y, gravity.z) < 0.5) return;
    acknowledgeSensor();
    if (!baseline) baseline = { x: gravity.x, y: gravity.y };
    const position = sensorCoordinates((gravity.x - baseline.x) / 5, (gravity.y - baseline.y) / 5);
    moveLight(position.x, position.y);
  }

  function stopSensors(message) {
    requestVersion += 1;
    window.removeEventListener("deviceorientation", orientationChanged);
    window.removeEventListener("devicemotion", accelerationChanged);
    window.clearTimeout(sensorTimeout);
    sensorType = null;
    retrySensorType = null;
    pendingSensor = null;
    baseline = null;
    sensorReceived = false;
    motionButton.setAttribute("aria-pressed", "false");
    motionLabel.textContent = "Enable motion";
    motionButton.hidden = !mobileDevice || reducedMotion.matches;
    skipMotion.hidden = true;
    motionRetry.hidden = true;
    showMotionStatus(message);
    resetLight();
  }

  function offerSensorRetry(type, message) {
    stopSensors(message);
    retrySensorType = type;
    const label = type === "devicemotion" ? "Try accelerometer" : "Try orientation";
    motionLabel.textContent = label;
    motionRetry.textContent = label;
    motionRetry.hidden = false;
    motionButton.hidden = true;
  }

  function startSensor(type, alternative = null) {
    sensorType = type;
    pendingSensor = null;
    baseline = null;
    sensorReceived = false;
    window.addEventListener(type, type === "deviceorientation" ? orientationChanged : accelerationChanged);
    motionButton.setAttribute("aria-pressed", "true");
    motionLabel.textContent = "Disable motion";
    motionButton.hidden = true;
    skipMotion.hidden = true;
    motionRetry.hidden = true;
    showMotionStatus(`Waiting for your phone's ${type === "devicemotion" ? "accelerometer" : "orientation sensor"}...`);
    sensorTimeout = window.setTimeout(() => {
      if (alternative && typeof sensorApi(alternative)?.requestPermission !== "function") {
        window.removeEventListener(type, type === "deviceorientation" ? orientationChanged : accelerationChanged);
        startSensor(alternative);
      } else if (alternative) {
        offerSensorRetry(alternative, "No motion data received. Try the other sensor below; Safari may ask for permission again.");
      } else {
        stopSensors("No motion data received. In Safari, check this website's Motion & Orientation permission, then reload and choose Enable motion. You can also drag the card.");
      }
    }, 5000);
  }

  async function enableMotion() {
    if (requesting) return;
    if (sensorType) {
      stopSensors("Motion is off. Move your pointer or drag the card instead.");
      return;
    }
    if (reducedMotion.matches) {
      showMotionStatus("Animation is paused because Reduce Motion is enabled in your device settings.");
      return;
    }
    if (!window.isSecureContext) {
      showMotionStatus("Phone motion requires HTTPS. Open the GitHub Pages URL, or drag the card instead.");
      return;
    }
    const types = ["devicemotion", "deviceorientation"].filter((type) => sensorApi(type));
    const type = retrySensorType ?? types[0];
    const alternative = retrySensorType ? null : types.find((candidate) => candidate !== type) ?? null;
    retrySensorType = null;
    if (!type) {
      showMotionStatus("Motion sensors aren't supported here. Open this page directly in Safari, or drag the card instead.");
      return;
    }
    const api = sensorApi(type);
    const version = ++requestVersion;
    requesting = true;
    motionSkipped = false;
    motionButton.hidden = true;
    skipMotion.hidden = true;
    motionButton.disabled = true;
    motionRetry.disabled = true;
    showMotionStatus("Allow Motion & Orientation when Safari asks, then tilt your phone.");
    try {
      // iOS requires this call directly inside a user-initiated event.
      const permission = permittedSensors.has(type) || typeof api.requestPermission !== "function" ? "granted" : await api.requestPermission();
      if (permission === "granted") permittedSensors.add(type);
      if (version !== requestVersion || reducedMotion.matches) return;
      if (permission !== "granted") {
        const message = "Motion permission wasn't granted. You can still drag the card to shift the light.";
        if (alternative) offerSensorRetry(alternative, message);
        else stopSensors(message);
        return;
      }
      if (document.hidden) {
        pendingSensor = { type, alternative };
        showMotionStatus("Motion permission granted. Return to this page to start the sensor.");
      } else {
        startSensor(type, alternative);
      }
    } catch (error) {
      console.warn("Could not enable phone motion.", error);
      if (version === requestVersion) {
        const message = "Motion couldn't be enabled. Check browser permissions, or drag the card instead.";
        if (alternative) offerSensorRetry(alternative, message);
        else stopSensors(message);
      }
    } finally {
      requesting = false;
      motionButton.disabled = false;
      motionRetry.disabled = false;
      if (version !== requestVersion && permittedSensors.has(type)) startMobileMotion();
    }
  }
  motionButton.addEventListener("click", enableMotion);
  motionRetry.addEventListener("click", enableMotion);

  function startMobileMotion() {
    if (!mobileDevice || !pageActive || motionSkipped || reducedMotion.matches || document.hidden || requesting || sensorType) return;
    const type = ["devicemotion", "deviceorientation"].find((candidate) => sensorApi(candidate));
    if (window.isSecureContext && type && typeof sensorApi(type).requestPermission === "function" && !permittedSensors.has(type)) {
      if (!motionPromptShown) {
        motionPromptShown = true;
        motionButton.hidden = false;
        skipMotion.hidden = false;
        showMotionStatus("Enable phone motion? Safari needs your permission before tilting can animate the background. Choose Enable motion, then Allow.");
      }
      return;
    }
    void enableMotion();
  }

  function pointerMoved(event) {
    if (sensorType || (event.pointerType !== "mouse" && event.buttons === 0)) return;
    const rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    moveLight(((event.clientX - rect.left) / rect.width - 0.5) * 2, ((event.clientY - rect.top) / rect.height - 0.5) * 2);
  }
  card.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") card.setPointerCapture(event.pointerId);
    pointerMoved(event);
  });
  card.addEventListener("pointermove", pointerMoved);
  card.addEventListener("pointerleave", () => { if (!sensorType) moveLight(0, 0); });
  card.addEventListener("pointerup", () => { if (!sensorType) moveLight(0, 0); });
  card.addEventListener("pointercancel", () => { if (!sensorType) moveLight(0, 0); });
  card.style.touchAction = "pan-y";

  function screenChanged() {
    baseline = null;
    resetLight();
  }
  window.screen.orientation?.addEventListener("change", screenChanged);
  window.addEventListener("orientationchange", screenChanged);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) stopSensors("Animation is paused because Reduce Motion is enabled in your device settings.");
    else {
      showMotionStatus("Move your pointer or drag the card to shift the light.");
      startMobileMotion();
    }
  });
  document.addEventListener("visibilitychange", () => {
    // Safari permission UI can briefly hide the page; do not cancel its request.
    if (document.hidden && !requesting && !pendingSensor && (sensorType || frame !== null)) {
      stopSensors("Motion is off after leaving the page. Tap Enable motion to resume.");
    } else if (!document.hidden && pendingSensor) {
      startSensor(pendingSensor.type, pendingSensor.alternative);
    } else if (!document.hidden) {
      startMobileMotion();
    }
  });
  window.addEventListener("pagehide", () => {
    pageActive = false;
    if (sensorType || requesting || pendingSensor || frame !== null) {
      stopSensors("Motion is off. Tap Enable motion to resume.");
    }
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
    startMobileMotion();
  });
  if (reducedMotion.matches) showMotionStatus("Animation is paused because Reduce Motion is enabled in your device settings.");
  else startMobileMotion();
})();
