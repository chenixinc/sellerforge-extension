import { MSG } from "../shared/constants";
import { formatPrice } from "../shared/utils";
import {
  COLORS,
  FONT_FAMILY,
  productTableCSS,
  supplierActionCSS,
  supplierCSS,
  supplierListCSS,
} from "./styles";

let currentHost = null;
let currentShadow = null;

export function showAsinToolsDialog(data) {
  if (data.loading) {
    showLoading();
    return;
  }

  if (data.error) {
    showError(data.error);
    return;
  }

  showProduct(
    data.product,
    data.suppliers || [],
    data.productDetails || null,
    data.revenueEstimate || null,
  );
}

function showLoading() {
  removeOverlay();
  const { host, shadow, dlg } = createDialog(`
    <div class="loading">Loading…</div>
  `);
  wireClose(dlg);
}

function showProduct(product, suppliers, productDetails, revenueEstimate) {
  // If already showing loading, reuse its host; otherwise create fresh
  if (!currentHost) {
    removeOverlay();
    createDialog("");
  }
  const shadow = currentShadow;
  const dlg = shadow.getElementById("dlg");

  const labelCode = productDetails?.fnsku || productDetails?.asin;
  const labelTitle = productDetails?.title || "";
  const labelCondition = productDetails?.condition || "New";

  dlg.innerHTML = `
    <button type="button" class="close-btn" title="Close">&times;</button>
    <div class="header">
      ${product.image ? `<img class="thumb" src="${escapeAttr(product.image)}" alt="" />` : ""}
      <div class="header-title">
        <strong>${escapeHtml(product.title || "No title")}</strong>
        <a class="amz-link" href="https://www.amazon.ca/dp/${escapeAttr(product.asin)}" target="_blank" rel="noopener" title="View on Amazon"><img src="https://www.amazon.ca/favicon.ico" width="14" height="14" alt="Amazon" /></a>
      </div>
    </div>
    <table class="product-table">
      ${row("ASIN", product.asin)}
      ${row("UPC", product.upc)}
      ${row("EAN", product.ean)}
      ${row("MPN", product.mpn)}
    </table>
    ${
      labelCode
        ? `
    <div class="label-section dialog-section">
      <div class="label-row">
        <select class="label-size-select" disabled>
          <option>Loading sizes…</option>
        </select>
        <button type="button" class="label-btn" disabled
          data-code="${escapeAttr(labelCode)}"
          data-title="${escapeAttr(labelTitle)}"
          data-condition="${escapeAttr(labelCondition)}">Generate FNSKU Label</button>
      </div>
    </div>`
        : ""
    }
    <div class="suppliers-section dialog-section" data-asin="${escapeAttr(product.asin)}">
      <div class="suppliers-header">Suppliers</div>
      <div class="supplier-add-row">
        <input type="url" class="supplier-input" placeholder="https://supplier-website.com" />
        <button type="button" class="supplier-add-btn">Add</button>
      </div>
      <div class="supplier-error" style="display:none"></div>
      <div class="supplier-list">
        ${suppliers.map((s) => supplierItem(s)).join("")}
      </div>
    </div>
  `;

  wireClose(dlg);
  wireSuppliers(shadow, revenueEstimate);
  wireLabelBtn(shadow);

  shadow.querySelectorAll("tr[data-value]").forEach((tr) => {
    tr.addEventListener("click", () => {
      navigator.clipboard.writeText(tr.dataset.value).then(() => {
        tr.classList.add("copied");
        setTimeout(() => tr.classList.remove("copied"), 1200);
      });
    });
  });
}

function showError(message) {
  if (!currentHost) {
    removeOverlay();
    createDialog("");
  }
  const dlg = currentShadow.getElementById("dlg");

  dlg.innerHTML = `
    <button type="button" class="close-btn" title="Close">&times;</button>
    <p style="color:#c62828;margin:0">Failed to load ASIN tools:<br/>${escapeHtml(message)}</p>
  `;

  wireClose(dlg);
  setTimeout(removeOverlay, 5000);
}

