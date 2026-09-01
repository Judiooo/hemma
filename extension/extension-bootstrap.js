import { loadState, saveSettings, addItem, updateItem, deleteItem, addCategory, updateCategory, deleteCategory, reorderItems, exportBackup, importBackup, resetSettings } from "./storage.js";

const nativeFetch = window.fetch.bind(window);
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function noContent() { return new Response(null, { status: 204 }); }
function pathParts(input) { const url = new URL(input, location.href); return { url, path: url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""), query: url.searchParams }; }
async function bodyJson(init) { if (!init?.body) return {}; if (typeof init.body === "string") return JSON.parse(init.body || "{}"); return {}; }
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input.url;
  if (!requestUrl.startsWith("/api/") && !requestUrl.startsWith(location.origin + "/api/")) return nativeFetch(input, init);
  try {
    const { path, query } = pathParts(requestUrl);
    const method = String(init.method || (typeof input !== "string" ? input.method : "GET")).toUpperCase();
    const body = await bodyJson(init);
    if (path === "items" && method === "GET") {
      const state = await loadState();
      // The original UI renders the status badge from item.health.status.
      // The self-hosted API includes health in the item list, so the extension
      // must do the same. This also makes the existing 15s health refresh work.
      const items = state.items.map((item) => ({ ...item, health: state.health[String(item.id)] || state.health[item.id] || { status: "unknown" } }));
      return json(items);
    }
    if (path.startsWith("items/") && path.endsWith("/history") && method === "GET") {
      const id = path.split("/")[1], state = await loadState();
      const item = state.items.find((x) => String(x.id) === String(id));
      if (!item) return json({ error: "Item not found" }, 404);
      const { healthHistory = {} } = await chrome.storage.local.get("healthHistory");
      return json(buildHistory(item, healthHistory[id] || healthHistory[String(item.id)] || [], query.get("range") || "1d", state.settings));
    }
    if (path.startsWith("items/") && path.endsWith("/recheck") && method === "POST") {
      const id = path.split("/")[1];
      const response = await chrome.runtime.sendMessage({ type: "run-health" });
      const state = await loadState();
      return json(response?.statuses?.[id] || response?.statuses?.[String(id)] || state.health[id] || state.health[String(id)] || { status: "unknown" });
    }
    if (path.startsWith("items/") && method === "GET") {
      const id = path.split("/")[1], state = await loadState();
      const item = state.items.find((x) => String(x.id) === String(id));
      return item ? json({ ...item, health: state.health[String(id)] || state.health[id] || { status: "unknown" } }) : json({ error: "Item not found" }, 404);
    }
    if (path === "items" && method === "POST") return json(await addItem(body), 201);
    if (path.startsWith("items/") && method === "PUT") return json(await updateItem(path.split("/")[1], body));
    if (path.startsWith("items/") && method === "DELETE") { await deleteItem(path.split("/")[1]); return noContent(); }
    if (path === "items/reorder/bulk" && method === "POST") { await reorderItems(body.order || []); return json({ ok: true }); }
    if (path === "categories" && method === "GET") return json((await loadState()).categories);
    if (path === "categories" && method === "POST") return json(await addCategory(body.name), 201);
    if (path.startsWith("categories/") && method === "PUT") return json(await updateCategory(path.split("/")[1], body));
    if (path.startsWith("categories/") && method === "DELETE") { await deleteCategory(path.split("/")[1]); return noContent(); }
    if (path === "settings" && method === "GET") return json((await loadState()).settings);
    if (path === "settings" && method === "PUT") return json(await saveSettings(body));
    if (path.startsWith("settings/reset/") && method === "POST") return json(await resetSettings(path.split("/")[2]));
    if (path === "backup/export" && method === "GET") return json(JSON.parse(await exportBackup()));
    if (path === "backup/import" && method === "POST") { await importBackup(body); return json({ ok: true, imported: { categories: body.categories.length, items: body.items.length } }); }
    if (path === "backgrounds/builtin" && method === "GET") {
      const files = ["Azure Flow.jpg"];
      return json({ wallpapers: files.map((name) => ({ url: `wallpaper/${encodeURIComponent(name)}`, name: name.replace(/\.[^.]+$/, "") })) });
    }
    if (path === "backgrounds" && method === "POST") {
      const blob = init.body instanceof Blob ? init.body : new Blob([init.body], { type: init.headers instanceof Headers ? init.headers.get("content-type") || "image/jpeg" : "image/jpeg" });
      if (!blob.size) return json({ error: "Пустой файл" }, 400);
      return json({ url: await blobToDataUrl(blob) });
    }
    if (path.startsWith("backgrounds/") && method === "GET") return new Response("", { status: 404 });
    if (path === "favicon" && method === "GET") { try { const site = new URL(query.get("url")); return json({ url: `${site.origin}/favicon.ico` }); } catch (_) { return json({ url: "" }, 400); } }
    if (path === "speedtest" && method === "POST") return json({ error: "Network speed test is unavailable in pure extension mode" }, 501);
    if (path === "health" && method === "GET") return json({ ok: true });
    if (path === "ping" && method === "POST") return json({ results: [] });
    return json({ error: "Unsupported extension API endpoint" }, 501);
  } catch (error) { return json({ error: error?.message || "Extension storage error" }, 500); }
};

chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && (changes.health || changes.healthHistory)) window.dispatchEvent(new CustomEvent("hemma-health-updated")); });

function buildHistory(item, samples, range, settings) {
  const now = Date.now();
  const rangeMs = ({ "1h": 3600000, "6h": 21600000, "1d": 86400000, "7d": 604800000, "30d": 2592000000 })[range] || 86400000;
  const from = now - rangeMs;
  const points = (Array.isArray(samples) ? samples : []).map((x) => ({ ...x, ts: typeof x.checked_at === "number" ? x.checked_at : Date.parse(x.checked_at) })).filter((x) => Number.isFinite(x.ts) && x.ts >= from && x.ts <= now).sort((a,b) => a.ts - b.ts);
  const measured = points.filter((x) => x.ok && x.latency_ms != null).map((x) => Number(x.latency_ms)).filter(Number.isFinite);
  const online = points.filter((x) => x.ok).length;
  const last = points.at(-1) || null;
  const avg = measured.length ? Math.round(measured.reduce((a,b) => a+b, 0) / measured.length) : null;
  const min = measured.length ? Math.min(...measured) : null;
  const max = measured.length ? Math.max(...measured) : null;
  const incidents = [];
  let incident = null;
  for (const p of points) {
    if (!p.ok && !incident) incident = { started_at: p.ts, ended_at: null, reason: p.error || (p.http_status ? `http_${p.http_status}` : "unreachable") };
    if (p.ok && incident) { incident.ended_at = p.ts; incidents.push(incident); incident = null; }
  }
  if (incident) incidents.push(incident);
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
    range, from, to: now, bucket_ms: bucketMs, interval_s: Number(settings.healthcheck_interval) || 60, retention_days: 30,
    summary: {
      status: last ? (last.ok ? "online" : "offline") : "offline",
      uptime: points.length ? Math.round((online / points.length) * 10000) / 100 : null,
      samples: points.length,
      latency: { avg, min, max, last: last?.ok && last.latency_ms != null ? Number(last.latency_ms) : null },
      outages: incidents.length,
      longest_outage_ms: incidents.length ? Math.max(...incidents.map((x) => x.ended_at ? x.ended_at - x.started_at : now - x.started_at)) : 0,
      downtime_ms: incidents.reduce((sum, x) => sum + (x.ended_at ? x.ended_at - x.started_at : now - x.started_at), 0),
      last_at: last?.ts ?? null
    },
    buckets, incidents, incidents_total: incidents.length
  };
}

await import("./app.js");
