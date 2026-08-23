const { db } = require("./db");
const { log } = require("./logger");
const { probeItem } = require("./probe");
const history = require("./history");

// In-memory status cache: { [itemId]: { status, checked_at, latency_ms } }
// It holds the *current* state only; the same results are appended to
// item_checks by history.recordCheck() and survive a restart.
const statusCache = new Map();

let timer = null;

// Pruning walks a 30-day table, so it must not happen on every cycle — with the
// default 60 s interval that would be 1440 pointless DELETEs a day.
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

function getSetting(key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

async function checkOne(item) {
  const timeoutSec = parseFloat(getSetting("healthcheck_timeout", "5")) || 5;

  statusCache.set(item.id, { status: "checking", checked_at: new Date().toISOString() });

  // The probe method comes from the item itself (http | tcp | icmp).
  const result = await probeItem(item, timeoutSec * 1000);
  const entry = {
    status: result.ok ? "online" : "offline",
    checked_at: new Date().toISOString(),
    method: result.method,
  };
  if (result.latency != null) entry.latency_ms = Math.round(result.latency);
  if (result.http_status != null) entry.http_status = result.http_status;
  if (!result.ok) entry.error = result.error || "unreachable";
  statusCache.set(item.id, entry);

  // A failure to write history must not turn into a failed health check.
  try {
    history.recordCheck(item.id, result);
  } catch (err) {
    log("error", "Failed to record check history", { item: item.id, message: err.message });
  }

  if (!result.ok) {
    log("warn", `Health-check failed for item "${item.name}"`, {
      url: item.url,
      method: result.method,
      reason: entry.error,
    });
  }
}

async function runCheckCycle() {
  const enabled = getSetting("healthcheck_enabled", "true") === "true";
  if (!enabled) return;

  const items = db
    .prepare("SELECT id, name, url, health_check_type FROM items WHERE type = 'service' AND health_check_enabled = 1")
    .all();

  // Run checks in parallel, non-blocking for the HTTP server (event loop stays free)
  await Promise.allSettled(items.map(checkOne));

  const now = Date.now();
  if (now - lastPruneAt >= PRUNE_EVERY_MS) {
    lastPruneAt = now;
    try {
      const removed = history.pruneHistory(now);
      if (removed) log("info", "Pruned check history", { rows: removed, keep_days: history.RETENTION_DAYS });
    } catch (err) {
      log("error", "Failed to prune check history", { message: err.message });
    }
  }
}

function getStatus(itemId) {
  return statusCache.get(itemId) || { status: "unknown" };
}

function getAllStatuses() {
  const result = {};
  for (const [id, val] of statusCache.entries()) result[id] = val;
  return result;
}

function scheduleNext() {
  const intervalSec = parseInt(getSetting("healthcheck_interval", "60"), 10) || 60;
  timer = setTimeout(async () => {
    await runCheckCycle();
    scheduleNext();
  }, intervalSec * 1000);
}

function start() {
  log("info", "Starting health-check background loop");
  runCheckCycle().finally(scheduleNext);
}

function stop() {
  if (timer) clearTimeout(timer);
}

function forceRecheck(itemId) {
  const item = db.prepare("SELECT id, name, url, health_check_type FROM items WHERE id = ?").get(itemId);
  if (!item) return null;
  return checkOne(item);
}

function restartLoop() {
  stop();
  start();
}

module.exports = { start, stop, restartLoop, getStatus, getAllStatuses, forceRecheck, runCheckCycle };
