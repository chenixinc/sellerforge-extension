import { MSG, log } from "../shared/constants";
import { formatPrice } from "../shared/utils";
import { scrapeProductDetails } from "./dom";
import {
  COLORS,
  productTableCSS,
  supplierActionCSS,
  supplierCSS,
  supplierListCSS,
} from "./styles";

const PROCESSED_ATTR = "data-sf-suppliers";

const TABLE_SEL = "table.awsui-context-compact-table";
const HEADER_CELL_SEL = `${TABLE_SEL} thead tr th`;
const LISTING_ROW_SEL = `${TABLE_SEL} tbody tr`;
const LISTING_UNPROCESSED_ROW_SEL = `${TABLE_SEL} tbody tr:not([${PROCESSED_ATTR}]), ${TABLE_SEL} tbody tr[${PROCESSED_ATTR}="false"]`;
const LISTING_CELL_SEL = "td";

const STYLE_ID = "sf-inventory-overlay-styles";

let observer = null;
let bodyObserver = null;
let currentTable = null;

export function initInventoryOverlay() {
  if (!isManageInventoryPage()) return;
  log("Inventory overlay: initializing");
  injectStyles();
  waitForTable();
  watchForChanges();
}

export function destroyInventoryOverlay() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
  currentTable = null;
}

function isManageInventoryPage() {
  const url = window.location.href;

  const isLegacyInventoryPage =
    url.includes("sellercentral") &&
    (url.includes("/inventory") || url.includes("/myinventory"));

  const isInventoryPage =
    url.includes("sellercentral") &&
    url.includes("/amazonsell/manage-products");

  return isLegacyInventoryPage || isInventoryPage;
}

function findColumnIndex(text) {
  const headerCells = document.querySelectorAll(HEADER_CELL_SEL);
  const lower = text.split("\n")[0].toLowerCase().trim();
  for (let i = 0; i < headerCells.length; i++) {
    if (headerCells[i].innerText.trim().toLowerCase().includes(lower)) {
      return i;
    }
  }
  return -1;
}

function processTable() {
  const productColIndex = findColumnIndex("product");
  const priceColIndex = findColumnIndex("inventory");
  if (productColIndex === -1) {
    log("Inventory overlay: Product column not found");
    return;
  }

  log(
    "Inventory overlay: Product col",
    productColIndex,
    "Price col",
    priceColIndex,
  );

  const rows = document.querySelectorAll(LISTING_UNPROCESSED_ROW_SEL);
  rows.forEach((row) => {
    row.setAttribute(PROCESSED_ATTR, "true");

    const cells = row.querySelectorAll(LISTING_CELL_SEL);
    const productCell = cells[productColIndex];
    if (!productCell) return;

    const priceCell = priceColIndex !== -1 ? cells[priceColIndex] : null;

    const details = scrapeProductDetails("", row);
    const asin = details?.asin;
    if (!asin) return;

    loadProductAndSuppliers(row, productCell, priceCell, asin);
  });
}

async function loadProductAndSuppliers(row, productCell, priceCell, asin) {
  log("Inventory overlay: loading data for ASIN", asin);

  try {
    const res = await chrome.runtime.sendMessage({
      type: MSG.GET_ASIN_DATA,
      asin,
    });
    if (!res?.ok) throw new Error(res?.error || "Failed to fetch ASIN data");

    // Render product info table (UPC, EAN, MPN) into __textFieldsContainer- inside product cell
    const details = scrapeProductDetails("", row);
    if (details || res.product) {
      const p = res.product;

      const rows = [
        ["ASIN", asin],
        ["FNSKU", details.fnsku],
        ["SKU", details.sku, details.skuLink],
        ["UPC", p.upc],
        ["EAN", p.ean],
        ["MPN", p.mpn],
      ].filter(([, v]) => v);

      if (rows.length) {
        const target =
          productCell.querySelector(".product-cell-text-content") ||
          productCell;
        const table = document.createElement("table");
        table.className = "sf-product-table";
        for (const [label, value, link] of rows) {
          const tr = document.createElement("tr");
          tr.dataset.value = value;
          tr.addEventListener("click", () => {
            navigator.clipboard.writeText(value).then(() => {
              tr.classList.add("sf-copied");
              setTimeout(() => tr.classList.remove("sf-copied"), 1200);
            });
          });
          const th = document.createElement("th");
          th.textContent = label;
          const td = document.createElement("td");
          if (link) {
            const a = document.createElement("a");
            a.href = link;
            a.target = "_blank";
            a.textContent = value;
            td.appendChild(a);
          } else {
            td.textContent = value;
          }
          tr.appendChild(th);
          tr.appendChild(td);
          table.appendChild(tr);
        }
        target.appendChild(table);

        productCell.querySelector(
          ".product-cell-text-content div:nth-child(2)",
        ).style.display = "none";
      }
    }

    // Render suppliers into price column cell
    if (res.suppliers?.length && priceCell) {
      const suppliersDiv = document.createElement("div");
      suppliersDiv.className = "sf-supplier-list";
      for (const supplier of res.suppliers) {
        const el = renderSupplierItem(supplier);
        suppliersDiv.appendChild(el);
        fetchSupplierData(el, supplier.url);
      }
      priceCell.appendChild(suppliersDiv);
    }
  } catch (err) {
    log("Inventory overlay: failed to load data for", asin, err.message);
  }
}