function createDialog(content) {
  removeOverlay();
  const host = document.createElement("div");
  host.id = "sf-asin-tools-host";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>${getStyles()}</style>
    <dialog id="dlg">${content}</dialog>
  `;

  document.body.appendChild(host);
  currentHost = host;
  currentShadow = shadow;

  const dlg = shadow.getElementById("dlg");
  dlg.showModal();
  return { host, shadow, dlg };
}

function wireClose(dlg) {
  const closeBtn = dlg.querySelector(".close-btn");
  if (closeBtn) closeBtn.addEventListener("click", removeOverlay);
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  dlg.addEventListener("click", (e) => {
    if (e.clientX === 0 && e.clientY === 0) return;
    const rect = dlg.getBoundingClientRect();
    const clickedOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (clickedOutside) removeOverlay();
  });
  dlg.addEventListener("close", removeOverlay);
}

function removeOverlay() {
  if (currentHost) {
    currentHost.remove();
    currentHost = null;
    currentShadow = null;
  }
}

function wireLabelBtn(shadow) {
  const btn = shadow.querySelector(".label-btn");
  if (!btn) return;

  const select = shadow.querySelector(".label-size-select");

  // Fetch available label sizes
  chrome.runtime.sendMessage({ type: MSG.GET_LABEL_SIZES }, (response) => {
    if (!response?.ok || !response.sizes?.length) {
      select.innerHTML = `<option value="0">Default</option>`;
    } else {
      select.innerHTML = response.sizes
        .map(
          (s) =>
            `<option value="${s.index}"${s.index === 1 ? " selected" : ""}>${escapeHtml(s.name)}</option>`,
        )
        .join("");
    }
    select.disabled = false;
    btn.disabled = false;
  });

  btn.addEventListener("click", () => {
    const { code, title, condition } = btn.dataset;
    chrome.runtime.sendMessage({
      type: MSG.GENERATE_LABEL,
      code,
      title,
      condition,
      size: select.value,
    });
  });
}

function row(label, value) {
  if (!value) return "";
  return `
    <tr data-value="${escapeAttr(value)}">
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(value)}</td>
    </tr>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function supplierItem(supplier) {
  let hostname;
  try {
    hostname = new URL(supplier.url).hostname;
  } catch {
    hostname = supplier.url;
  }
  const title = supplier.title || hostname;
  const iconHtml = supplier.icon
    ? `<img class="supplier-icon" src="${escapeAttr(supplier.icon)}" alt="" />`
    : `<span class="supplier-icon-placeholder">\uD83C\uDF10</span>`;
  return `
    <div class="supplier-item" data-id="${escapeAttr(supplier.id)}" data-url="${escapeAttr(supplier.url)}">
      <div class="supplier-row-wrap">
        <a class="supplier-row" href="${escapeAttr(supplier.url)}" target="_blank" rel="noopener">
          ${iconHtml}
          <span class="supplier-link">${escapeHtml(title)}</span>
        </a>
        <div class="supplier-actions">
          <button type="button" class="supplier-refresh" title="Refresh supplier data" aria-label="Refresh supplier data">↻</button>
          <button type="button" class="supplier-remove" title="Remove">&times;</button>
        </div>
      </div>
    </div>
  `;
}

