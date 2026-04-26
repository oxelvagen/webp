const FORMAT_CANDIDATES = [
  { mimeType: "image/png", extension: "png", label: "PNG", usesQuality: false },
  { mimeType: "image/jpeg", extension: "jpg", label: "JPG", usesQuality: true },
  { mimeType: "image/webp", extension: "webp", label: "WEBP", usesQuality: true },
  { mimeType: "image/avif", extension: "avif", label: "AVIF", usesQuality: true }
];

const DEFAULT_BACKGROUND_COLOR = "#ffffff";
const PREVIEW_MAX_EDGE = 980;
const MAX_OUTPUT_EDGE = 16000;

const state = {
  selectedSource: null,
  decodedImage: null,
  availableFormats: [],
  pageImages: [],
  currentSelectedPageImageUrl: null,
  baseName: "bild",
  previewRenderHandle: 0,
  edit: createEmptyEditState()
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();

  state.availableFormats = detectSupportedFormats();
  populateFormatOptions();
  updateQualityVisibility();
  updateBackgroundVisibility();
  updateFormatNote();
  updateFormState();

  window.addEventListener("beforeunload", releasePreviousSource);

  const searchParams = new URLSearchParams(window.location.search);
  const pendingImageUrl = searchParams.get("imageUrl");
  const pendingSourceName = searchParams.get("sourceName");

  if (pendingImageUrl) {
    await loadRemoteImage(pendingImageUrl, pendingSourceName || extractNameFromUrl(pendingImageUrl));
  }
});

function createEmptyEditState() {
  return {
    cropEnabled: false,
    cropX: 0,
    cropY: 0,
    cropWidth: 0,
    cropHeight: 0,
    resizeEnabled: false,
    resizeWidth: 0,
    resizeHeight: 0,
    lockAspectRatio: true,
    rotation: 0,
    flipX: false,
    flipY: false,
    backgroundColor: DEFAULT_BACKGROUND_COLOR
  };
}

function bindElements() {
  elements.dropzone = document.getElementById("dropzone");
  elements.fileInput = document.getElementById("file-input");
  elements.openPageImagesButton = document.getElementById("open-page-images");
  elements.pageImagesWrap = document.getElementById("page-images-wrap");
  elements.pageImageCount = document.getElementById("page-image-count");
  elements.pageImages = document.getElementById("page-images");
  elements.sourceMeta = document.getElementById("source-meta");
  elements.sourceBadge = document.getElementById("source-badge");
  elements.imageDimensions = document.getElementById("image-dimensions");
  elements.outputDimensions = document.getElementById("output-dimensions");
  elements.previewFrame = document.querySelector(".preview-frame");
  elements.previewCanvas = document.getElementById("preview-canvas");
  elements.previewEmpty = document.getElementById("preview-empty");
  elements.editSummary = document.getElementById("edit-summary");
  elements.statusPill = document.getElementById("status-pill");
  elements.cropEnabled = document.getElementById("crop-enabled");
  elements.cropControls = document.getElementById("crop-controls");
  elements.cropPresets = document.getElementById("crop-presets");
  elements.cropX = document.getElementById("crop-x");
  elements.cropY = document.getElementById("crop-y");
  elements.cropWidth = document.getElementById("crop-width");
  elements.cropHeight = document.getElementById("crop-height");
  elements.resizeEnabled = document.getElementById("resize-enabled");
  elements.resizeControls = document.getElementById("resize-controls");
  elements.resizePresets = document.getElementById("resize-presets");
  elements.resizeWidth = document.getElementById("resize-width");
  elements.resizeHeight = document.getElementById("resize-height");
  elements.resizeLock = document.getElementById("resize-lock");
  elements.rotationSelect = document.getElementById("rotation-select");
  elements.flipX = document.getElementById("flip-x");
  elements.flipY = document.getElementById("flip-y");
  elements.resetEditsButton = document.getElementById("reset-edits");
  elements.formatSelect = document.getElementById("format-select");
  elements.filenameInput = document.getElementById("filename-input");
  elements.qualityField = document.getElementById("quality-field");
  elements.qualityInput = document.getElementById("quality-input");
  elements.qualityValue = document.getElementById("quality-value");
  elements.backgroundField = document.getElementById("background-field");
  elements.backgroundColor = document.getElementById("background-color");
  elements.formatNote = document.getElementById("format-note");
  elements.downloadButton = document.getElementById("download-button");
  elements.statusMessage = document.getElementById("status-message");
}

