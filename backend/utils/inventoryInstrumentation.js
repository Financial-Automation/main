import v8 from "v8";
import { performance, monitorEventLoopDelay } from "perf_hooks";
import { getSubscriptionCacheMetrics, resetSubscriptionCacheMetrics } from "./authMiddleware.js";
import { getInventoryCoalescingMetrics, resetInventoryCoalescingMetrics } from "../routes/inventoryRoutes.js";

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

const MAX_BUFFER_SIZE = 2000;

class RingBuffer {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
    this.writeIndex = 0;
    this.size = 0;
    this.totalPushed = 0;
  }

  push(item) {
    this.buffer[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    }
    this.totalPushed++;
  }

  reset() {
    this.buffer.fill(null);
    this.writeIndex = 0;
    this.size = 0;
    this.totalPushed = 0;
  }

  getArray() {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [
      ...this.buffer.slice(this.writeIndex, this.capacity),
      ...this.buffer.slice(0, this.writeIndex)
    ];
  }
}

// APM Tracking Structures
export const requestMetricsBuffer = new RingBuffer(MAX_BUFFER_SIZE);
export const driverCommandDurationsBuffer = new RingBuffer(MAX_BUFFER_SIZE);
export const poolCheckoutDurationsBuffer = new RingBuffer(MAX_BUFFER_SIZE);

const inFlightCommands = new Map();
const inFlightPoolCheckouts = new Map();
let poolCheckoutFailures = 0;

let cpuStartUsage = process.cpuUsage();
let cpuStartTime = performance.now();

export const initMongoAPM = (mongooseInstance) => {
  const attachListeners = (client) => {
    if (!client) return;
    try {
      client.on("connectionCheckOutStarted", (event) => {
        const key = event.connectionId != null ? event.connectionId : performance.now();
        inFlightPoolCheckouts.set(key, performance.now());
      });

      client.on("connectionCheckedOut", (event) => {
        const key = event.connectionId;
        let startTime = inFlightPoolCheckouts.get(key);
        if (!startTime && inFlightPoolCheckouts.size > 0) {
          const firstKey = inFlightPoolCheckouts.keys().next().value;
          startTime = inFlightPoolCheckouts.get(firstKey);
          inFlightPoolCheckouts.delete(firstKey);
        } else if (key != null) {
          inFlightPoolCheckouts.delete(key);
        }
        const dur = startTime ? performance.now() - startTime : 0;
        poolCheckoutDurationsBuffer.push(dur);
      });

      client.on("connectionCheckOutFailed", (_event) => {
        poolCheckoutFailures++;
      });

      client.on("commandStarted", (event) => {
        if (event.commandName === "find" && event.command && event.command.find === "inventoryitems") {
          inFlightCommands.set(event.requestId, performance.now());
        }
      });

      client.on("commandSucceeded", (event) => {
        if (inFlightCommands.has(event.requestId)) {
          const dur = event.duration != null ? event.duration : 0;
          driverCommandDurationsBuffer.push(dur);
          inFlightCommands.delete(event.requestId);
        }
      });

      client.on("commandFailed", (event) => {
        inFlightCommands.delete(event.requestId);
      });
    } catch (err) {
      console.error("Error attaching Mongo APM listeners:", err);
    }
  };

  try {
    if (mongooseInstance.connection.readyState === 1) {
      attachListeners(mongooseInstance.connection.getClient());
    } else {
      mongooseInstance.connection.once("open", () => {
        attachListeners(mongooseInstance.connection.getClient());
      });
    }
  } catch (err) {
    console.error("Mongo APM setup error:", err);
  }
};

export const resetInventoryMetrics = () => {
  requestMetricsBuffer.reset();
  driverCommandDurationsBuffer.reset();
  poolCheckoutDurationsBuffer.reset();
  poolCheckoutFailures = 0;
  cpuStartUsage = process.cpuUsage();
  cpuStartTime = performance.now();
  histogram.reset();
  resetSubscriptionCacheMetrics();
  resetInventoryCoalescingMetrics();
  inFlightCommands.clear();
  inFlightPoolCheckouts.clear();
};

export const recordInventoryMetric = (metric) => {
  requestMetricsBuffer.push(metric);
};