function wireSuppliers(shadow, revenueEstimate) {
  const input = shadow.querySelector(".supplier-input");
  const addBtn = shadow.querySelector(".supplier-add-btn");
  const errorEl = shadow.querySelector(".supplier-error");
  const list = shadow.querySelector(".supplier-list");
  const asin = shadow.querySelector(".suppliers-section").dataset.asin;

  async function addSupplierUrl() {
    const url = input.value.trim();
    errorEl.style.display = "none";
    errorEl.textContent = "";

    try {
      new URL(url);
    } catch {
      errorEl.textContent = "Please enter a valid URL";
      errorEl.style.display = "block";
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Adding\u2026";

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.ADD_SUPPLIER,
        asin,
        url,
      });
      if (!response.ok) throw new Error(response.error);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = supplierItem(response.supplier);
      const el = wrapper.firstElementChild;
      el.dataset.asin = asin;
      list.prepend(el);
      wireRemoveBtn(el, list, errorEl);
      wireRefreshBtn(el);
      fetchSupplierData(el, false, null, revenueEstimate);
      input.value = "";
    } catch (err) {
      errorEl.textContent = err.message || "Failed to add supplier";
      errorEl.style.display = "block";
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add";
    }
  }

  addBtn.addEventListener("click", addSupplierUrl);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      addSupplierUrl();
    }
  });

  list.querySelectorAll(".supplier-item").forEach((el) => {
    el.dataset.asin = asin;
    wireRemoveBtn(el, list, errorEl);
    wireRefreshBtn(el, revenueEstimate);
    fetchSupplierData(el, false, null, revenueEstimate);
  });
}

function wireRefreshBtn(el, revenueEstimate) {
  const refreshBtn = el.querySelector(".supplier-refresh");
  if (!refreshBtn) return;

  refreshBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fetchSupplierData(el, true, refreshBtn, revenueEstimate);
  });
}

function wireRemoveBtn(el, list, errorEl) {
  const removeBtn = el.querySelector(".supplier-remove");
  removeBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Remove this supplier?")) return;
    const id = el.dataset.id;
    const asin = el.closest(".suppliers-section").dataset.asin;
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.REMOVE_SUPPLIER,
        asin,
        supplierId: id,
      });
      if (!response.ok) throw new Error(response.error);
      el.remove();
    } catch (err) {
      errorEl.textContent = err.message || "Failed to remove supplier";
      errorEl.style.display = "block";
    }
  });
}

async function fetchSupplierData(
  el,
  refresh = false,
  refreshButton = null,
  revenueEstimate = null,
) {
  const url = el.dataset.url;
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
    if (!response.ok || !response.data) return;
    const d = response.data;

    if (!d.price && !(d.stock || []).length) return;

    const container = document.createElement("div");
    container.className = "supplier-parsed";

    if (d.price) {
      const cogs = Number(d.price);

      const priceRow = document.createElement("div");
      priceRow.className = "sp-price-row";

      const priceEl = document.createElement("span");
      priceEl.className = "sp-price";
      priceEl.title = "Click to copy";
      priceEl.textContent = `$${formatPrice(cogs)}`;
      applyPriceMarginState(priceEl, cogs, revenueEstimate);
      priceRow.appendChild(priceEl);

      const qtyLabel = document.createElement("span");
      qtyLabel.className = "sp-qty-label";
      qtyLabel.textContent = "Qty:";
      priceRow.appendChild(qtyLabel);

      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.className = "sp-qty-input";
      qtyInput.value = "1";
      qtyInput.min = "1";
      qtyInput.step = "1";
      priceRow.appendChild(qtyInput);

      container.appendChild(priceRow);

      const getQty = () => Math.max(1, Math.floor(Number(qtyInput.value)) || 1);
      let activeRevenueEstimate = revenueEstimate;

      qtyInput.addEventListener("change", () => {
        const qty = getQty();
        qtyInput.value = qty;
        priceEl.textContent = `$${formatPrice(cogs * qty)}`;
        updateProfitDetails(container, cogs, activeRevenueEstimate, qty);
      });

      const priceToRevenueDivider = document.createElement("div");
      priceToRevenueDivider.className = "sp-section-divider";
      container.appendChild(priceToRevenueDivider);

      const listingPrice = Number(revenueEstimate?.listing_price);
      const inputRow = createListingPriceInputRow(
        asin,
        listingPrice,
        async (nextRevenueEstimate) => {
          activeRevenueEstimate = nextRevenueEstimate;
          applyPriceMarginState(priceEl, cogs, nextRevenueEstimate);
          updateProfitDetails(container, cogs, nextRevenueEstimate, getQty());
        },
      );
      container.appendChild(inputRow);

      updateProfitDetails(container, cogs, revenueEstimate, 1);
    }

    if (d.stock || d.stock_eta) {
      try {
        const stockDiv = document.createElement("div");
        stockDiv.className = "sp-stock";
        for (const s of d.stock) {
          const qty = s.stock ? parseInt(s.stock.replace(/^\D+/, ""), 10) : NaN;
          const cls =
            qty > 0 ? "in-stock" : s.stock_eta ? "stock-eta" : "no-stock";
          const qtyOrEta = s.stock || s.stock_eta || "";
          const eta = s.shipping_eta ? ` (${escapeHtml(s.shipping_eta)})` : "";

          stockDiv.insertAdjacentHTML(
            "beforeend",
            `<span class="sp-stock-item ${cls}">${escapeHtml(s.location || "Unknown")}: <strong>${escapeHtml(qtyOrEta)}</strong>${eta}</span>`,
          );
        }
        if (d.price && stockDiv.childElementCount > 0) {
          const revenueToStockDivider = document.createElement("div");
          revenueToStockDivider.className = "sp-section-divider";
          container.appendChild(revenueToStockDivider);
        }
        container.appendChild(stockDiv);
      } catch {
        // silently ignore stock render issues
      }
    }

    if (refresh) {
      el.querySelector(".supplier-parsed")?.remove();
    }

    el.appendChild(container);
    const priceEl = container.querySelector(".sp-price");
    if (priceEl) {
      priceEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          .writeText(priceEl.textContent.replace(/[^0-9.]/g, ""))
          .then(() => {
            priceEl.classList.add("copied");
            setTimeout(() => priceEl.classList.remove("copied"), 1200);
          });
      });
    }
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
  row.className = "sp-listing-price-row";

  const label = document.createElement("span");
  label.className = "sp-listing-price-label";
  label.textContent = "List:";

  const input = document.createElement("input");
  input.type = "number";
  input.className = "sp-listing-price-input";
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