function bindEvents() {
  elements.fileInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    await loadLocalFile(file);
  });

  elements.openPageImagesButton.addEventListener("click", loadImagesFromActiveTab);
  elements.formatSelect.addEventListener("change", handleFormatChange);
  elements.filenameInput.addEventListener("blur", syncFilenameWithFormat);
  elements.qualityInput.addEventListener("input", () => {
    elements.qualityValue.textContent = Number(elements.qualityInput.value).toFixed(2);
  });
  elements.downloadButton.addEventListener("click", convertAndDownloadImage);
  elements.resetEditsButton.addEventListener("click", resetEdits);

  elements.cropEnabled.addEventListener("change", () => {
    if (!state.decodedImage) {
      return;
    }

    state.edit.cropEnabled = elements.cropEnabled.checked;
    syncDerivedDimensions("width");
    syncEditControls();
    requestPreviewRender();
  });

  [
    [elements.cropX, "x"],
    [elements.cropY, "y"],
    [elements.cropWidth, "width"],
    [elements.cropHeight, "height"]
  ].forEach(([input, fieldName]) => {
    input.addEventListener("input", () => {
      if (!state.decodedImage) {
        return;
      }

      state.edit.cropEnabled = true;
      state.edit.cropX = parsePositiveInteger(elements.cropX.value, state.edit.cropX);
      state.edit.cropY = parsePositiveInteger(elements.cropY.value, state.edit.cropY);
      state.edit.cropWidth = parsePositiveInteger(elements.cropWidth.value, state.edit.cropWidth);
      state.edit.cropHeight = parsePositiveInteger(elements.cropHeight.value, state.edit.cropHeight);
      clampCropRect(fieldName);
      syncDerivedDimensions(fieldName === "height" ? "height" : "width");
      syncEditControls();
      requestPreviewRender();
    });
  });

  elements.cropPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-crop-preset]");
    if (!button || !state.decodedImage) {
      return;
    }

    applyCropPreset(button.dataset.cropPreset);
  });

  elements.resizeEnabled.addEventListener("change", () => {
    if (!state.decodedImage) {
      return;
    }

    state.edit.resizeEnabled = elements.resizeEnabled.checked;
    syncDerivedDimensions("width");
    syncEditControls();
    requestPreviewRender();
  });

  elements.resizeWidth.addEventListener("input", () => handleResizeInput("width"));
  elements.resizeHeight.addEventListener("input", () => handleResizeInput("height"));
  elements.resizeLock.addEventListener("change", () => {
    if (!state.decodedImage) {
      return;
    }

    state.edit.lockAspectRatio = elements.resizeLock.checked;
    syncDerivedDimensions("width");
    syncEditControls();
    requestPreviewRender();
  });

  elements.resizePresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-resize-scale]");
    if (!button || !state.decodedImage) {
      return;
    }

    applyResizeScale(Number(button.dataset.resizeScale));
  });

  elements.rotationSelect.addEventListener("change", () => {
    if (!state.decodedImage) {
      return;
    }

    state.edit.rotation = normalizeRotation(Number(elements.rotationSelect.value));
    syncDerivedDimensions("width");
    syncEditControls();
    requestPreviewRender();
  });

  elements.flipX.addEventListener("change", () => {
    if (!state.decodedImage) {
      return;
    }

    state.edit.flipX = elements.flipX.checked;
    updateFormState();
    requestPreviewRender();
  });

  elements.flipY.addEventListener("change", () => {
    if (!state.decodedImage) {
      return;
    }

    state.edit.flipY = elements.flipY.checked;
    updateFormState();
    requestPreviewRender();
  });

  elements.backgroundColor.addEventListener("input", () => {
    state.edit.backgroundColor = elements.backgroundColor.value || DEFAULT_BACKGROUND_COLOR;
    updateFormState();
    updateFormatNote();
    requestPreviewRender();
  });

  elements.pageImages.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-image-url]");
    if (!button) {
      return;
    }

    const imageUrl = button.dataset.imageUrl;
    const sourceName = button.dataset.sourceName || extractNameFromUrl(imageUrl);
    await loadRemoteImage(imageUrl, sourceName);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "dragend", "drop"].forEach((eventName) => {
    elements.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropzone.classList.remove("is-dragover");
    });
  });

  elements.dropzone.addEventListener("drop", async (event) => {
    const [file] = event.dataTransfer?.files || [];
    if (!file) {
      return;
    }

    elements.fileInput.files = event.dataTransfer.files;
    await loadLocalFile(file);
  });
}

