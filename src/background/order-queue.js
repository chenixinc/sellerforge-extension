export class OrderQueue {
  constructor() {
    this.reset();
  }

  reset() {
    this.discovered = new Map();
    this.queue = [];
    this.currentIndex = 0;
  }

  addDiscoveredOrders(orders) {
    let newCount = 0;
    for (const order of orders) {
      if (!this.discovered.has(order.orderId)) {
        this.discovered.set(order.orderId, order);
        newCount++;
      }
    }
    return newCount;
  }

  buildQueue(skippableIds) {
    this.queue = [];
    this.currentIndex = 0;

    this.discovered.forEach((order, orderId) => {
      if (!skippableIds.has(orderId)) {
        this.queue.push(orderId);
      }
    });
  }

  next() {
    if (this.currentIndex >= this.queue.length) return null;
    const orderId = this.queue[this.currentIndex];
    this.currentIndex++;
    return this.discovered.get(orderId);
  }

  hasNext() {
    return this.currentIndex < this.queue.length;
  }

  getAllDiscoveredIds() {
    return Array.from(this.discovered.keys());
  }

  getAllDiscoveredOrders() {
    return Array.from(this.discovered.values());
  }

  get discoveredCount() {
    return this.discovered.size;
  }

  get queuedCount() {
    return this.queue.length;
  }

  get processedCount() {
    return this.currentIndex;
  }
}
