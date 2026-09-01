export function buildHistory(item, samples, range, settings) {
  const now = Date.now();
  const rangeMs = { "1h": 3600000, "6h": 21600000, "1d": 86400000, "7d": 604800000, "30d": 2592000000 }[range] || 86400000;
  const from = now - rangeMs;
  const points = (Array.isArray(samples) ? samples : []).map((x) => ({
    ...x,
    ts: typeof x.checked_at === "number" ? x.checked_at : Date.parse(x.checked_at)
  })).filter((x) => Number.isFinite(x.ts) && x.ts >= from && x.ts <= now).sort((a,b) => a.ts - b.ts);
  const measured = points.filter((x) => x.ok && x.latency_ms != null).map((x) => Number(x.latency_ms)).filter(Number.isFinite);
  const online = points.filter((x) => x.ok).length;
  const last = points.at(-1) || null;
  const avg = measured.length ? Math.round(measured.reduce((a,b) => a+b, 0) / measured.length) : null;
  const min = measured.length ? Math.min(...measured) : null;
  const max = measured.length ? Math.max(...measured) : null;

  const incidents = [];
  let current = null;
  for (const p of points) {
    if (!p.ok && !current) current = { from: p.ts, to: null, duration_ms: null, ongoing: true, error: p.error || (p.http_status ? `http_${p.http_status}` : "unreachable") };
    if (p.ok && current) {
      current.to = p.ts;
      current.duration_ms = Math.max(0, p.ts - current.from);
      current.ongoing = false;
      incidents.push(current);
      current = null;
    }
  }
  if (current) { current.duration_ms = Math.max(0, now - current.from); incidents.push(current); }

  const bucketCount = range === "1h" ? 60 : range === "6h" ? 72 : range === "7d" ? 168 : range === "30d" ? 180 : 144;
  const bucketMs = Math.ceil(rangeMs / bucketCount);
  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const start = from + i * bucketMs, end = i === bucketCount - 1 ? now + 1 : start + bucketMs;
    const rows = points.filter((p) => p.ts >= start && p.ts < end);
    const up = rows.filter((p) => p.ok).length;
    const lat = rows.filter((p) => p.ok && p.latency_ms != null).map((p) => Number(p.latency_ms)).filter(Number.isFinite);
    return { t: start, up, samples: rows.length, avg: lat.length ? lat.reduce((a,b) => a+b, 0) / lat.length : null, min: lat.length ? Math.min(...lat) : null, max: lat.length ? Math.max(...lat) : null };
  });

  return {
    item: { id: item.id, name: item.name, url: item.url, type: item.type, method: "http", health_check_enabled: item.health_check_enabled },
    checks_enabled: settings.healthcheck_enabled !== "false",
    range,
    from,
    to: now,
    bucket_ms: bucketMs,
    interval_s: Number(settings.healthcheck_interval) || 60,
    retention_days: 30,
    summary: {
      status: last ? (last.ok ? "online" : "offline") : "offline",
      uptime: points.length ? Math.round((online / points.length) * 10000) / 100 : null,
      samples: points.length,
      latency: { avg, min, max, last: last?.ok && last.latency_ms != null ? Number(last.latency_ms) : null },
      outages: incidents.length,
      longest_outage_ms: incidents.length ? Math.max(...incidents.map((x) => x.duration_ms || 0)) : 0,
      downtime_ms: incidents.reduce((sum, x) => sum + (x.duration_ms || 0), 0),
      last_at: last?.ts ?? null
    },
    buckets,
    incidents,
    incidents_total: incidents.length
  };
}