function detectSupportedFormats() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  const supported = FORMAT_CANDIDATES.filter((candidate) => {
    try {
      return canvas.toDataURL(candidate.mimeType).startsWith(`data:${candidate.mimeType}`);
    } catch (error) {
      return false;
    }
  });

  return supported.length ? supported : [FORMAT_CANDIDATES[0]];
}

function populateFormatOptions() {
  elements.formatSelect.innerHTML = "";

  state.availableFormats.forEach((format) => {
    const option = document.createElement("option");
    option.value = format.mimeType;
    option.textContent = format.label;
    elements.formatSelect.appendChild(option);
  });

  const preferredFormat =
    state.availableFormats.find((format) => format.mimeType === "image/png")?.mimeType ||
    state.availableFormats[0].mimeType;

  elements.formatSelect.value = preferredFormat;
}

function handleFormatChange() {
  updateQualityVisibility();
  updateBackgroundVisibility();
  updateFormatNote();
  syncFilenameWithFormat();
  requestPreviewRender();
}

function updateQualityVisibility() {
  const format = getSelectedFormat();
  const showQuality = Boolean(format?.usesQuality);
  elements.qualityField.classList.toggle("is-hidden", !showQuality);
  elements.qualityValue.textContent = Number(elements.qualityInput.value).toFixed(2);
}

function updateBackgroundVisibility() {
  const format = getSelectedFormat();
  elements.backgroundField.classList.toggle("is-hidden", format?.mimeType !== "image/jpeg");
}

function updateFormatNote() {
  const format = getSelectedFormat();
  const outputSize = getRequestedOutputSize();

  if (!format) {
    elements.formatNote.textContent = "";
    return;
  }

  const notes = {
    "image/png": "PNG bevarar transparens och passar när du vill ha maximal kompatibilitet.",
    "image/jpeg": `JPG ger ofta mindre filer, men transparens ersätts med vald bakgrundsfärg (${state.edit.backgroundColor.toUpperCase()}).`,
    "image/webp": "WEBP ger ofta bra balans mellan kvalitet och filstorlek.",
    "image/avif": "AVIF kan ge mycket små filer, men vissa äldre appar stöder det inte fullt ut."
  };

  const availableLabels = state.availableFormats.map((entry) => entry.label).join(", ");
  const sizeNote =
    outputSize.width && outputSize.height ? ` Slutstorlek just nu: ${outputSize.width} x ${outputSize.height} px.` : "";

  elements.formatNote.textContent = `${notes[format.mimeType]}${sizeNote} Tillgängliga format i den här Edge-versionen: ${availableLabels}.`;
}

async function loadLocalFile(file) {
  setStatus("Läser in lokal bild...", "info");

  try {
    const objectUrl = URL.createObjectURL(file);
    const decodedImage = await decodeImage(objectUrl);

    state.currentSelectedPageImageUrl = null;
    applySelectedSource({
      kind: "file",
      label: "Lokal fil",
      sourceName: file.name || "bild",
      objectUrl,
      decodedImage
    });

    setStatus("Bilden är redo för redigering och export.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Det gick inte att läsa filen. Testa en annan bild.", "error");
  }
}

async function loadRemoteImage(imageUrl, sourceName = "bild") {
  if (!isSupportedRemoteSource(imageUrl)) {
    setStatus("Den här bildkällan kan inte hämtas direkt. Testa att spara bilden lokalt i stället.", "error");
    return;
  }

  setStatus("Hämtar bilden från webben...", "info");

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Misslyckades att hämta bilden: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const decodedImage = await decodeImage(objectUrl);

    state.currentSelectedPageImageUrl = imageUrl;
    applySelectedSource({
      kind: "remote",
      label: "Bild från webbsida",
      sourceName,
      objectUrl,
      decodedImage
    });

    setStatus("Webbbilden är redo för redigering och export.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Det gick inte att hämta bilden. Sidan kanske blockerar den eller så är URL:en ogiltig.", "error");
  }
}