function renderSupplierItem(supplier) {
  let hostname;
  try {
    hostname = new URL(supplier.url).hostname;
  } catch {
    hostname = supplier.url;
  }
  const title = supplier.title || hostname;

  const el = document.createElement("div");
  el.className = "sf-supplier-item";
  el.dataset.url = supplier.url;

  const row = document.createElement("div");
  row.className = "sf-supplier-row-wrap";

  const link = document.createElement("a");
  link.className = "sf-supplier-row";
  link.href = supplier.url;
  link.target = "_blank";
  link.rel = "noopener";

  if (supplier.icon) {
    const icon = document.createElement("img");
    icon.className = "sf-supplier-icon";
    icon.src = supplier.icon;
    icon.alt = "";
    link.appendChild(icon);
  }

  const nameSpan = document.createElement("span");
  nameSpan.className = "sf-supplier-link";
  nameSpan.textContent = title;
  link.appendChild(nameSpan);

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "sf-supplier-refresh";
  refreshButton.title = "Refresh supplier data";
  refreshButton.setAttribute("aria-label", "Refresh supplier data");
  refreshButton.textContent = "↻";
  refreshButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fetchSupplierData(el, supplier.url, true, refreshButton);
  });

  row.appendChild(link);
  row.appendChild(refreshButton);
  el.appendChild(row);
  return el;
}

async function fetchSupplierData(
  el,
  url,
  refresh = false,
  refreshButton = null,
) {
  if (!url) return;
  try {
    if (refreshButton) {
      refreshButton.disabled = true;
    }
    const response = await chrome.runtime.sendMessage({
      type: MSG.PARSE_SUPPLIER,
      url,
      refresh,
    });
    if (!response?.ok || !response.data) return;
    const d = response.data;

    if (!d.price && !(d.stock || []).length) return;

    const info = document.createElement("div");
    info.className = "sf-supplier-parsed";

    if (d.price) {
      const priceEl = document.createElement("span");
      priceEl.className = "sf-sp-price";
      priceEl.title = "Click to copy";
      priceEl.textContent = `$${formatPrice(d.price)}`;
      priceEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          .writeText(priceEl.textContent.replace(/[^0-9.]/g, ""))
          .then(() => {
            priceEl.classList.add("sf-copied");
            setTimeout(() => priceEl.classList.remove("sf-copied"), 1200);
          });
      });
      info.appendChild(priceEl);
    }

    if (d.stock || d.stock_eta) {
      try {
        const stockDiv = document.createElement("div");
        stockDiv.className = "sf-sp-stock";
        for (const s of d.stock) {
          const stockSpan = document.createElement("span");
          const inStock =
            s.stock && parseInt(s.stock.replace(/^\D+/, ""), 10) > 0;
          stockSpan.className = `sf-sp-stock-item ${inStock ? "sf-in-stock" : s.stock_eta ? "sf-stock-eta" : "sf-no-stock"}`;

          const locText = document.createTextNode(`${s.location}: `);
          stockSpan.appendChild(locText);

          const strong = document.createElement("strong");
          strong.textContent = s.stock || s.stock_eta;
          stockSpan.appendChild(strong);

          if (s.shipping_eta) {
            const eta = document.createTextNode(` (${s.shipping_eta})`);
            stockSpan.appendChild(eta);
          }

          stockDiv.appendChild(stockSpan);
        }
        info.appendChild(stockDiv);
      } catch (err) {
        log("Failed to render stock info for", url, err.message);
      }
    }

    if (refresh) {
      el.querySelector(".sf-supplier-parsed")?.remove();
    }

    el.appendChild(info);
  } catch {
    // silently ignore
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

function waitForTable() {
  const table = document.querySelector(TABLE_SEL);
  if (table && findColumnIndex("product") !== -1) {
    processTable();
    observeTableChanges(table);
    return;
  }

  // Table or headers not ready yet — watch for them to appear
  const bodyObserver = new MutationObserver(() => {
    const t = document.querySelector(TABLE_SEL);
    if (t && findColumnIndex("product") !== -1) {
      bodyObserver.disconnect();
      processTable();
      observeTableChanges(t);
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function observeTableChanges(table) {
  if (!table || table === currentTable) return;
  currentTable = table;

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    processTable();
  });

  observer.observe(table, { childList: true, subtree: true });
}

function watchForChanges() {
  if (bodyObserver) return;

  // Watch the body for table replacements (search/filter redraws the table
  // element entirely) and SPA navigations that change the URL.
  bodyObserver = new MutationObserver(() => {
    const table = document.querySelector(TABLE_SEL);
    const unprocessedRows = document.querySelectorAll(
      LISTING_UNPROCESSED_ROW_SEL,
    );
    if (
      table &&
      findColumnIndex("product") !== -1 &&
      (table !== currentTable || unprocessedRows.length > 0)
    ) {
      log("Inventory overlay: table replaced, re-attaching");
      processTable();
      observeTableChanges(table);
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  const c = COLORS;
  style.textContent = `
    .sf-supplier-overlay {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
      font-size: 12px;
    }
    ${productTableCSS("sf-")}
    ${supplierListCSS("sf-")}
    ${supplierCSS("sf-")}
    ${supplierActionCSS("sf-")}
    .sf-supplier-item { border: 1px solid ${c.borderLight}; background: #f8f8f8; }
    .sf-supplier-item:hover { background: #f0f0f0; }
  `;
  document.head.appendChild(style);
}
