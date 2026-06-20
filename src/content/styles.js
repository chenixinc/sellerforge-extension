// Shared design tokens and style generators for content-script UI

export const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const COLORS = {
  primary: "#ff9900",
  primaryHover: "#e68a00",
  primaryDisabled: "#ffcc80",
  link: "#006ce0",
  linkHover: "#002b66",
  error: "#c62828",
  border: "#ccc",
  borderLight: "#e0e0e0",
  hover: "#f5f5f5",
  muted: "#696969",
  mutedLight: "#888",
  success: "#008030",
  text: "#333",
};

/**
 * CSS for a product-info table (UPC / EAN / MPN rows).
 * @param {string} p - class-name prefix (e.g. "" for shadow DOM, "sf-" for page)
 */
export function productTableCSS(p = "") {
  const c = COLORS;
  return `
    ${s(p, "product-table")} { width: 100%; border-collapse: collapse; }
    ${s(p, "product-table")} th { text-align: left; font-weight: normal; text-transform: uppercase; color: ${c.muted}; background: transparent !important; padding: 0; white-space: nowrap; width: 1%; min-width: 70px; }
    ${s(p, "product-table")} td { padding: 0; user-select: all; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; }
    ${s(p, "product-table")} tr td a { color: ${c.link} !important; text-decoration: none !important; }
    ${s(p, "product-table")} tr td a:hover { color: ${c.linkHover} !important; text-decoration: none !important; }
    ${s(p, "product-table")} tr[data-value] { cursor: pointer; }
    ${s(p, "product-table")} tr[data-value]:hover { background: ${c.hover}; }
    ${s(p, "product-table")} tr.${p}copied td:last-child::after { content: '✓'; position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: ${c.success}; font-size: 1em; }`;
}

/**
 * CSS for supplier items (link + icon + name) and parsed data (price + stock).
 * @param {string} p - class-name prefix
 */
export function supplierCSS(p = "") {
  const c = COLORS;
  return `
    ${s(p, "supplier-item")} { display: flex; flex-direction: column; padding: 6px 8px 8px; border-radius: 6px; min-width: 0; overflow: hidden; }
    ${s(p, "supplier-row")} { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; overflow: hidden; }
    ${s(p, "supplier-icon")} { width: 16px; height: 16px; flex-shrink: 0; object-fit: contain; }
    ${s(p, "supplier-icon-placeholder")} { width: 16px; height: 16px; flex-shrink: 0; font-size: 14px; line-height: 16px; text-align: center; }
    ${s(p, "supplier-link")} { flex: 1; min-width: 0; color: ${c.link}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9em; text-decoration: none !important; }
    ${s(p, "supplier-link")}:hover { color: ${c.linkHover}; }
    ${s(p, "supplier-remove")} { background: none; border: none; color: #999; cursor: pointer; font-size: 1.2em; padding: 0 4px; flex-shrink: 0; }
    ${s(p, "supplier-remove")}:hover { color: ${c.error}; }
    ${s(p, "supplier-parsed")} { margin-top: 4px; gap: 4px; font-size: 0.9em; color: ${c.text}; display: flex; flex-direction: column; gap: 4px; padding-left: 24px; }
    ${s(p, "supplier-parsed-loading")} { font-size: 0.9em; color: #999; }
    ${s(p, "sp-price")} { font-weight: 700; font-size: 1.3em; cursor: pointer; white-space: nowrap; position: relative; }
    ${s(p, "sp-price")}.${p}sp-price-margin-low { color: ${c.error}; }
    ${s(p, "sp-price")}.${p}sp-price-margin-high { color: ${c.success}; }
    ${s(p, "sp-price")}:hover { text-decoration: underline; }
    ${s(p, "sp-price")}::after { content: '✓'; margin-left: 4px; color: ${c.success}; font-size: 1em; visibility: hidden; opacity: 0; }
    ${s(p, "sp-price")}.${p}copied::after { visibility: visible; opacity: 1; }
    ${s(p, "sp-listing-price-row")} { display: flex; align-items: center; gap: 6px; }
    ${s(p, "sp-listing-price-label")} { font-size: 0.95em; color: ${c.muted}; white-space: nowrap; }
    ${s(p, "sp-listing-price-input")} { width: 84px; min-width: 0; padding: 2px 6px; border: 1px solid ${c.border}; border-radius: 4px; font: inherit; font-size: 0.95em; line-height: 1.2; }
    ${s(p, "sp-listing-price-input")}:focus { outline: none; border-color: ${c.primary}; }
    ${s(p, "sp-listing-price-input")}:disabled { background: ${c.hover}; color: ${c.mutedLight}; }
    ${s(p, "sp-section-divider")} { width: 130px; border-top: 1px solid #eaeaea; margin: 2px 0; }
    ${s(p, "sp-profit-meta")} { font-size: 0.95em; color: ${c.muted}; line-height: 1.2; }
    ${s(p, "sp-profit-meta")}.${p}sp-profit-meta-margin-low strong { color: ${c.error}; }
    ${s(p, "sp-profit-meta")}.${p}sp-profit-meta-margin-high strong { color: ${c.success}; }
    ${s(p, "sp-fee-breakdown")} { font-size: 0.95em; color: ${c.muted}; line-height: 1.2; white-space: normal; }
    ${s(p, "sp-fee-table")} { border-collapse: collapse; width: auto; }
    ${s(p, "sp-fee-table")} td { padding: 0; }
    ${s(p, "sp-fee-label")} { padding-right: 10px !important; white-space: nowrap; }
    ${s(p, "sp-fee-value")} { text-align: right; white-space: nowrap; }
    ${s(p, "sp-stock")} { display: flex; flex-direction: column; }
    ${s(p, "sp-stock-item")} { color: ${c.text}; line-height: 1.2em; }
    ${s(p, "sp-stock-item")}.${p}in-stock { color: ${c.text}; }
    ${s(p, "sp-stock-item")}.${p}stock-eta { color: ${c.muted}; }
    ${s(p, "sp-stock-item")}.${p}no-stock { color: ${c.mutedLight}; }`;
}

/**
 * CSS for supplier row actions (refresh/remove) in list items.
 * @param {string} p - class-name prefix
 */
export function supplierActionCSS(p = "") {
  const c = COLORS;
  return `
    ${s(p, "supplier-row-wrap")} { display: flex; flex-direction: row; align-items: flex-start; gap: 6px; width: 100%; }
    ${s(p, "supplier-actions")} { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }
    ${s(p, "supplier-refresh")} { background: none; border: none; color: ${c.mutedLight}; cursor: pointer; flex-shrink: 0; padding: 0; line-height: 1; font-size: 18px; width: 18px; height: 18px; margin-left: auto; }
    ${s(p, "supplier-refresh")}:hover:not(:disabled) { color: ${c.link}; }
    ${s(p, "supplier-refresh")}:disabled { cursor: progress; opacity: 0.55; }`;
}

/**
 * CSS for the supplier-list container.
 * @param {string} p - class-name prefix
 */
export function supplierListCSS(p = "") {
  return `
    ${s(p, "supplier-list")} { display: flex; flex-direction: column; gap: 4px; padding: 8px 0; width: 0; min-width: 100%; overflow: hidden; }`;
}

// Helper: build a class selector with optional prefix
function s(prefix, name) {
  return `.${prefix}${name}`;
}
