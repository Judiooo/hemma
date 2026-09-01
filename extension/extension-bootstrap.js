import { loadState, saveSettings, addItem, updateItem, deleteItem, addCategory, updateCategory, deleteCategory, reorderItems, exportBackup, importBackup, resetSettings } from "./storage.js";
import { buildHistory } from "./history.js";

const nativeFetch = window.fetch.bind(window);
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function noContent() { return new Response(null, { status: 204 }); }
function pathParts(input) { const url = new URL(input, location.href); return { url, path: url.pathname.replace(/^\/api\//, "").replace(/\/$/, ""), query: url.searchParams }; }
async function bodyJson(init) { if (!init?.body) return {}; if (typeof init.body === "string") return JSON.parse(init.body || "{}"); return {}; }

window.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === "string" ? input : input.url;
  if (!requestUrl.startsWith("/api/") && !requestUrl.startsWith(location.origin + "/api/")) return nativeFetch(input, init);
  try {
    const { path, query } = pathParts(requestUrl);
    const method = String(init.method || (typeof input !== "string" ? input.method : "GET")).toUpperCase();
    const body = await bodyJson(init);
    if (path === "items" && method === "GET") return json((await loadState()).items);
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
      return json(response?.statuses?.[id] || state.health[id] || { status: "unknown" });
    }
    if (path.startsWith("items/") && method === "GET") {
      const id = path.split("/")[1], state = await loadState();
      const item = state.items.find((x) => String(x.id) === String(id));
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
    if (path === "backgrounds/builtin" && method === "GET") return json({ wallpapers: [] });
    if (path === "backgrounds" && method === "POST") {
      const blob = await requestBodyToBlob(init.body, init.headers);
      if (!blob || !blob.size) return json({ error: "Пустой файл" }, 400);
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

async function requestBodyToBlob(body, headers) {
  if (body instanceof Blob) return body;
  if (body instanceof ArrayBuffer) return new Blob([body], { type: headerContentType(headers) || "application/octet-stream" });
  if (ArrayBuffer.isView(body)) return new Blob([body], { type: headerContentType(headers) || "application/octet-stream" });
  if (body instanceof ReadableStream) return new Blob([await new Response(body).arrayBuffer()], { type: headerContentType(headers) || "application/octet-stream" });
  if (typeof body === "string") return new Blob([body], { type: headerContentType(headers) || "application/octet-stream" });
  return null;
}
function headerContentType(headers) { if (!headers) return ""; if (headers instanceof Headers) return headers.get("content-type") || ""; if (typeof headers.get === "function") return headers.get("content-type") || ""; return headers["Content-Type"] || headers["content-type"] || ""; }
function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }

await import("./app.js");
installPureExtensionWallpaperHandler();

function installPureExtensionWallpaperHandler() {
  const input = document.getElementById("setBackgroundFile");
  if (!input) return;
  input.addEventListener("change", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await blobToDataUrl(file);
      await saveSettings({ background: dataUrl, background_history: JSON.stringify([dataUrl]) });
      applyExtensionWallpaper(dataUrl);
      const status = document.getElementById("backgroundStatus");
      if (status) status.textContent = "Фон установлен";
      window.dispatchEvent(new CustomEvent("hemma-background-updated", { detail: { url: dataUrl } }));
    } catch (error) {
      const status = document.getElementById("backgroundStatus");
      if (status) status.textContent = `Не удалось установить фон: ${error?.message || error}`;
      console.error("Hemma wallpaper upload failed", error);
    } finally {
      input.value = "";
    }
  }, true);
}

export function applyExtensionWallpaper(url) {
  if (!url) return;
  document.documentElement.style.setProperty("--bg-image", `url("${url}")`);
}
