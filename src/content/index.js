import { MSG, log } from "../shared/constants";
import { showAsinToolsDialog } from "./asin-tools-dialog";
import {
  clickConfirmYes,
  clickRequestReview,
  detectPageType,
  detectReviewResult,
  extractOrderIdFromPage,
  extractOrders,
  goToNextPage,
  scrapeProductDetails,
  waitForOrdersReady,
} from "./dom";
import { initInventoryOverlay } from "./inventory-overlay";

// Track the element under the cursor when context menu opens
const ASIN_REGEX = /\b[A-Z0-9]{10}\b/;
let lastRightClickedEl = null;

document.addEventListener("contextmenu", (e) => {
  lastRightClickedEl = e.target;
});

// Initialize inventory overlay for Manage Inventory pages
initInventoryOverlay();

function getAsinFromClickedElement() {
  if (!lastRightClickedEl) return null;
  const el = lastRightClickedEl;
  const text = (el.innerText || el.textContent || "").trim();
  const match = text.match(ASIN_REGEX);
  return match ? { asin: match[0] } : null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;
  let response;

  switch (type) {
    case MSG.PING:
      sendResponse({ pong: true });
      break;

    case MSG.DETECT_PAGE:
      response = detectPageType();
      log("DETECT_PAGE →", response);
      sendResponse(response);
      break;

    case MSG.EXTRACT_ORDERS:
      response = extractOrders();
      log("EXTRACT_ORDERS →", response.length, "orders", response);
      sendResponse(response);
      break;

    case MSG.GO_NEXT_PAGE:
      response = goToNextPage();
      log("GO_NEXT_PAGE →", response);
      sendResponse(response);
      break;

    case MSG.WAIT_FOR_ORDERS_READY:
      waitForOrdersReady(message)
        .then((result) => {
          log("WAIT_FOR_ORDERS_READY →", result);
          sendResponse(result);
        })
        .catch((err) => {
          sendResponse({ ready: false, reason: err.message });
        });
      return true;

    case MSG.CLICK_REQUEST_REVIEW:
      response = clickRequestReview();
      log("CLICK_REQUEST_REVIEW →", response);
      sendResponse(response);
      break;

    case MSG.DETECT_REVIEW_RESULT:
      response = detectReviewResult();
      log("DETECT_REVIEW_RESULT →", response);
      sendResponse(response);
      break;

    case MSG.CLICK_CONFIRM_YES:
      response = clickConfirmYes();
      log("CLICK_CONFIRM_YES →", response);
      sendResponse(response);
      break;

    case MSG.EXTRACT_ORDER_ID:
      response = extractOrderIdFromPage();
      log("EXTRACT_ORDER_ID →", response);
      sendResponse(response);
      break;

    case MSG.SCRAPE_PRODUCT_DETAILS: {
      const clickedText = (
        lastRightClickedEl?.innerText ||
        lastRightClickedEl?.textContent ||
        ""
      ).trim();
      response = scrapeProductDetails(clickedText);
      log("SCRAPE_PRODUCT_DETAILS →", response);
      sendResponse(response);
      break;
    }

    case MSG.GET_CLICKED_ASIN:
      response = getAsinFromClickedElement();
      log("GET_CLICKED_ASIN →", response);
      sendResponse(response);
      break;

    case MSG.SHOW_ASIN_TOOLS_LOADING:
      showAsinToolsDialog({ ...message, loading: true });
      sendResponse({ ok: true });
      break;

    case MSG.SHOW_ASIN_TOOLS:
      showAsinToolsDialog(message);
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ error: "Unknown message type" });
  }

  return false;
});
