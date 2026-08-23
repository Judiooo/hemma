const { db } = require("./db");

// v32: availability history. healthcheck.js writes one row per probe through
// recordCheck(); everything that reads item_checks lives here.
//
// The raw samples are kept for 30 days and pruned from the check loop. At the
// default 60 s interval that is ~43 000 rows per service, which is why nothing
// below ever loads the rows themselves: the summary, the buckets and even the
// outage list are computed by SQLite and come back as tens of rows.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * DAY;

// The bucket sizes are chosen so every range lands on 60–96 segments: enough
// resolution to see a short outage, few enough that the availability bar stays
// readable and the response stays small.
const RANGES = {
  "1h": { ms: HOUR, bucket: MINUTE }, // 60 buckets
  "6h": { ms: 6 * HOUR, bucket: 5 * MINUTE }, // 72
  "1d": { ms: DAY, bucket: 15 * MINUTE }, // 96
  "7d": { ms: 7 * DAY, bucket: 2 * HOUR }, // 84
  "30d": { ms: RETENTION_MS, bucket: 8 * HOUR }, // 90
};
const DEFAULT_RANGE = "1d";

// The most recent outages returned to the client. A service that flaps can
// produce thousands over 30 days; the count is reported separately so the window
// can say "50 of 214".
const INCIDENT_LIMIT = 50;

// item_checks is created by db.init(), which server.js runs *after* requiring
// healthcheck.js — and therefore after requiring this module. So nothing can be
// prepared at load time; statements are prepared on first use and reused after.
const statements = new Map();
function stmt(sql) {
  let prepared = statements.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    statements.set(sql, prepared);
  }
  return prepared;
}

function normalizeRange(value) {
  const range = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RANGES, range) ? range : DEFAULT_RANGE;
}

