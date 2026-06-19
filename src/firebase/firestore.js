import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { log, TERMINAL_STATUSES } from "../shared/constants";
import { requireUser } from "./auth";

let db = null;

function getDb() {
  if (db) return db;
  db = firebase.firestore();
  return db;
}

async function ordersCollection() {
  const user = await requireUser();
  return getDb().collection("users").doc(user.uid).collection("orders");
}

export async function saveOrderState(orderData) {
  const { orderId, ...rest } = orderData;
  if (!orderId) throw new Error("orderId is required");

  const col = await ordersCollection();
  const docRef = col.doc(orderId);
  const doc = await docRef.get();
  const now = new Date().toISOString();

  if (doc.exists) {
    await docRef.update({ ...rest, updatedAt: now, lastCheckedAt: now });
  } else {
    await docRef.set({
      orderId,
      ...rest,
      createdAt: now,
      updatedAt: now,
      lastCheckedAt: now,
    });
  }
}

export async function getOrderStates(orderIds) {
  if (!orderIds || orderIds.length === 0) return new Map();

  const col = await ordersCollection();
  const result = new Map();
  const batchSize = 30;

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const snapshot = await col.where("orderId", "in", batch).get();
    snapshot.forEach((doc) => result.set(doc.id, doc.data()));
  }

  return result;
}

export async function getSkippableOrderIds(orderIds) {
  const states = await getOrderStates(orderIds);
  const skippable = new Set();

  states.forEach((data, orderId) => {
    if (TERMINAL_STATUSES.includes(data.status)) {
      skippable.add(orderId);
    }
  });

  return skippable;
}

export async function clearAllOrderStates() {
  const col = await ordersCollection();
  const batchSize = 100;

  let snapshot = await col.limit(batchSize).get();

  while (!snapshot.empty) {
    const batch = getDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    snapshot = await col.limit(batchSize).get();
  }
}

export async function getRequestedOrders() {
  const col = await ordersCollection();
  const snapshot = await col
    .where("status", "==", "requested")
    .orderBy("lastRequestedAt", "desc")
    .limit(100)
    .get();

  const orders = [];
  snapshot.forEach((doc) => orders.push(doc.data()));
  return orders;
}

let activeWatcher = null;

export async function watchRequestedOrders(onChange) {
  if (activeWatcher) {
    activeWatcher();
    activeWatcher = null;
  }

  try {
    const col = await ordersCollection();
    activeWatcher = col
      .where("status", "==", "requested")
      .orderBy("lastRequestedAt", "desc")
      .limit(100)
      .onSnapshot(
        (snapshot) => {
          const orders = [];
          snapshot.forEach((doc) => orders.push(doc.data()));
          onChange(orders);
        },
        (err) => log("Watcher error:", err.message),
      );
  } catch (e) {
    log("Failed to start watcher:", e.message);
  }
}

export function stopWatchingOrders() {
  if (activeWatcher) {
    activeWatcher();
    activeWatcher = null;
  }
}

// --- Suppliers ---

async function suppliersCollection(asin) {
  const user = await requireUser();
  return getDb()
    .collection("users")
    .doc(user.uid)
    .collection("suppliers")
    .doc(asin)
    .collection("items");
}

export async function getSuppliers(asin) {
  const col = await suppliersCollection(asin);
  const snapshot = await col.orderBy("createdAt", "desc").get();
  const suppliers = [];
  snapshot.forEach((doc) => suppliers.push({ id: doc.id, ...doc.data() }));
  return suppliers;
}

export async function addSupplier(asin, { url, title, icon }) {
  const col = await suppliersCollection(asin);
  const now = new Date().toISOString();
  const docRef = await col.add({ url, title, icon, createdAt: now });
  return { id: docRef.id, url, title, icon, createdAt: now };
}

export async function removeSupplier(asin, supplierId) {
  const col = await suppliersCollection(asin);
  await col.doc(supplierId).delete();
}
