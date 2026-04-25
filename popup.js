const FORMAT_CANDIDATES = [
  { mimeType: "image/png", extension: "png", label: "PNG", usesQuality: false },
  { mimeType: "image/jpeg", extension: "jpg", label: "JPG", usesQuality: true },
  { mimeType: "image/webp", extension: "webp", label: "WEBP", usesQuality: true },
  { mimeType: "image/avif", extension: "avif", label: "AVIF", usesQuality: true }
];

const state = {
  selectedSource: null,
  decodedImage: null,
  availableFormats: [],
  pageImages: [],
  currentSelectedPageImageUrl: null,
  baseName: "bild"
};

const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindEvents();

  state.availableFormats = detectSupportedFormats();
  populateFormatOptions();
  updateQualityVisibility();
  updateFormatNote();
  updateFormState();

  const pendingImageUrl = new URLSearchParams(window.location.search).get("imageUrl");
  const pendingSourceName = new URLSearchParams(window.location.search).get("sourceName");

  if (pendingImageUrl) {
    await loadRemoteImage(pendingImageUrl, pendingSourceName || extractNameFromUrl(pendingImageUrl));
  }
});

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
  elements.previewFrame = document.querySelector(".preview-frame");
  elements.previewImage = document.getElementById("preview-image");
  elements.previewEmpty = document.getElementById("preview-empty");
  elements.statusPill = document.getElementById("status-pill");
  elements.formatSelect = document.getElementById("format-select");
  elements.filenameInput = document.getElementById("filename-input");
  elements.qualityField = document.getElementById("quality-field");
  elements.qualityInput = document.getElementById("quality-input");
  elements.qualityValue = document.getElementById("quality-value");
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
  updateFormatNote();
  syncFilenameWithFormat();
}

function updateQualityVisibility() {
  const format = getSelectedFormat();
  const showQuality = Boolean(format?.usesQuality);
  elements.qualityField.classList.toggle("is-hidden", !showQuality);
  elements.qualityValue.textContent = Number(elements.qualityInput.value).toFixed(2);
}

function updateFormatNote() {
  const format = getSelectedFormat();

  if (!format) {
    elements.formatNote.textContent = "";
    return;
  }

  const notes = {
    "image/png": "PNG bevarar transparens och passar nar du vill ha maximal kompatibilitet.",
    "image/jpeg": "JPG ger ofta mindre filer, men transparens ersatts med vit bakgrund.",
    "image/webp": "WEBP ger ofta bra balans mellan kvalitet och filstorlek.",
    "image/avif": "AVIF kan ge mycket sma filer, men vissa aldre appar stoder det inte fullt ut."
  };

  const availableLabels = state.availableFormats.map((entry) => entry.label).join(", ");
  elements.formatNote.textContent = `${notes[format.mimeType]} Tillgangliga format i den har Edge-versionen: ${availableLabels}.`;
}

async function loadLocalFile(file) {
  setStatus("Laser in lokal bild...", "info");

  try {
    const objectUrl = URL.createObjectURL(file);
    const decodedImage = await decodeImage(objectUrl);

    applySelectedSource({
      kind: "file",
      label: "Lokal fil",
      sourceName: file.name || "bild",
      objectUrl,
      decodedImage
    });

    setStatus("Bilden ar redo att konverteras.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Det gick inte att lasa filen. Testa en annan bild.", "error");
  }
}

async function loadRemoteImage(imageUrl, sourceName = "bild") {
  if (!isSupportedRemoteSource(imageUrl)) {
    setStatus("Den har bildkallan kan inte hamtas direkt. Testa att spara bilden lokalt i stallet.", "error");
    return;
  }

  setStatus("Hamter bilden fran webben...", "info");

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Misslyckades att hamta bilden: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const decodedImage = await decodeImage(objectUrl);

    state.currentSelectedPageImageUrl = imageUrl;

    applySelectedSource({
      kind: "remote",
      label: "Bild fran webbsida",
      sourceName,
      objectUrl,
      decodedImage
    });

    markSelectedPageImage(imageUrl);
    setStatus("Webbbilden ar redo att konverteras.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Det gick inte att hamta bilden. Sidan kanske blockerar den eller sa ar URL:en ogiltig.", "error");
  }
}

async function loadImagesFromActiveTab() {
  setStatus("Soker efter bilder i aktiv flik...", "info");

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
    setStatus("Det gick inte att lasa bilder fran den har fliken. Testa en vanlig webbsida i stallet.", "error");
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
    .sort((left, right) => (right.width * right.height) - (left.width * left.height))
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

  elements.previewImage.src = objectUrl;
  elements.previewFrame.classList.add("has-image");
  elements.sourceMeta.classList.remove("is-hidden");
  elements.sourceBadge.textContent = label;
  elements.imageDimensions.textContent = `${decodedImage.naturalWidth} x ${decodedImage.naturalHeight} px`;

  syncFilenameWithFormat(state.baseName);
  updateFormState();
}

function releasePreviousSource() {
  if (state.selectedSource?.objectUrl) {
    URL.revokeObjectURL(state.selectedSource.objectUrl);
  }
}

function updateFormState() {
  elements.downloadButton.disabled = !state.decodedImage;
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

async function convertAndDownloadImage() {
  const format = getSelectedFormat();
  if (!format || !state.decodedImage) {
    return;
  }

  setStatus("Konverterar bilden...", "info");

  try {
    const canvas = document.createElement("canvas");
    canvas.width = state.decodedImage.naturalWidth;
    canvas.height = state.decodedImage.naturalHeight;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Canvas kunde inte initieras.");
    }

    if (format.mimeType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(state.decodedImage, 0, 0);

    const blob = await canvasToBlob(
      canvas,
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
    setStatus("Konverteringen misslyckades. Testa ett annat format eller en annan bild.", "error");
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Canvas kunde inte skapa en blob for ${mimeType}.`));
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
