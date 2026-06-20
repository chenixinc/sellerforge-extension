export const DEBUG = true;

export function log(...args) {
  if (DEBUG) {
    console.log("[SF]", ...args);
  }
}

export const ORDER_STATUS = {
  DISCOVERED: "discovered",
  PROCESSING: "processing",
  REQUESTED: "requested",
  ALREADY_REQUESTED: "already_requested",
  TOO_EARLY: "too_early",
  FAILED: "failed",
  UNRECOGNIZED_PAGE: "unrecognized_page",
};

export const TERMINAL_STATUSES = [
  ORDER_STATUS.REQUESTED,
  ORDER_STATUS.ALREADY_REQUESTED,
];

export const RUN_STATUS = {
  IDLE: "idle",
  DISCOVERING: "discovering",
  PROCESSING: "processing",
  COMPLETED: "completed",
  STOPPED: "stopped",
};

export const PAGE_TYPE = {
  MANAGE_ORDERS: "manage_orders",
  ORDER_DETAILS: "order_details",
  REVIEW_TOO_EARLY: "review_too_early",
  REVIEW_ALREADY_REQUESTED: "review_already_requested",
  REVIEW_ELIGIBLE: "review_eligible",
  REVIEW_SUCCESS: "review_success",
  UNKNOWN: "unknown",
};

export const MSG = {
  // Popup → Background
  START_RUN: "START_RUN",
  STOP_RUN: "STOP_RUN",
  GET_STATE: "GET_STATE",
  SIGN_IN: "SIGN_IN",
  SIGN_OUT: "SIGN_OUT",
  GET_AUTH_STATE: "GET_AUTH_STATE",

  // Background → Content Script
  DETECT_PAGE: "DETECT_PAGE",
  EXTRACT_ORDERS: "EXTRACT_ORDERS",
  GO_NEXT_PAGE: "GO_NEXT_PAGE",
  WAIT_FOR_ORDERS_READY: "WAIT_FOR_ORDERS_READY",
  CLICK_REQUEST_REVIEW: "CLICK_REQUEST_REVIEW",
  DETECT_REVIEW_RESULT: "DETECT_REVIEW_RESULT",
  CLICK_CONFIRM_YES: "CLICK_CONFIRM_YES",
  EXTRACT_ORDER_ID: "EXTRACT_ORDER_ID",

  // Background → Popup
  STATE_UPDATE: "STATE_UPDATE",
  AUTH_STATE_UPDATE: "AUTH_STATE_UPDATE",

  // Schedule
  GET_SCHEDULE: "GET_SCHEDULE",
  SET_SCHEDULE: "SET_SCHEDULE",

  // Orders list
  GET_REQUESTED_ORDERS: "GET_REQUESTED_ORDERS",
  REQUESTED_ORDERS_UPDATE: "REQUESTED_ORDERS_UPDATE",

  // Context menu → Content script
  PING: "PING",
  SCRAPE_PRODUCT_DETAILS: "SCRAPE_PRODUCT_DETAILS",
  GET_CLICKED_ASIN: "GET_CLICKED_ASIN",
  SHOW_ASIN_TOOLS: "SHOW_ASIN_TOOLS",
  SHOW_ASIN_TOOLS_LOADING: "SHOW_ASIN_TOOLS_LOADING",
  GENERATE_LABEL: "GENERATE_LABEL",
  GET_LABEL_SIZES: "GET_LABEL_SIZES",

  // Product + Suppliers
  GET_ASIN_DATA: "GET_ASIN_DATA",
  GET_REVENUE_ESTIMATE: "GET_REVENUE_ESTIMATE",
  ADD_SUPPLIER: "ADD_SUPPLIER",
  REMOVE_SUPPLIER: "REMOVE_SUPPLIER",
  PARSE_SUPPLIER: "PARSE_SUPPLIER",

  // External extensions
  OPEN_SELLERAMP: "OPEN_SELLERAMP",
};

export const DEFAULT_ORDERS_URL =
  "https://sellercentral.amazon.ca/orders-v3?date-range=last-30&sort=order_date_asc";

export const TIMING = {
  PAGE_LOAD_WAIT_MS: 3000,
  AFTER_CLICK_WAIT_MS: 2000,
  BETWEEN_ORDERS_MS: 1500,
  PAGINATION_WAIT_MS: 2500,
  REVIEW_RESULT_POLL_MS: 1500,
  MAX_REVIEW_WAIT_MS: 15000,
};
