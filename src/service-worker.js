import { RunManager } from "./background/run-manager";
import {
  SCHEDULER_ALARM_NAME,
  getSchedule,
  handleScheduledRun,
  restoreScheduleAlarm,
  setSchedule,
} from "./background/scheduler";
import { getCurrentUser, initFirebase, signIn, signOut } from "./firebase/auth";
import {
  addSupplier,
  getRequestedOrders,
  getSuppliers,
  removeSupplier,
  stopWatchingOrders,
  watchRequestedOrders,
} from "./firebase/firestore";
import { API_BASE } from "./shared/api";
import { MSG, log } from "./shared/constants";

// Initialize Firebase
initFirebase();

// --- Context menus ---

function createContextMenu(id, title, contexts = ["selection"]) {
  chrome.contextMenus.remove(id, () => {
    if (
      chrome.runtime.lastError &&
      chrome.runtime.lastError.message &&
      !chrome.runtime.lastError.message.includes("Cannot find menu item")
    ) {
      console.warn(
        "Context menu remove error:",
        chrome.runtime.lastError.message,
      );
    }
    chrome.contextMenus.create({
      id,
      title,
      contexts,
    });
  });
}

createContextMenu("asin-tools", "SellerForge > ASIN", ["selection", "page"]);

// Ensure the content script is injected in the given frame (needed for non-Seller Central pages)
async function ensureContentScript(tabId, frameId = 0) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.PING }, { frameId });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["content.js"],
      });
    } catch (err) {
      log("Cannot inject content script into frame", frameId, ":", err.message);
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "asin-tools") {
    return handleAsinTools(info, tab);
  }
});

async function handleAsinTools(info, tab) {
  // Ensure content script is available in both the right-clicked frame and the top frame
  await ensureContentScript(tab.id, info.frameId);
  if (info.frameId !== 0) await ensureContentScript(tab.id, 0);

  let asin = null;
  let productDetails = null;

  // 1) Try scraping full product details from the DOM
  try {
    const details = await chrome.tabs.sendMessage(
      tab.id,
      { type: MSG.SCRAPE_PRODUCT_DETAILS },
      { frameId: info.frameId },
    );
    if (details?.asin) {
      asin = details.asin;
      productDetails = details;
    }
  } catch (err) {
    log("Could not scrape product details:", err.message);
  }

  // 2) Fall back to selected text or right-clicked element for ASIN only
  if (!asin) {
    asin = (info.selectionText || "").trim();
  }
  if (!asin) {
    try {
      const result = await chrome.tabs.sendMessage(
        tab.id,
        { type: MSG.GET_CLICKED_ASIN },
        { frameId: info.frameId },
      );
      asin = result?.asin || "";
    } catch (err) {
      log("Could not get clicked ASIN:", err.message);
    }
  }

  if (!asin) {
    log("No ASIN found, skipping");
    return;
  }

  // Validate ASIN format (10 alphanumeric characters)
  if (!/^[A-Z0-9]{10}$/i.test(asin)) {
    log("Invalid ASIN format:", asin);
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SHOW_ASIN_TOOLS,
        error: `"${asin}" is not a valid ASIN`,
      },
      { frameId: 0 },
    );
    return;
  }

  log("ASIN tools lookup:", asin);

  // Show loading overlay in the top frame
  chrome.tabs.sendMessage(
    tab.id,
    { type: MSG.SHOW_ASIN_TOOLS_LOADING },
    { frameId: 0 },
  );

  try {
    const { product, suppliers, revenueEstimate } = await getAsinData(asin);
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SHOW_ASIN_TOOLS,
        product,
        suppliers,
        revenueEstimate,
        productDetails,
      },
      { frameId: 0 },
    );
  } catch (err) {
    log("ASIN tools error:", err.message);
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SHOW_ASIN_TOOLS,
        error: err.message,
      },
      { frameId: 0 },
    );
  }
}

