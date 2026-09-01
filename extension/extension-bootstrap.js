import {
  loadState,
  saveSettings,
  addItem,
  updateItem,
  deleteItem,
  addCategory,
  updateCategory,
  deleteCategory,
  reorderItems,
  exportBackup,
  importBackup,
  resetSettings
} from "./storage.js";

// Compatibility layer: the existing Hemma UI talks to /api/*.
// In the extension those calls are served locally without a web server.
const nativeFetch = window.fetch.bind(window);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function noContent() { return new Response(null, { status: 204 }); }

function pathParts(input) {
  const url = new URL(input, location.href);
  return { url, path: url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""), query: url.searchParams };
}

async function bodyJson(init) {
  if (!init?.body) return {};
  if (typeof init.body === "string") return JSON.parse(init.body || "{}");
  return {};
}

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input.url;
  if (!requestUrl.startsWith("/api/") && !requestUrl.startsWith(location.origin + "/api/")) {
    return nativeFetch(input, init);
  }

  try {
    const { path, query } = pathParts(requestUrl);
    const method = String(init.method || (typeof input !== "string" ? input.method : "GET")).toUpperCase();
    const body = await bodyJson(init);

    if (path === "items" && method === "GET") {
      const state = await loadState();
      return json(state.items);
    }
    if (path.startsWith("items/") && path.endsWith("/history") && method === "GET") {
      const id = path.split("/")[1];
      const state = await loadState();
      const item = state.items.find((x) => x.id === id);
      if (!item) return json({ error: "Item not found" }, 404);
      const { healthHistory = {} } = await chrome.storage.local.get("healthHistory");
      const range = query.get("range") || "1d";
      return json(buildHistory(item, healthHistory[id] || [], range, state.settings));
    }
    if (path.startsWith("items/") && path.endsWith("/recheck") && method === "POST") {
      const id = path.split("/")[1];
      const response = await chrome.runtime.sendMessage({ type: "run-health" });
      const state = await loadState();
      return json(response?.statuses?.[id] || state.health[id] || { status: "unknown" });
    }
    if (path.startsWith("items/") && method === "GET") {
      const id = path.split("/")[1];
      const state = await loadState();
      const item = state.items.find((x) => x.id === id);
      return item ? json({ ...item, health: state.health[id] || { status: "unknown" } }) : json({ error: "Item not found" }, 404);
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
      // Built-in wallpapers are packaged with the extension. The original files
      // live under public/wallpaper and are copied by build.mjs.
      const files = ["Azure Flow.jpg"];
      return json({ wallpapers: files.map((name) => ({ url: `wallpaper/${encodeURIComponent(name)}`, name: name.replace(/\.[^.]+$/, "") })) });
    }
    if (path === "backgrounds" && method === "POST") {
      const bytes = init.body instanceof ArrayBuffer ? new Uint8Array(init.body) : new Uint8Array(await new Response(init.body).arrayBuffer());
      const type = init.headers instanceof Headers ? init.headers.get("content-type") : init.headers?.["Content-Type"] || "image/jpeg";
      const blob = new Blob([bytes], { type: type || "image/jpeg" });
      const dataUrl = await blobToDataUrl(blob);
      return json({ url: dataUrl });
    }
    if (path.startsWith("backgrounds/") && method === "GET") return new Response("", { status: 404 });

    if (path === "favicon" && method === "GET") {
      const target = query.get("url");
      try {
        const site = new URL(target);
        return json({ url: `${site.origin}/favicon.ico` });
      } catch (_) { return json({ url: "" }, 400); }
    }

    if (path === "speedtest" && method === "POST") return json({ error: "Network speed test is unavailable in pure extension mode" }, 501);
    if (path === "health" && method === "GET") return json({ ok: true });
    if (path === "ping" && method === "POST") return json({ results: [] });

    return json({ error: "Unsupported extension API endpoint" }, 501);
  } catch (error) {
    return json({ error: error?.message || "Extension storage error" }, 500);
  }
};

// Re-render the page when a background health check changes stored status.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.health || changes.healthHistory)) window.dispatchEvent(new CustomEvent("hemma-health-updated"));
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildHistory(item, samples, range, settings) {
  const now = Date.now();
  const ranges = { "1h": 3600000, "6h": 21600000, "1d": 86400000, "7d": 604800000, "30d": 2592000000 };
  const from = now - (ranges[range] || ranges["1d"]);
  const filtered = samples.filter((x) => x.checked_at >= from).sort((a,b) => a.checked_at - b.checked_at);
  const total = filtered.length;
  const online = filtered.filter((x) => x.ok).length;
  const latencies = filtered.filter((x) => x.ok && x.latency_ms != null).map((x) => x.latency_ms);
  const incidents = [];
  let incident = null;
  for (const x of filtered) {
    if (!x.ok && !incident) incident = { started_at: x.checked_at, ended_at: null, reason: x.error || "unreachable" };
    if (x.ok && incident) { incident.ended_at = x.checked_at; incidents.push(incident); incident = null; }
  }
  if (incident) incidents.push(incident);
  const uptime = total ? (online / total) * 100 : null;
  return {
    item: { id: item.id, name: item.name, url: item.url, type: item.type, method: "http", health_check_enabled: item.health_check_enabled },
    checks_enabled: settings.healthcheck_enabled !== "false",
    summary: { uptime, samples: total, current: samples.at(-1)?.ok ? "online" : "offline", latency_min: latencies.length ? Math.min(...latencies) : null, latency_max: latencies.length ? Math.max(...latencies) : null, outages: incidents.length, downtime_ms: incidents.reduce((n, x) => n + (x.ended_at ? x.ended_at - x.started_at : now - x.started_at), 0) },
    buckets: filtered.map((x) => ({ time: x.checked_at, uptime: x.ok ? 100 : 0, samples: 1, latency_ms: x.latency_ms ?? null })),
    incidents,
    retention_days: 30,
    interval: Number(settings.healthcheck_interval) || 60
  };
}

// Existing app.js is intentionally kept intact; this module only replaces its
// server transport. It is loaded before app.js by build.mjs.
await import("./app.js");