async function loadImagesFromActiveTab() {
  setStatus("Söker efter bilder i aktiv flik...", "info");

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      throw new Error("Ingen aktiv flik hittades.");
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: collectPageImages
    });

    state.pageImages = Array.isArray(result?.result) ? result.result : [];
    renderPageImages();

    if (!state.pageImages.length) {
      setStatus("Jag hittade inga vanliga bilder i den aktiva fliken.", "error");
      return;
    }

    setStatus(`Hittade ${state.pageImages.length} bilder i den aktiva fliken.`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Det gick inte att läsa bilder från den här fliken. Testa en vanlig webbsida i stället.", "error");
  }
}

function collectPageImages() {
  const seenUrls = new Set();

  return Array.from(document.images)
    .map((image) => {
      const imageUrl = image.currentSrc || image.src;
      if (!imageUrl || seenUrls.has(imageUrl)) {
        return null;
      }

      const isAllowedScheme =
        imageUrl.startsWith("http://") ||
        imageUrl.startsWith("https://") ||
        imageUrl.startsWith("data:");

      if (!isAllowedScheme) {
        return null;
      }

      seenUrls.add(imageUrl);

      return {
        url: imageUrl,
        width: image.naturalWidth || image.width || 0,
        height: image.naturalHeight || image.height || 0,
        sourceName: imageUrl.startsWith("data:")
          ? `bild-${seenUrls.size}`
          : extractNameFromLocation(imageUrl),
        label: image.alt?.trim() || document.title || "Bild"
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.width * right.height - left.width * left.height)
    .slice(0, 40);

  function extractNameFromLocation(url) {
    try {
      const parsed = new URL(url);
      const lastSegment = parsed.pathname.split("/").filter(Boolean).pop();
      return lastSegment || "bild";
    } catch (error) {
      return "bild";
    }
  }
}

function renderPageImages() {
  elements.pageImages.innerHTML = "";
  elements.pageImageCount.textContent = String(state.pageImages.length);
  elements.pageImagesWrap.classList.toggle("is-hidden", state.pageImages.length === 0);

  state.pageImages.forEach((image) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "image-choice";
    button.dataset.imageUrl = image.url;
    button.dataset.sourceName = image.sourceName;

    const thumb = document.createElement("img");
    thumb.src = image.url;
    thumb.alt = image.label || "Bild";

    const content = document.createElement("div");

    const title = document.createElement("span");
    title.className = "image-title";
    title.textContent = truncateText(image.label || image.sourceName || "Bild", 48);

    const meta = document.createElement("span");
    meta.className = "image-meta";
    meta.textContent = `${image.width || "?"} x ${image.height || "?"} px`;

    content.append(title, meta);
    button.append(thumb, content);
    elements.pageImages.appendChild(button);
  });

  markSelectedPageImage(state.currentSelectedPageImageUrl);
}

function applySelectedSource({ kind, label, sourceName, objectUrl, decodedImage }) {
  releasePreviousSource();

  state.selectedSource = { kind, label, sourceName, objectUrl };
  state.decodedImage = decodedImage;
  state.baseName = sanitizeBaseName(stripExtension(sourceName) || "bild");

  elements.sourceMeta.classList.remove("is-hidden");
  elements.sourceBadge.textContent = label;
  elements.imageDimensions.textContent = `Original ${decodedImage.naturalWidth} x ${decodedImage.naturalHeight} px`;
  markSelectedPageImage(state.currentSelectedPageImageUrl);

  resetEdits();
  syncFilenameWithFormat(state.baseName);
}

function releasePreviousSource() {
  if (state.selectedSource?.objectUrl) {
    URL.revokeObjectURL(state.selectedSource.objectUrl);
  }
}

function resetEdits() {
  if (!state.decodedImage) {
    state.edit = createEmptyEditState();
    syncEditControls();
    updateFormState();
    return;
  }

  state.edit = {
    cropEnabled: false,
    cropX: 0,
    cropY: 0,
    cropWidth: state.decodedImage.naturalWidth,
    cropHeight: state.decodedImage.naturalHeight,
    resizeEnabled: false,
    resizeWidth: state.decodedImage.naturalWidth,
    resizeHeight: state.decodedImage.naturalHeight,
    lockAspectRatio: true,
    rotation: 0,
    flipX: false,
    flipY: false,
    backgroundColor: DEFAULT_BACKGROUND_COLOR
  };

  syncEditControls();
  updateFormState();
  updateFormatNote();
  requestPreviewRender();
}

function syncEditControls() {
  const hasImage = Boolean(state.decodedImage);

  elements.cropEnabled.checked = state.edit.cropEnabled;
  elements.cropControls.classList.toggle("is-hidden", !state.edit.cropEnabled);
  elements.cropX.value = hasImage ? String(state.edit.cropX) : "";
  elements.cropY.value = hasImage ? String(state.edit.cropY) : "";
  elements.cropWidth.value = hasImage ? String(state.edit.cropWidth) : "";
  elements.cropHeight.value = hasImage ? String(state.edit.cropHeight) : "";

  elements.resizeEnabled.checked = state.edit.resizeEnabled;
  elements.resizeControls.classList.toggle("is-hidden", !state.edit.resizeEnabled);
  elements.resizeWidth.value = hasImage ? String(state.edit.resizeWidth) : "";
  elements.resizeHeight.value = hasImage ? String(state.edit.resizeHeight) : "";
  elements.resizeLock.checked = state.edit.lockAspectRatio;

  elements.rotationSelect.value = String(state.edit.rotation);
  elements.flipX.checked = state.edit.flipX;
  elements.flipY.checked = state.edit.flipY;
  elements.backgroundColor.value = state.edit.backgroundColor;
}

function syncDerivedDimensions(referenceDimension) {
  if (!state.decodedImage) {
    return;
  }

  clampCropRect(referenceDimension);

  const baseSize = getBaseOutputDimensions();
  if (!state.edit.resizeEnabled) {
    state.edit.resizeWidth = baseSize.width;
    state.edit.resizeHeight = baseSize.height;
    updateFormState();
    updateFormatNote();
    return;
  }

  if (!baseSize.width || !baseSize.height) {
    return;
  }

  const aspectRatio = baseSize.width / baseSize.height;
  if (state.edit.lockAspectRatio) {
    if (referenceDimension === "height") {
      state.edit.resizeHeight = clampOutputDimension(state.edit.resizeHeight || baseSize.height);
      state.edit.resizeWidth = clampOutputDimension(Math.round(state.edit.resizeHeight * aspectRatio));
    } else {
      state.edit.resizeWidth = clampOutputDimension(state.edit.resizeWidth || baseSize.width);
      state.edit.resizeHeight = clampOutputDimension(Math.round(state.edit.resizeWidth / aspectRatio));
    }
  } else {
    state.edit.resizeWidth = clampOutputDimension(state.edit.resizeWidth || baseSize.width);
    state.edit.resizeHeight = clampOutputDimension(state.edit.resizeHeight || baseSize.height);
  }

  updateFormState();
  updateFormatNote();
}

function clampCropRect(referenceField) {
  if (!state.decodedImage) {
    return;
  }

  const maxWidth = state.decodedImage.naturalWidth;
  const maxHeight = state.decodedImage.naturalHeight;

  state.edit.cropX = clamp(Math.round(state.edit.cropX) || 0, 0, Math.max(0, maxWidth - 1));
  state.edit.cropY = clamp(Math.round(state.edit.cropY) || 0, 0, Math.max(0, maxHeight - 1));
  state.edit.cropWidth = clamp(Math.round(state.edit.cropWidth) || maxWidth, 1, maxWidth);
  state.edit.cropHeight = clamp(Math.round(state.edit.cropHeight) || maxHeight, 1, maxHeight);

  if (state.edit.cropX + state.edit.cropWidth > maxWidth) {
    if (referenceField === "x") {
      state.edit.cropX = Math.max(0, maxWidth - state.edit.cropWidth);
    } else {
      state.edit.cropWidth = Math.max(1, maxWidth - state.edit.cropX);
    }
  }

  if (state.edit.cropY + state.edit.cropHeight > maxHeight) {
    if (referenceField === "y") {
      state.edit.cropY = Math.max(0, maxHeight - state.edit.cropHeight);
    } else {
      state.edit.cropHeight = Math.max(1, maxHeight - state.edit.cropY);
    }
  }
}

function handleResizeInput(referenceDimension) {
  if (!state.decodedImage) {
    return;
  }

  state.edit.resizeEnabled = true;
  state.edit.resizeWidth = parsePositiveInteger(elements.resizeWidth.value, state.edit.resizeWidth);
  state.edit.resizeHeight = parsePositiveInteger(elements.resizeHeight.value, state.edit.resizeHeight);

  syncDerivedDimensions(referenceDimension);
  syncEditControls();
  requestPreviewRender();
}

function applyResizeScale(scale) {
  if (!state.decodedImage) {
    return;
  }

  const baseSize = getBaseOutputDimensions();
  state.edit.resizeEnabled = true;
  state.edit.resizeWidth = clampOutputDimension(Math.round(baseSize.width * scale));
  state.edit.resizeHeight = clampOutputDimension(Math.round(baseSize.height * scale));

  syncEditControls();
  updateFormState();
  updateFormatNote();
  requestPreviewRender();
}

function applyCropPreset(presetKey) {
  if (!state.decodedImage) {
    return;
  }

  const fullWidth = state.decodedImage.naturalWidth;
  const fullHeight = state.decodedImage.naturalHeight;
  state.edit.cropEnabled = true;

  if (presetKey === "full") {
    state.edit.cropX = 0;
    state.edit.cropY = 0;
    state.edit.cropWidth = fullWidth;
    state.edit.cropHeight = fullHeight;
  } else {
    const ratioMap = {
      square: 1,
      widescreen: 16 / 9,
      portrait: 4 / 5
    };

    const targetRatio = ratioMap[presetKey] || 1;
    const imageRatio = fullWidth / fullHeight;

    if (imageRatio > targetRatio) {
      state.edit.cropHeight = fullHeight;
      state.edit.cropWidth = Math.max(1, Math.round(fullHeight * targetRatio));
    } else {
      state.edit.cropWidth = fullWidth;
      state.edit.cropHeight = Math.max(1, Math.round(fullWidth / targetRatio));
    }

    state.edit.cropX = Math.max(0, Math.round((fullWidth - state.edit.cropWidth) / 2));
    state.edit.cropY = Math.max(0, Math.round((fullHeight - state.edit.cropHeight) / 2));
  }

  syncDerivedDimensions("width");
  syncEditControls();
  requestPreviewRender();
}

function updateFormState() {
  elements.downloadButton.disabled = !state.decodedImage;
  elements.resetEditsButton.disabled = !state.decodedImage || !hasAppliedEdits();
}

function hasAppliedEdits() {
  return (
    state.edit.cropEnabled ||
    state.edit.resizeEnabled ||
    state.edit.rotation !== 0 ||
    state.edit.flipX ||
    state.edit.flipY ||
    state.edit.backgroundColor !== DEFAULT_BACKGROUND_COLOR
  );
}

function syncFilenameWithFormat(nextBaseName) {
  const format = getSelectedFormat();
  if (!format) {
    return;
  }

  const currentValue = elements.filenameInput.value.trim();
  const requestedBaseName =
    nextBaseName ||
    sanitizeBaseName(stripExtension(currentValue) || state.baseName || "bild");

  state.baseName = requestedBaseName || "bild";
  elements.filenameInput.value = `${state.baseName}.${format.extension}`;
}

function requestPreviewRender() {
  if (state.previewRenderHandle) {
    window.cancelAnimationFrame(state.previewRenderHandle);
  }

  state.previewRenderHandle = window.requestAnimationFrame(() => {
    state.previewRenderHandle = 0;
    renderPreview();
  });
}

function renderPreview() {
  if (!state.decodedImage) {
    elements.previewCanvas.width = 0;
    elements.previewCanvas.height = 0;
    elements.previewFrame.classList.remove("has-image");
    elements.outputDimensions.classList.add("is-hidden");
    elements.outputDimensions.textContent = "";
    elements.editSummary.textContent = "Förhandsvisningen visar slutresultatet efter dina valda redigeringar.";
    return;
  }

  try {
    const workingCanvas = buildEditedCanvas();
    const format = getSelectedFormat();
    const previewCanvasSource = flattenCanvasForFormat(workingCanvas, format);
    const previewScale = Math.min(
      1,
      PREVIEW_MAX_EDGE / Math.max(previewCanvasSource.width, previewCanvasSource.height)
    );
    const previewWidth = Math.max(1, Math.round(previewCanvasSource.width * previewScale));
    const previewHeight = Math.max(1, Math.round(previewCanvasSource.height * previewScale));

    elements.previewCanvas.width = previewWidth;
    elements.previewCanvas.height = previewHeight;

    const previewContext = elements.previewCanvas.getContext("2d", { alpha: true });
    if (!previewContext) {
      throw new Error("Canvas kunde inte initieras för förhandsvisningen.");
    }

    previewContext.clearRect(0, 0, previewWidth, previewHeight);
    previewContext.imageSmoothingEnabled = true;
    previewContext.imageSmoothingQuality = "high";
    previewContext.drawImage(previewCanvasSource, 0, 0, previewWidth, previewHeight);

    elements.previewFrame.classList.add("has-image");
    elements.outputDimensions.classList.remove("is-hidden");
    elements.outputDimensions.textContent = `Export ${workingCanvas.width} x ${workingCanvas.height} px`;
    elements.editSummary.textContent = buildEditSummary(workingCanvas.width, workingCanvas.height, format);
    updateFormatNote();
  } catch (error) {
    console.error(error);
    setStatus("Förhandsvisningen kunde inte uppdateras. Testa mindre storlek eller en annan bild.", "error");
  }
}

function buildEditSummary(width, height, format) {
  const details = [];

  if (state.edit.cropEnabled) {
    const cropRect = getActiveCropRect();
    details.push(`beskärd till ${cropRect.width} x ${cropRect.height} px`);
  }

  if (state.edit.resizeEnabled) {
    details.push(`skalad till ${width} x ${height} px`);
  }

  if (state.edit.rotation) {
    details.push(`roterad ${state.edit.rotation} grader`);
  }

  if (state.edit.flipX) {
    details.push("speglad horisontellt");
  }

  if (state.edit.flipY) {
    details.push("speglad vertikalt");
  }

  if (format?.mimeType === "image/jpeg") {
    details.push(`JPG-bakgrund ${state.edit.backgroundColor.toUpperCase()}`);
  }

  if (!details.length) {
    return `Slutresultat: ${width} x ${height} px utan extra redigering.`;
  }

  return `Slutresultat: ${width} x ${height} px, ${details.join(", ")}.`;
}

function getActiveCropRect() {
  if (!state.decodedImage) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  if (!state.edit.cropEnabled) {
    return {
      x: 0,
      y: 0,
      width: state.decodedImage.naturalWidth,
      height: state.decodedImage.naturalHeight
    };
  }

  return {
    x: state.edit.cropX,
    y: state.edit.cropY,
    width: state.edit.cropWidth,
    height: state.edit.cropHeight
  };
}

function getBaseOutputDimensions() {
  const cropRect = getActiveCropRect();
  if (!cropRect.width || !cropRect.height) {
    return { width: 0, height: 0 };
  }

  const rotated = normalizeRotation(state.edit.rotation) % 180 !== 0;
  return rotated
    ? { width: cropRect.height, height: cropRect.width }
    : { width: cropRect.width, height: cropRect.height };
}

function getRequestedOutputSize() {
  if (!state.decodedImage) {
    return { width: 0, height: 0 };
  }

  if (!state.edit.resizeEnabled) {
    return getBaseOutputDimensions();
  }

  return {
    width: clampOutputDimension(state.edit.resizeWidth),
    height: clampOutputDimension(state.edit.resizeHeight)
  };
}

function buildEditedCanvas() {
  if (!state.decodedImage) {
    throw new Error("Ingen bild är laddad.");
  }

  const cropRect = getActiveCropRect();
  const cropCanvas = createCanvas(cropRect.width, cropRect.height);
  const cropContext = cropCanvas.getContext("2d", { alpha: true });
  if (!cropContext) {
    throw new Error("Canvas kunde inte initieras för beskärning.");
  }

  cropContext.imageSmoothingEnabled = true;
  cropContext.imageSmoothingQuality = "high";
  cropContext.drawImage(
    state.decodedImage,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    cropRect.width,
    cropRect.height
  );

  const rotation = normalizeRotation(state.edit.rotation);
  const rotateCanvas = createCanvas(
    rotation % 180 === 0 ? cropCanvas.width : cropCanvas.height,
    rotation % 180 === 0 ? cropCanvas.height : cropCanvas.width
  );
  const rotateContext = rotateCanvas.getContext("2d", { alpha: true });
  if (!rotateContext) {
    throw new Error("Canvas kunde inte initieras för rotation.");
  }

  rotateContext.save();
  rotateContext.translate(rotateCanvas.width / 2, rotateCanvas.height / 2);
  rotateContext.rotate((rotation * Math.PI) / 180);
  rotateContext.scale(state.edit.flipX ? -1 : 1, state.edit.flipY ? -1 : 1);
  rotateContext.imageSmoothingEnabled = true;
  rotateContext.imageSmoothingQuality = "high";
  rotateContext.drawImage(cropCanvas, -cropCanvas.width / 2, -cropCanvas.height / 2);
  rotateContext.restore();

  const requestedSize = getRequestedOutputSize();
  if (
    requestedSize.width === rotateCanvas.width &&
    requestedSize.height === rotateCanvas.height
  ) {
    return rotateCanvas;
  }

  const resizedCanvas = createCanvas(requestedSize.width, requestedSize.height);
  const resizedContext = resizedCanvas.getContext("2d", { alpha: true });
  if (!resizedContext) {
    throw new Error("Canvas kunde inte initieras för storleksändring.");
  }

  resizedContext.imageSmoothingEnabled = true;
  resizedContext.imageSmoothingQuality = "high";
  resizedContext.drawImage(rotateCanvas, 0, 0, requestedSize.width, requestedSize.height);
  return resizedCanvas;
}

function flattenCanvasForFormat(sourceCanvas, format) {
  if (format?.mimeType !== "image/jpeg") {
    return sourceCanvas;
  }

  const flattenedCanvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const context = flattenedCanvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas kunde inte initieras för JPG-export.");
  }

  context.fillStyle = state.edit.backgroundColor || DEFAULT_BACKGROUND_COLOR;
  context.fillRect(0, 0, flattenedCanvas.width, flattenedCanvas.height);
  context.drawImage(sourceCanvas, 0, 0);
  return flattenedCanvas;
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = clampOutputDimension(width);
  canvas.height = clampOutputDimension(height);
  return canvas;
}