const calcPercentiles = (arr) => {
  if (!arr || arr.length === 0) {
    return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  const sorted = [...arr].sort((a, b) => a - b);
  const len = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  
  const avg = sum / len;
  const p50 = sorted[Math.floor(len * 0.50)] || sorted[0];
  const p95 = sorted[Math.floor(len * 0.95)] || sorted[len - 1];
  const p99 = sorted[Math.floor(len * 0.99)] || sorted[len - 1];
  const max = sorted[len - 1];
  
  return {
    avg: Number(avg.toFixed(3)),
    p50: Number(p50.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    p99: Number(p99.toFixed(3)),
    max: Number(max.toFixed(3))
  };
};

export const getInventoryInstrumentationReport = () => {
  const activeRequests = requestMetricsBuffer.getArray();
  const activeDriverCommands = driverCommandDurationsBuffer.getArray();
  const activePoolCheckouts = poolCheckoutDurationsBuffer.getArray();

  const count = requestMetricsBuffer.totalPushed;
  const subMetrics = getSubscriptionCacheMetrics();
  const invCoalescedMetrics = getInventoryCoalescingMetrics();
  const memUsage = process.memoryUsage();
  const v8HeapStats = v8.getHeapStatistics();

  if (count === 0) {
    return { 
      pid: process.pid,
      total_requests_processed: 0, 
      sample_window_size: 0,
      subscription_cache_stats: subMetrics,
      inventory_coalescing_stats: invCoalescedMetrics,
      message: "No requests recorded yet." 
    };
  }

  // Calculate CPU Usage percentage since reset/start
  const elapsedMs = performance.now() - cpuStartTime;
  const cpuDiff = process.cpuUsage(cpuStartUsage);
  const userCpuMs = cpuDiff.user / 1000;
  const systemCpuMs = cpuDiff.system / 1000;
  const totalCpuMs = userCpuMs + systemCpuMs;
  const cpuPercent = elapsedMs > 0 ? (totalCpuMs / elapsedMs) * 100 : 0;

  // Independent Event loop delay measurement in ms
  const elP50 = Number((histogram.percentile(50) / 1e6).toFixed(3));
  const elP95 = Number((histogram.percentile(95) / 1e6).toFixed(3));
  const elP99 = Number((histogram.percentile(99) / 1e6).toFixed(3));
  const elMax = Number((histogram.max / 1e6).toFixed(3));
  const elMean = Number((histogram.mean / 1e6).toFixed(3));

  // Extract individual metrics over rolling active sample window
  const req_to_auth = activeRequests.map(m => m.req_to_auth);
  const jwt_verify = activeRequests.map(m => m.jwt_verify);
  const sub_module_middleware = activeRequests.map(m => m.sub_module_middleware);
  const routing_dispatch = activeRequests.map(m => m.routing_dispatch);
  const pre_mongo_handler = activeRequests.map(m => m.pre_mongo_handler);
  const mongo_app_query = activeRequests.map(m => m.mongo_query_exec);
  const post_mongo_wait = activeRequests.map(m => m.post_mongo_wait);
  const serialization = activeRequests.map(m => m.serialization);
  const write_response = activeRequests.map(m => m.write_response);
  const total_duration = activeRequests.map(m => m.total_duration);
  const payload_bytes = activeRequests.map(m => m.payload_bytes);
  const record_count = activeRequests.map(m => m.record_count);

  const windowedMetrics = {
    "1_req_arrival_to_auth_start": calcPercentiles(req_to_auth),
    "2_jwt_verify_duration": calcPercentiles(jwt_verify),
    "3_sub_module_middleware_duration": calcPercentiles(sub_module_middleware),
    "4_inventory_handler_start": calcPercentiles(routing_dispatch),
    "5_mongo_query_start": calcPercentiles(pre_mongo_handler),
    "6_mongo_app_query_duration": calcPercentiles(mongo_app_query),
    "6a_mongo_driver_command_duration": calcPercentiles(activeDriverCommands),
    "7_time_waiting_after_mongo": calcPercentiles(post_mongo_wait),
    "8_response_serialization_duration": calcPercentiles(serialization),
    "9_response_write_duration": calcPercentiles(write_response),
    "10_total_request_duration": calcPercentiles(total_duration),
    "14_response_payload_bytes": calcPercentiles(payload_bytes),
    "15_record_count": calcPercentiles(record_count)
  };

  return {
    pid: process.pid,
    total_requests: count,
    total_requests_processed: count,
    sample_window_size: activeRequests.length,
    max_buffer_capacity: MAX_BUFFER_SIZE,
    subscription_cache_stats: subMetrics,
    inventory_coalescing_stats: invCoalescedMetrics,
    node_cpu_pct: Number(cpuPercent.toFixed(2)),
    memory_mb: {
      rss: Number((memUsage.rss / 1024 / 1024).toFixed(2)),
      heapUsed: Number((memUsage.heapUsed / 1024 / 1024).toFixed(2)),
      heapTotal: Number((memUsage.heapTotal / 1024 / 1024).toFixed(2))
    },
    v8_heap_stats: {
      heap_size_limit_mb: Number((v8HeapStats.heap_size_limit / 1024 / 1024).toFixed(2)),
      total_heap_size_mb: Number((v8HeapStats.total_heap_size / 1024 / 1024).toFixed(2)),
      used_heap_size_mb: Number((v8HeapStats.used_heap_size / 1024 / 1024).toFixed(2)),
      malloced_memory_mb: Number((v8HeapStats.malloced_memory / 1024 / 1024).toFixed(2))
    },
    event_loop_ms: { mean: elMean, p50: elP50, p95: elP95, p99: elP99, max: elMax },
    pool_checkout_stats: {
      checkout_wait: calcPercentiles(activePoolCheckouts),
      failures: poolCheckoutFailures
    },
    metrics: windowedMetrics,
    metrics_windowed: windowedMetrics
  };
};