// Called for every finished probe. The transient "checking" state is never
// recorded — only the outcome.
function recordCheck(itemId, result) {
  stmt(`
    INSERT INTO item_checks (item_id, checked_at, ok, latency_ms, http_status, method, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    Date.now(),
    result.ok ? 1 : 0,
    result.ok && result.latency != null ? Math.round(result.latency) : null,
    result.http_status != null ? result.http_status : null,
    result.method || null,
    // A 5xx is a failed check, but the host did answer — calling that
    // "unreachable" would send whoever reads the incident list looking for a
    // network fault. The status code is the reason.
    result.ok ? null : result.error || (result.http_status ? `http_${result.http_status}` : "unreachable")
  );
}

function pruneHistory(now = Date.now()) {
  return stmt("DELETE FROM item_checks WHERE checked_at < ?").run(now - RETENTION_MS).changes;
}

// The newest sample for an item, regardless of the range being viewed: a service
// that stopped answering days ago must still show *when* it was last checked
// instead of an empty "last check" field.
function latestCheck(itemId) {
  return (
    stmt(`
      SELECT checked_at, ok, latency_ms, http_status, error
      FROM item_checks WHERE item_id = ?
      ORDER BY checked_at DESC LIMIT 1
    `).get(itemId) || null
  );
}

// Median gap between the last few samples — the interval the history was
// *actually* recorded at. The healthcheck_interval setting only describes the
// future, and it may well have been changed in the middle of the period shown.
function latestInterval(itemId) {
  const rows = stmt(`
    SELECT checked_at FROM item_checks WHERE item_id = ?
    ORDER BY checked_at DESC LIMIT 21
  `).all(itemId);
  if (rows.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < rows.length; i++) gaps.push(rows[i - 1].checked_at - rows[i].checked_at);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return median > 0 ? Math.round(median / 1000) : null;
}

function round1(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

// Pairs the status transitions into outages. `from` is the first failed check,
// `to` the check that found the service back up — so a 60 s poll reports an
// outage no shorter than one interval, which is the best a poller can know.
function buildOutages(transitions, now) {
  const outages = [];
  let open = null;
  for (const row of transitions) {
    if (!row.ok) {
      if (!open) open = { from: row.checked_at, error: row.error || "unreachable" };
    } else if (open) {
      outages.push({
        from: open.from,
        to: row.checked_at,
        duration_ms: row.checked_at - open.from,
        error: open.error,
        ongoing: false,
      });
      open = null;
    }
  }
  // Still down: the outage has no end yet, so it is measured up to "now".
  if (open) {
    outages.push({
      from: open.from,
      to: now,
      duration_ms: Math.max(0, now - open.from),
      error: open.error,
      ongoing: true,
    });
  }
  return outages;
}

function getHistory(itemId, rangeKey, now = Date.now()) {
  const range = normalizeRange(rangeKey);
  const { bucket } = RANGES[range];

  // The grid is aligned to bucket boundaries and anchored on the bucket "now"
  // falls into, so the segments keep their edges between refreshes instead of
  // sliding a few seconds left on every reload.
  const count = Math.ceil(RANGES[range].ms / bucket);
  const lastKey = Math.floor(now / bucket);
  const firstKey = lastKey - (count - 1);
  const from = firstKey * bucket;

  // No upper bound on checked_at: a sample can never be in the future, and the
  // last bucket is deliberately the one still being filled.
  const totals = stmt(`
    SELECT COUNT(*) AS samples,
           COALESCE(SUM(ok), 0) AS up,
           AVG(CASE WHEN ok = 1 THEN latency_ms END) AS avg_latency,
           MIN(CASE WHEN ok = 1 THEN latency_ms END) AS min_latency,
           MAX(CASE WHEN ok = 1 THEN latency_ms END) AS max_latency,
           MIN(checked_at) AS first_at
    FROM item_checks
    WHERE item_id = ? AND checked_at >= ?
  `).get(itemId, from);

  // CAST keeps this integer division even if the driver ever binds the bucket
  // size as a float — `checked_at / 60000.0` would give every row its own group.
  const rows = stmt(`
    SELECT checked_at / CAST(? AS INTEGER) AS k,
           COUNT(*) AS samples,
           COALESCE(SUM(ok), 0) AS up,
           AVG(CASE WHEN ok = 1 THEN latency_ms END) AS avg_latency,
           MIN(CASE WHEN ok = 1 THEN latency_ms END) AS min_latency,
           MAX(CASE WHEN ok = 1 THEN latency_ms END) AS max_latency
    FROM item_checks
    WHERE item_id = ? AND checked_at >= ?
    GROUP BY k
    ORDER BY k
  `).all(bucket, itemId, from);

  // Expanded onto the full grid here rather than in the browser: a bucket with
  // no samples is a real state ("the portal was not running"), and it has to be
  // told apart from a bucket where every check failed.
  const byKey = new Map(rows.map((row) => [row.k, row]));
  const buckets = [];
  for (let k = firstKey; k <= lastKey; k++) {
    const row = byKey.get(k);
    buckets.push({
      t: k * bucket,
      samples: row ? row.samples : 0,
      up: row ? row.up : 0,
      avg: row ? round1(row.avg_latency) : null,
      min: row ? row.min_latency : null,
      max: row ? row.max_latency : null,
    });
  }

  // Only the status *changes* come back from SQLite — 30 days of samples would
  // be tens of thousands of rows to ship and walk for a handful of outages.
  const transitions = stmt(`
    WITH s AS (
      SELECT checked_at, ok, error,
             LAG(ok) OVER (ORDER BY checked_at) AS prev
      FROM item_checks
      WHERE item_id = ? AND checked_at >= ?
    )
    SELECT checked_at, ok, error FROM s
    WHERE prev IS NULL OR ok <> prev
    ORDER BY checked_at
  `).all(itemId, from);

  const outages = buildOutages(transitions, now);
  const downtime = outages.reduce((sum, o) => sum + o.duration_ms, 0);
  const longest = outages.reduce((max, o) => Math.max(max, o.duration_ms), 0);

  const latest = latestCheck(itemId);
  const samples = totals.samples || 0;

  return {
    range,
    from,
    to: now,
    bucket_ms: bucket,
    retention_days: RETENTION_DAYS,
    interval_s: latestInterval(itemId),
    summary: {
      samples,
      up: totals.up || 0,
      down: samples - (totals.up || 0),
      uptime: samples ? round1(((totals.up || 0) / samples) * 100) : null,
      outages: outages.length,
      downtime_ms: downtime,
      longest_outage_ms: longest,
      status: latest ? (latest.ok ? "online" : "offline") : "unknown",
      first_at: totals.first_at ?? null,
      last_at: latest ? latest.checked_at : null,
      latency: {
        avg: round1(totals.avg_latency),
        min: totals.min_latency ?? null,
        max: totals.max_latency ?? null,
        last: latest && latest.ok ? latest.latency_ms : null,
      },
    },
    buckets,
    // Newest first: the incident a user opens this window for is the last one.
    incidents: outages.slice(-INCIDENT_LIMIT).reverse(),
    incidents_total: outages.length,
  };
}

module.exports = {
  RANGES,
  DEFAULT_RANGE,
  RETENTION_DAYS,
  RETENTION_MS,
  normalizeRange,
  recordCheck,
  pruneHistory,
  latestInterval,
  latestCheck,
  getHistory,
};