async function convertAndDownloadImage() {
  const format = getSelectedFormat();
  if (!format || !state.decodedImage) {
    return;
  }

  setStatus("Bearbetar bilden...", "info");

  try {
    const editedCanvas = buildEditedCanvas();
    const exportCanvas = flattenCanvasForFormat(editedCanvas, format);

    const blob = await canvasToBlob(
      exportCanvas,
      format.mimeType,
      format.usesQuality ? Number(elements.qualityInput.value) : undefined
    );

    const fileName = normalizeFilename(elements.filenameInput.value, format.extension);
    const downloadUrl = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url: downloadUrl,
      filename: fileName,
      saveAs: true
    });

    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    setStatus(`Klart. Bilden sparas som ${fileName}.`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Exporten misslyckades. Testa mindre storlek eller ett annat format.", "error");
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Canvas kunde inte skapa en blob för ${mimeType}.`));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function decodeImage(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Kunde inte avkoda bilden."));
    image.src = objectUrl;
  });
}

function getSelectedFormat() {
  return state.availableFormats.find((format) => format.mimeType === elements.formatSelect.value);
}

function markSelectedPageImage(imageUrl) {
  elements.pageImages.querySelectorAll(".image-choice").forEach((button) => {
    button.classList.toggle("is-active", Boolean(imageUrl) && button.dataset.imageUrl === imageUrl);
  });
}

function setStatus(message, tone) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${tone === "error" ? "is-error" : ""} ${
    tone === "success" ? "is-success" : ""
  }`.trim();

  const pillLabels = {
    idle: "Redo",
    info: "Jobbar",
    success: "Klar",
    error: "Fel"
  };

  elements.statusPill.dataset.tone = tone || "idle";
  elements.statusPill.textContent = pillLabels[tone] || "Redo";
}

function normalizeFilename(rawValue, fallbackExtension) {
  const cleanedValue = rawValue.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "");
  const withoutExtension = stripExtension(cleanedValue || state.baseName || "bild");
  const safeBaseName = sanitizeBaseName(withoutExtension || "bild");
  return `${safeBaseName}.${fallbackExtension}`;
}

function sanitizeBaseName(value) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "bild";
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function extractNameFromUrl(url) {
  if (url.startsWith("data:")) {
    return "bild";
  }

  try {
    const parsedUrl = new URL(url);
    const fileName = parsedUrl.pathname.split("/").filter(Boolean).pop();
    return fileName || "bild";
  } catch (error) {
    return "bild";
  }
}

function isSupportedRemoteSource(url) {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:");
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function parsePositiveInteger(rawValue, fallbackValue) {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampOutputDimension(value) {
  return clamp(Math.round(value) || 1, 1, MAX_OUTPUT_EDGE);
}

function normalizeRotation(value) {
  const normalized = ((value % 360) + 360) % 360;
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0;
}
