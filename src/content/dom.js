import { PAGE_TYPE } from "../shared/constants";

const ORDER_ID_REGEX = /\d{3}-\d{7}-\d{7}/;
const ORDER_DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/;
const PAYMENT_COMPLETE_TEXT = "Payment complete";

export function detectPageType() {
  const url = window.location.href;
  const bodyText = document.body ? document.body.innerText : "";

  if (isOrderDetailsPage(url, bodyText)) {
    return PAGE_TYPE.ORDER_DETAILS;
  }

  if (isManageOrdersPage(url, bodyText)) {
    return PAGE_TYPE.MANAGE_ORDERS;
  }

  return PAGE_TYPE.UNKNOWN;
}

export function detectReviewResult() {
  const successAlert = document.querySelector(
    "#ayb-app kat-alert > span[slot=header]",
  );
  if (
    successAlert &&
    successAlert.innerText.includes("review will be requested")
  ) {
    return PAGE_TYPE.REVIEW_SUCCESS;
  }

  const errorEl = document.querySelector(
    "#ayb-app .ayb-request-review-error-description",
  );
  if (errorEl) {
    const errorText = errorEl.innerText;
    if (errorText.includes("already requested a review")) {
      return PAGE_TYPE.REVIEW_ALREADY_REQUESTED;
    }
    if (
      errorText.includes("5-30 day range") ||
      errorText.includes("4-30 day range") ||
      errorText.includes("can't use this feature")
    ) {
      return PAGE_TYPE.REVIEW_TOO_EARLY;
    }
    return PAGE_TYPE.REVIEW_TOO_EARLY;
  }

  const yesBtn = document.querySelector(
    '#ayb-app .ayb-reviews-button-container kat-button[label="Yes"]',
  );
  if (yesBtn) {
    return PAGE_TYPE.REVIEW_ELIGIBLE;
  }

  return PAGE_TYPE.UNKNOWN;
}

export function extractOrders() {
  const orders = [];
  const seenIds = new Set();

  const rows = document.querySelectorAll("#orders-table tbody tr");
  for (const row of rows) {
    const links = row.querySelectorAll("a");
    for (const link of links) {
      const match = link.textContent.match(ORDER_ID_REGEX);
      if (match) {
        const orderId = match[0];
        if (!seenIds.has(orderId)) {
          seenIds.add(orderId);
          const detailsUrl =
            link.href || `${window.location.origin}/orders-v3/order/${orderId}`;
          orders.push({
            orderId,
            detailsUrl,
            orderDate: extractOrderDateFromRow(row),
            paymentComplete: isPaymentCompleteRow(row),
          });
        }
        break;
      }
    }
  }

  return orders;
}

function extractOrderDateFromRow(row) {
  const cells = row.querySelectorAll("td");

  for (const cell of cells) {
    const text = (cell.innerText || cell.textContent || "").trim();
    const match = text.match(ORDER_DATE_REGEX);
    if (match) return match[0];
  }

  return null;
}

function isPaymentCompleteRow(row) {
  const statusEl = row.querySelector(".main-status");
  const statusText = (
    statusEl?.innerText ||
    statusEl?.textContent ||
    ""
  ).trim();
  return statusText === PAYMENT_COMPLETE_TEXT;
}

export function goToNextPage() {
  const nextButton = findNextButton();
  if (!nextButton) {
    return { navigated: false, hasNextPage: false };
  }

  if (isDisabled(nextButton)) {
    return { navigated: false, hasNextPage: false };
  }

  simulateRealClick(nextButton);
  return { navigated: true, hasNextPage: true };
}

export async function waitForOrdersReady(options = {}) {
  const minDelayMs = Number(options.minDelayMs) || 4000;
  const timeoutMs = Number(options.timeoutMs) || 20000;
  const pollMs = Number(options.pollMs) || 200;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const elapsedMs = Date.now() - startedAt;
    const snapshot = getOrdersReadinessSnapshot();

    const minDelayPassed = elapsedMs >= minDelayMs;
    const hasPageParam = snapshot.pageParamPresent;
    const rowsReady =
      snapshot.expectedRowCount == null
        ? snapshot.rowCount > 0
        : snapshot.rowCount >= snapshot.expectedRowCount;

    if (minDelayPassed && hasPageParam && rowsReady) {
      return { ready: true, snapshot };
    }

    await waitMs(pollMs);
  }

  return {
    ready: false,
    reason: "timeout",
    snapshot: getOrdersReadinessSnapshot(),
  };
}

export function clickRequestReview() {
  const button = document.querySelector(
    "[data-test-id=plugin-button-requestAReview] a",
  );

  if (!button) {
    return {
      clicked: false,
      tooEarly: true,
      error: "Request a Review button not found — likely too early",
    };
  }

  try {
    simulateRealClick(button);
    return { clicked: true };
  } catch (err) {
    return { clicked: false, error: "Click failed: " + err.message };
  }
}

export function clickConfirmYes() {
  const katButton = document.querySelector(
    '#ayb-app .ayb-reviews-button-container kat-button[label="Yes"]',
  );

  if (!katButton) {
    return { clicked: false, error: "Yes button not found" };
  }

  try {
    const target = katButton.shadowRoot?.querySelector("button") || katButton;
    simulateRealClick(target);
    return { clicked: true };
  } catch (err) {
    return { clicked: false, error: "Click failed: " + err.message };
  }
}

export function extractOrderIdFromPage() {
  const bodyText = document.body ? document.body.innerText : "";
  const match = bodyText.match(ORDER_ID_REGEX);
  return match ? match[0] : null;
}

