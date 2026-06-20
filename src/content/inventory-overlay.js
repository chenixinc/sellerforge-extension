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
        const el = renderSupplierItem(supplier, res.revenueEstimate || null);
        el.dataset.asin = asin;
        suppliersDiv.appendChild(el);
        fetchSupplierData(
          el,
          supplier.url,
          false,
          null,
          res.revenueEstimate || null,
        );
      }
      priceCell.appendChild(suppliersDiv);
    }
  } catch (err) {
    log("Inventory overlay: failed to load data for", asin, err.message);
  }
}

function renderSupplierItem(supplier, revenueEstimate = null) {
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
    fetchSupplierData(el, supplier.url, true, refreshButton, revenueEstimate);
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
  revenueEstimate = null,
) {
  const asin = el.dataset.asin;
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
      const cogs = Number(d.price);
      applyPriceMarginState(priceEl, cogs, revenueEstimate);
      info.appendChild(priceEl);

      const priceToRevenueDivider = document.createElement("div");
      priceToRevenueDivider.className = "sf-sp-section-divider";
      info.appendChild(priceToRevenueDivider);

      const listingPrice = Number(revenueEstimate?.listing_price);
      const inputRow = createListingPriceInputRow(
        asin,
        listingPrice,
        async (nextRevenueEstimate) => {
          applyPriceMarginState(priceEl, cogs, nextRevenueEstimate);
          updateProfitDetails(info, cogs, nextRevenueEstimate, "sf-");
        },
      );
      info.appendChild(inputRow);

      updateProfitDetails(info, cogs, revenueEstimate, "sf-");

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
        if (d.price && stockDiv.childElementCount > 0) {
          const revenueToStockDivider = document.createElement("div");
          revenueToStockDivider.className = "sf-sp-section-divider";
          info.appendChild(revenueToStockDivider);
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

function createListingPriceInputRow(asin, listingPrice, onUpdatedEstimate) {
  const row = document.createElement("div");
  row.className = "sf-sp-listing-price-row";

  const label = document.createElement("span");
  label.className = "sf-sp-listing-price-label";
  label.textContent = "List:";

  const input = document.createElement("input");
  input.type = "number";
  input.className = "sf-sp-listing-price-input";
  input.step = "0.01";
  input.min = "0.01";
  if (Number.isFinite(listingPrice) && listingPrice > 0) {
    input.value = formatPrice(listingPrice);
  }

  const submitOverride = async () => {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0 || !asin) return;

    input.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.GET_REVENUE_ESTIMATE,
        asin,
        listingPrice: value,
        refresh: true,
      });
      if (!response?.ok || !response.data) return;

      input.value = formatPrice(Number(response.data.listing_price) || value);
      onUpdatedEstimate(response.data);
    } finally {
      input.disabled = false;
    }
  };

  input.addEventListener("change", submitOverride);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitOverride();
    }
  });

  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function updateProfitDetails(info, cogs, revenueEstimate, prefix = "") {
  const existingMeta = info.querySelector(`.${prefix}sp-profit-meta`);
  const existingBreakdown = info.querySelector(`.${prefix}sp-fee-breakdown`);
  existingMeta?.remove();
  existingBreakdown?.remove();

  // Insert before the stock section: find the stock div and its preceding
  // divider so re-renders after listing-price changes land in the right place.
  const stockEl = info.querySelector(`.${prefix}sp-stock`);
  const beforeDivider = stockEl?.previousElementSibling?.classList.contains(
    `${prefix}sp-section-divider`,
  )
    ? stockEl.previousElementSibling
    : null;
  const anchor = beforeDivider || stockEl || null;
  const insert = (node) =>
    anchor ? info.insertBefore(node, anchor) : info.appendChild(node);

  const feeRows = getFeeBreakdownRows(revenueEstimate);
  if (feeRows.length) {
    const breakdown = document.createElement("div");
    breakdown.className = `${prefix}sp-fee-breakdown`;

    const table = document.createElement("table");
    table.className = `${prefix}sp-fee-table`;
    const tbody = document.createElement("tbody");

    for (const row of feeRows) {
      const tr = document.createElement("tr");

      const labelTd = document.createElement("td");
      labelTd.className = `${prefix}sp-fee-label`;
      labelTd.textContent = row.label;

      const amountTd = document.createElement("td");
      amountTd.className = `${prefix}sp-fee-value`;
      amountTd.textContent = `$${formatPrice(row.amount)}`;

      tr.appendChild(labelTd);
      tr.appendChild(amountTd);
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    breakdown.appendChild(table);
    insert(breakdown);
  }

  const metrics = getProfitMetrics(revenueEstimate, cogs);
  if (!metrics) return;

  const meta = document.createElement("div");
  meta.className = `${prefix}sp-profit-meta`;
  applyProfitMetaState(meta, cogs, revenueEstimate);
  meta.innerHTML = `Net: <strong>$${formatPrice(metrics.netProfit)}</strong> (ROI <strong>${formatPrice(metrics.roiPercent)}%</strong>)`;
  insert(meta);
}

function getFeeBreakdownRows(revenueEstimate) {
  if (!revenueEstimate) return [];

  const rows = [];
  const breakdown = revenueEstimate.fee_breakdown || {};
  const feeAliases = {
    ReferralFee: "Referral fee",
    VariableClosingFee: "Variable closing fee",
    PerItemFee: "Per item fee",
    FBAFees: "FBA fees",
  };

  for (const [name, value] of Object.entries(breakdown)) {
    const amount = Number(value?.amount);
    const alwaysShow = name === "ReferralFee" || name === "FBAFees";
    if (!Number.isFinite(amount) || (amount <= 0 && !alwaysShow)) continue;
    rows.push({ label: feeAliases[name] || name, amount });
  }

  const totalFees = Number(revenueEstimate?.total_fees?.amount);
  if (Number.isFinite(totalFees) && totalFees > 0) {
    rows.push({ label: "Total fees", amount: totalFees });
  }

  const revenueBeforeCogs = Number(
    revenueEstimate?.estimated_revenue_before_cogs?.amount,
  );
  if (Number.isFinite(revenueBeforeCogs)) {
    rows.push({ label: "Revenue", amount: revenueBeforeCogs });
  }

  return rows;
}

function getRoiPercent(revenueEstimate, cogs) {
  const revenueBeforeCogs = Number(
    revenueEstimate?.estimated_revenue_before_cogs?.amount,
  );

  if (
    !Number.isFinite(cogs) ||
    !Number.isFinite(revenueBeforeCogs) ||
    cogs <= 0
  ) {
    return null;
  }

  return ((revenueBeforeCogs - cogs) / cogs) * 100;
}

function getProfitMetrics(revenueEstimate, cogs) {
  const revenueBeforeCogs = Number(
    revenueEstimate?.estimated_revenue_before_cogs?.amount,
  );
  const roiPercent = getRoiPercent(revenueEstimate, cogs);

  if (!Number.isFinite(revenueBeforeCogs) || !Number.isFinite(roiPercent)) {
    return null;
  }

  return {
    netProfit: revenueBeforeCogs - cogs,
    roiPercent,
  };
}

function getPriceMarginClass(roiPercent) {
  if (!Number.isFinite(roiPercent)) return "";
  if (roiPercent < 5) return "sf-sp-price-margin-low";
  if (roiPercent >= 10) return "sf-sp-price-margin-high";
  return "";
}

function applyPriceMarginState(priceEl, cogs, revenueEstimate) {
  if (!priceEl) return;

  priceEl.classList.remove("sf-sp-price-margin-low", "sf-sp-price-margin-high");
  const roiPercent = getRoiPercent(revenueEstimate, cogs);
  const marginClass = getPriceMarginClass(roiPercent);
  if (marginClass) {
    priceEl.classList.add(marginClass);
  }
}

function applyProfitMetaState(metaEl, cogs, revenueEstimate) {
  if (!metaEl) return;

  metaEl.classList.remove(
    "sf-sp-profit-meta-margin-low",
    "sf-sp-profit-meta-margin-high",
  );
  const roiPercent = getRoiPercent(revenueEstimate, cogs);
  const marginClass = getPriceMarginClass(roiPercent);
  if (!marginClass) return;

  metaEl.classList.add(marginClass.replace("sp-price", "sp-profit-meta"));
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
  `;
  document.head.appendChild(style);
}
