const CONTEXT_MENU_ID = "convert-image-with-format-switcher";

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.srcUrl) {
    return;
  }

  await openConverterPage({
    imageUrl: info.srcUrl,
    sourceName: extractFileName(info.srcUrl),
    pageTitle: tab?.title || ""
  });
});

chrome.action.onClicked.addListener(async () => {
  await openConverterPage();
});

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "Redigera bild med Bildverktyg för Edge",
      contexts: ["image"]
    });
  });
}

async function openConverterPage(params = {}) {
  const extensionPageUrl = new URL(chrome.runtime.getURL("popup.html"));

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      extensionPageUrl.searchParams.set(key, value);
    }
  });

  await chrome.tabs.create({ url: extensionPageUrl.toString() });
}

function extractFileName(srcUrl) {
  try {
    const parsedUrl = new URL(srcUrl);
    const fileName = parsedUrl.pathname.split("/").filter(Boolean).pop();
    return fileName || "bild";
  } catch (error) {
    return "bild";
  }
}