export function scrapeProductDetails(hintText = "", root = document) {
  const containers = root.querySelectorAll(
    '[class*="ProductDetails-module__container"]',
  );
  const selection = window.getSelection()?.toString()?.trim() || "";
  const matchText = selection || hintText;

  for (const container of containers) {
    const text = container.innerText;
    if (matchText && !text.includes(matchText)) continue;

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const data = { title: "", asin: "", sku: "", fnsku: "", condition: "" };

    data.title = lines[0] || "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === "ASIN" && lines[i + 1]) data.asin = lines[i + 1];
      else if (line === "SKU" && lines[i + 1]) data.sku = lines[i + 1];
      else if (line === "FNSKU" && lines[i + 1]) data.fnsku = lines[i + 1];
      else if (line === "Condition" && lines[i + 1])
        data.condition = lines[i + 1];
    }

    if (data.fnsku || data.asin) return data;
  }

  return null;
}

// --- Internal helpers ---

function isManageOrdersPage(url, bodyText) {
  if (
    url.includes("/orders-v3/order/") ||
    url.includes("/order-details") ||
    /\/orders\/[0-9-]+/.test(url)
  ) {
    return false;
  }
  if (
    url.includes("/orders-v3") ||
    url.includes("/orders/") ||
    url.includes("myo/orders")
  ) {
    return true;
  }
  if (bodyText.includes("Manage Orders") && bodyText.includes("Order ID")) {
    return true;
  }
  return false;
}

function isOrderDetailsPage(url, bodyText) {
  if (
    url.includes("/orders-v3/order/") ||
    url.includes("/order-details") ||
    /\/orders\/[0-9-]+/.test(url)
  ) {
    return true;
  }
  const hasOrderIdPattern = /\d{3}-\d{7}-\d{7}/.test(bodyText);
  if (hasOrderIdPattern && bodyText.includes("Order details")) {
    return true;
  }
  return false;
}

function findNextButton() {
  const nextLi = document.querySelector(
    "#myo-layout div.pagination-controls ul > li.a-last",
  );
  if (nextLi) {
    if (nextLi.classList.contains("a-disabled")) {
      return null;
    }

    const directChildAnchor = nextLi.querySelector(":scope > a");
    if (directChildAnchor) {
      return directChildAnchor;
    }

    const anchor = nextLi.querySelector("a");
    if (anchor) {
      return anchor;
    }
  }

  const allButtons = document.querySelectorAll(
    'button, a[class*="pagination"], a[class*="paging"], input[type="submit"]',
  );
  for (const btn of allButtons) {
    const text = btn.textContent.trim().toLowerCase();
    if (
      text === "next" ||
      text === "next page" ||
      text === "\u203A" ||
      text === "\u00BB"
    ) {
      return btn;
    }
  }

  const ariaNext = document.querySelector(
    '[aria-label="Next"], [aria-label="Next page"]',
  );
  if (ariaNext) return ariaNext;

  const allClickable = document.querySelectorAll('a, button, [role="button"]');
  for (const el of allClickable) {
    const btnText = el.textContent.trim();
    if (btnText === "Next" || btnText === "Next \u2192") {
      return el;
    }
  }

  return null;
}

function isDisabled(element) {
  if (element.disabled) return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element.classList.contains("disabled")) return true;
  const styles = window.getComputedStyle(element);
  if (styles.pointerEvents === "none" && parseFloat(styles.opacity) < 0.5)
    return true;
  return false;
}

function simulateRealClick(element) {
  const opts = { bubbles: true, cancelable: true, composed: true };
  element.dispatchEvent(new PointerEvent("pointerdown", opts));
  element.dispatchEvent(new MouseEvent("mousedown", opts));
  element.dispatchEvent(new PointerEvent("pointerup", opts));
  element.dispatchEvent(new MouseEvent("mouseup", opts));
  element.dispatchEvent(new MouseEvent("click", opts));
}

function getOrdersReadinessSnapshot() {
  const url = new URL(window.location.href);
  const pageParam = url.searchParams.get("page");
  const pageNumber = Number(pageParam);
  const pageParamPresent = pageParam != null && pageParam !== "";

  const totalHeading = document.querySelector(
    ".total-orders-heading > span:first-child",
  );
  const totalText = (
    totalHeading?.innerText ||
    totalHeading?.textContent ||
    ""
  ).trim();
  const totalMatch = totalText.match(/\d[\d,]*/);
  const totalOrders = totalMatch
    ? Number(totalMatch[0].replace(/,/g, ""))
    : null;

  const perPageSelect = document.querySelector(
    "select#myo-table-results-per-page",
  );
  const perPageValue = perPageSelect?.value;
  const perPage = perPageValue ? Number(perPageValue) : null;

  const rowCount = document.querySelectorAll("#orders-table tbody tr").length;

  let expectedRowCount = null;
  if (
    Number.isFinite(totalOrders) &&
    Number.isFinite(perPage) &&
    Number.isFinite(pageNumber) &&
    pageNumber > 0 &&
    perPage > 0
  ) {
    const alreadyShown = (pageNumber - 1) * perPage;
    const remaining = Math.max(totalOrders - alreadyShown, 0);
    expectedRowCount = Math.min(perPage, remaining);
  }

  return {
    pageParamPresent,
    pageNumber: Number.isFinite(pageNumber) ? pageNumber : null,
    totalOrders: Number.isFinite(totalOrders) ? totalOrders : null,
    perPage: Number.isFinite(perPage) ? perPage : null,
    expectedRowCount,
    rowCount,
  };
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