function updateProfitDetails(container, cogs, revenueEstimate, qty = 1) {
  const existingMeta = container.querySelector(".sp-profit-meta");
  const existingBreakdown = container.querySelector(".sp-fee-breakdown");
  existingMeta?.remove();
  existingBreakdown?.remove();

  // Insert before the stock section: find the stock div and its preceding
  // divider so re-renders after listing-price changes land in the right place.
  const stockEl = container.querySelector(".sp-stock");
  const beforeDivider = stockEl?.previousElementSibling?.classList.contains(
    "sp-section-divider",
  )
    ? stockEl.previousElementSibling
    : null;
  const anchor = beforeDivider || stockEl || null;
  const insert = (node) =>
    anchor ? container.insertBefore(node, anchor) : container.appendChild(node);

  const feeRows = getFeeBreakdownRows(revenueEstimate);
  if (feeRows.length) {
    const breakdown = document.createElement("div");
    breakdown.className = "sp-fee-breakdown";

    const table = document.createElement("table");
    table.className = "sp-fee-table";
    const tbody = document.createElement("tbody");

    for (const row of feeRows) {
      const tr = document.createElement("tr");

      const labelTd = document.createElement("td");
      labelTd.className = "sp-fee-label";
      labelTd.textContent = row.label;

      const amountTd = document.createElement("td");
      amountTd.className = "sp-fee-value";
      amountTd.textContent = `$${formatPrice(row.amount * qty)}`;

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
  meta.className = "sp-profit-meta";
  applyProfitMetaState(meta, cogs, revenueEstimate);
  meta.innerHTML = `Net: <strong>$${formatPrice(metrics.netProfit * qty)}</strong> (ROI <strong>${formatPrice(metrics.roiPercent)}%</strong>)`;
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
  if (roiPercent < 5) return "sp-price-margin-low";
  if (roiPercent >= 10) return "sp-price-margin-high";
  return "";
}

function applyPriceMarginState(priceEl, cogs, revenueEstimate) {
  if (!priceEl) return;

  priceEl.classList.remove("sp-price-margin-low", "sp-price-margin-high");
  const roiPercent = getRoiPercent(revenueEstimate, cogs);
  const marginClass = getPriceMarginClass(roiPercent);
  if (marginClass) {
    priceEl.classList.add(marginClass);
  }
}

function applyProfitMetaState(metaEl, cogs, revenueEstimate) {
  if (!metaEl) return;

  metaEl.classList.remove(
    "sp-profit-meta-margin-low",
    "sp-profit-meta-margin-high",
  );
  const roiPercent = getRoiPercent(revenueEstimate, cogs);
  const marginClass = getPriceMarginClass(roiPercent);
  if (!marginClass) return;

  metaEl.classList.add(marginClass.replace("sp-price", "sp-profit-meta"));
}

const FONT_FAMILY_LOCAL = FONT_FAMILY;

function getStyles() {
  const c = COLORS;

  return `
    :host { font-family: ${FONT_FAMILY_LOCAL}; font-size: 14px; }
    dialog { font: inherit; border: none; border-radius: 10px; padding: 20px; max-width: 440px; width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.25); outline: none; }
    dialog::backdrop { background: rgba(0,0,0,0.4); }
    .close-btn { position: absolute; top: 6px; right: 10px; background: none; border: none; font-size: 1.4em; cursor: pointer; color: ${c.muted}; }
    .close-btn:hover { color: #000; }
    .header { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; padding-right: 24px; line-height: 1.4; }
    .header-title { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 6px; }
    .header-title strong { flex: 1; min-width: 0; }
    .amz-link { display: inline-flex; align-items: center; flex-shrink: 0; margin-top: 2px; opacity: 0.55; }
    .amz-link:hover { opacity: 1; }
    .thumb { width: 80px; height: 80px; flex-shrink: 0; object-fit: contain; border-radius: 6px; border: 1px solid ${c.borderLight}; background: #fafafa; }
    ${productTableCSS()}
    .product-table th { font-size: 0.9em; color: ${c.mutedLight}; padding: 5px 8px; }
    .product-table td { padding: 5px 8px; color: inherit; }
    .product-table tr.copied td:last-child::after { content: '✓ Copied'; font-size: 0.8em; }
    .loading { text-align: center; padding: 24px; color: ${c.muted}; }
    .dialog-section + .dialog-section { margin-top: 16px; padding-top: 12px; border-top: 1px solid ${c.borderLight}; }
    .label-section { margin-top: 12px; }
    .label-row { display: flex; gap: 8px; }
    .label-size-select { flex: 1; padding: 6px 10px; border: 1px solid ${c.border}; border-radius: 6px; font: inherit; font-size: 0.9em; background: #fff; }
    .label-size-select:focus { outline: none; border-color: ${c.primary}; }
    .label-size-select:disabled { background: ${c.hover}; color: #999; }
    .label-btn { padding: 6px 14px; background: ${c.primary}; color: #fff; border: none; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.9em; white-space: nowrap; }
    .label-btn:hover { background: ${c.primaryHover}; }
    .label-btn:disabled { background: ${c.primaryDisabled}; cursor: not-allowed; }
    .suppliers-header { font-weight: 600; font-size: 0.95em; margin-bottom: 8px; }
    .supplier-add-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .supplier-input { flex: 1; padding: 6px 10px; border: 1px solid ${c.border}; border-radius: 6px; font: inherit; font-size: 0.9em; }
    .supplier-input:focus { outline: none; border-color: ${c.primary}; }
    .supplier-add-btn { padding: 6px 14px; background: ${c.primary}; color: #fff; border: none; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.9em; white-space: nowrap; }
    .supplier-add-btn:hover { background: ${c.primaryHover}; }
    .supplier-add-btn:disabled { background: ${c.primaryDisabled}; cursor: not-allowed; }
    .supplier-error { color: ${c.error}; font-size: 0.85em; margin-bottom: 6px; }
    ${supplierListCSS()}
    ${supplierCSS()}
    ${supplierActionCSS()}
  `;
}