async function getAsinData(asin) {
  const [res, suppliers, revenueEstimate] = await Promise.all([
    fetch(`${API_BASE}/api/product/${encodeURIComponent(asin)}`),
    getSuppliers(asin).catch(() => []),
    getRevenueEstimate(asin),
  ]);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Server error (${res.status})`);
  }
  const product = await res.json();
  return { product, suppliers, revenueEstimate };
}

async function getRevenueEstimate(asin) {
  return getRevenueEstimateForPrice(asin);
}

async function getRevenueEstimateForPrice(
  asin,
  { listingPrice = null, refresh = false, domain = null } = {},
) {
  try {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (listingPrice != null) params.set("listing_price", String(listingPrice));
    if (refresh) params.set("refresh", "true");

    const query = params.toString();
    const url = `${API_BASE}/api/calculate-revenue/${encodeURIComponent(asin)}${query ? `?${query}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

function hasRunData(state) {
  return Boolean(
    state &&
    (state.discoveredCount ||
      state.queuedCount ||
      state.processedCount ||
      state.requestedCount ||
      state.alreadyRequestedCount ||
      state.tooEarlyCount ||
      state.failedCount ||
      state.status === "completed" ||
      state.status === "stopped"),
  );
}

// Single RunManager instance
const runManager = new RunManager();

// Start watching requested orders once auth is ready
getCurrentUser().then((user) => {
  if (user) startOrdersWatcher();
});

function startOrdersWatcher() {
  watchRequestedOrders((orders) => {
    chrome.runtime
      .sendMessage({ type: MSG.REQUESTED_ORDERS_UPDATE, orders })
      .catch(() => {});
  });
}

// Restore scheduled alarm
restoreScheduleAlarm(runManager);

// --- Alarm listener ---
chrome.alarms.onAlarm.addListener((alarm) => {
  log("Alarm fired:", alarm.name, "at", new Date().toLocaleTimeString());
  if (alarm.name === SCHEDULER_ALARM_NAME) {
    handleScheduledRun(runManager);
  }
});

// --- Message router ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    case MSG.GET_AUTH_STATE:
      getCurrentUser().then((user) => sendResponse({ user }));
      return true;

    case MSG.SIGN_IN:
      handleSignIn(sendResponse);
      return true;

    case MSG.SIGN_OUT:
      handleSignOut(sendResponse);
      return true;

    case MSG.GET_STATE:
      chrome.storage.local.get("sellerforge-last-run-state", (result) => {
        const liveState = runManager.getState();
        const storedState = result["sellerforge-last-run-state"] || null;
        const shouldUseStoredState =
          liveState.status === "idle" && storedState && hasRunData(storedState);

        sendResponse(shouldUseStoredState ? storedState : liveState);
      });
      return true;

    case MSG.START_RUN:
      handleStartRun(sendResponse);
      return true;

    case MSG.STOP_RUN:
      runManager.requestStop();
      sendResponse({ ok: true });
      return false;

    case MSG.GET_SCHEDULE:
      getSchedule().then((schedule) => sendResponse(schedule));
      return true;

    case MSG.SET_SCHEDULE:
      setSchedule(message.payload).then((schedule) =>
        sendResponse({ ok: true, schedule }),
      );
      return true;

    case MSG.GET_REQUESTED_ORDERS:
      getRequestedOrders()
        .then((orders) => sendResponse({ ok: true, orders }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case MSG.GET_ASIN_DATA:
      getAsinData(message.asin)
        .then(({ product, suppliers, revenueEstimate }) =>
          sendResponse({ ok: true, product, suppliers, revenueEstimate }),
        )
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    case MSG.GET_REVENUE_ESTIMATE:
      handleGetRevenueEstimate(message, sendResponse);
      return true;

    case MSG.ADD_SUPPLIER:
      handleAddSupplier(message.asin, message.url, sendResponse);
      return true;

    case MSG.REMOVE_SUPPLIER:
      handleRemoveSupplier(message.asin, message.supplierId, sendResponse);
      return true;

    case MSG.PARSE_SUPPLIER:
      handleParseSupplier(message.url, message.refresh, sendResponse);
      return true;

    case MSG.GENERATE_LABEL:
      handleGenerateLabel(message, sender);
      sendResponse({ ok: true });
      return false;

    case MSG.GET_LABEL_SIZES:
      fetch(`${API_BASE}/api/label/sizes`)
        .then((res) => res.json())
        .then((data) => sendResponse({ ok: true, sizes: data.sizes }))
        .catch(() => sendResponse({ ok: false, sizes: [] }));
      return true;

    case MSG.OPEN_SELLERAMP: {
      const sasMsg = {
        command: "show_sas_ext",
        search_term: message.searchTerm,
        force_search_term: true,
        tab: { id: sender.tab?.id },
      };
      if (message.sasCostPrice != null) {
        sasMsg.sas_cost_price = message.sasCostPrice;
      }
      if (message.sourceUrl) {
        sasMsg.source_url = message.sourceUrl;
      }
      chrome.runtime.sendMessage("kidmffepbniamfbibhfgdakkggchipjl", sasMsg);
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});

// --- Async handlers ---

async function handleSignIn(sendResponse) {
  try {
    const user = await signIn();
    startOrdersWatcher();
    sendResponse({ ok: true, user });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleSignOut(sendResponse) {
  try {
    stopWatchingOrders();
    await signOut();
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleStartRun(sendResponse) {
  sendResponse({ ok: true });
  await runManager.startRun();
}

async function handleAddSupplier(asin, url, sendResponse) {
  try {
    const res = await fetch(
      `${API_BASE}/api/parseurl?url=${encodeURIComponent(url)}`,
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Failed to validate URL (${res.status})`);
    }
    const { title, icon } = await res.json();
    const supplier = await addSupplier(asin, { url, title, icon });
    sendResponse({ ok: true, supplier });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleRemoveSupplier(asin, supplierId, sendResponse) {
  try {
    await removeSupplier(asin, supplierId);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleParseSupplier(url, refresh = false, sendResponse) {
  try {
    const params = new URLSearchParams();
    params.set("url", url);
    if (refresh) {
      params.set("refresh", "true");
    }
    const res = await fetch(`${API_BASE}/api/supplier/parse?${params}`);
    if (!res.ok) {
      sendResponse({ ok: true, data: null });
      return;
    }
    const data = await res.json();
    sendResponse({ ok: true, data });
  } catch {
    sendResponse({ ok: true, data: null });
  }
}

async function handleGetRevenueEstimate(message, sendResponse) {
  try {
    if (!message?.asin) {
      sendResponse({ ok: false, error: "asin is required" });
      return;
    }

    const data = await getRevenueEstimateForPrice(message.asin, {
      listingPrice:
        message.listingPrice == null ? null : Number(message.listingPrice),
      refresh: Boolean(message.refresh),
      domain: message.domain || null,
    });

    if (!data) {
      sendResponse({ ok: false, error: "Failed to fetch revenue estimate" });
      return;
    }

    sendResponse({ ok: true, data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

function handleGenerateLabel({ code, title, condition, size }, sender) {
  const params = new URLSearchParams({ code });
  if (title) params.set("title", title);
  if (condition) params.set("condition", condition);
  if (size != null) params.set("size", size);

  const pdfUrl = `${API_BASE}/api/label?${params}`;
  log("Opening label PDF:", pdfUrl);

  chrome.tabs.create({
    url: pdfUrl,
    index: (sender.tab?.index ?? 0) + 1,
    openerTabId: sender.tab?.id,
  });
}
