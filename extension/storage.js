const DEFAULT_SETTINGS = {
  theme: "dark",
  language: "en",
  card_size: "medium",
  block_size: "medium",
  cards_area_width: "100",
  columns: "auto",
  healthcheck_enabled: "true",
  healthcheck_interval: "60",
  healthcheck_timeout: "5",
  link_behavior: "new_tab",
  confirm_external_links: "false",
  background: "",
  font: "system",
  card_backdrop: "false",
  card_backdrop_opacity: "medium",
  card_backdrop_color: "white",
  card_icon_plain: "false",
  icon_background_color: "#ffffff",
  block_transparency: "90",
  widget_transparency: "60",
  search_transparency: "60",
  button_transparency: "60",
  brand_visible: "false",
  brand_icon: "🏠",
  brand_title: "Home",
  search_engine: "google",
  sort_mode: "custom",
  search_scope: "all",
  search_engine_visible: "true",
  search_engine_style: "pill",
  search_width: "480",
  search_height: "38",
  toolbar_direction: "row",
  toolbar_position: "top-right",
  widget_date_enabled: "true",
  widget_date_format: "numeric",
  widget_date_style: "card",
  widget_time_enabled: "true",
  widget_time_seconds: "false",
  widget_time_style: "card",
  widget_weather_enabled: "false",
  widget_weather_location_mode: "auto",
  widget_weather_city: "",
  widget_weather_units: "metric",
  widget_weather_style: "card",
  widget_ping_enabled: "false",
  widget_ping_hosts: "[]",
  widget_ping_style: "minimal",
  widget_ping_format: "full",
  widget_ping_interval: "10",
  widget_ping_method: "icmp",
  widget_sticky_enabled: "false",
  widget_sticky_collapsed: "false",
  widget_sticky_x: "",
  widget_sticky_y: "",
  widget_sticky_lines: "[]",
  widget_speed_enabled: "false",
  widget_speed_collapsed: "true",
  widget_speed_server: "auto",
  widget_order: "date,time,weather",
  background_history: "[]"
};

const DISPLAY_MODES = ["grid", "favorite", "block"];
const ICON_BACKGROUND_MODES = ["inherit", "on", "off"];

function normalizeDisplayMode(value, favorite = false) {
  const mode = String(value || "").toLowerCase();
  return DISPLAY_MODES.includes(mode) ? mode : favorite ? "favorite" : "grid";
}

function normalizeItem(item) {
  const mode = normalizeDisplayMode(item.display_mode, item.is_favorite);
  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    type: item.type === "bookmark" ? "bookmark" : "service",
    icon_background_color: item.icon_background_color || "#ffffff",
    icon_background_mode: ICON_BACKGROUND_MODES.includes(item.icon_background_mode) ? item.icon_background_mode : "inherit",
    category_id: item.category_id ?? null,
    display_mode: mode,
    is_favorite: mode === "favorite",
    sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : 0,
    health_check_enabled: item.health_check_enabled !== false,
    health_check_type: "http",
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString()
  };
}

export async function loadState() {
  const data = await chrome.storage.local.get(["settings", "items", "categories", "health"]);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    items: Array.isArray(data.items) ? data.items.map(normalizeItem).sort((a,b) => a.sort_order - b.sort_order) : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    health: data.health || {}
  };
}

export async function saveSettings(patch) {
  const { settings = {} } = await chrome.storage.local.get("settings");
  const next = { ...DEFAULT_SETTINGS, ...settings, ...patch };
  await chrome.storage.local.set({ settings: next });
  if (patch.healthcheck_enabled !== undefined || patch.healthcheck_interval !== undefined) {
    try { await chrome.runtime.sendMessage({ type: "schedule-health" }); } catch (_) {}
  }
  return next;
}

export async function addItem(input) {
  const state = await loadState();
  const item = normalizeItem({ ...input, id: crypto.randomUUID(), sort_order: state.items.length });
  await chrome.storage.local.set({ items: [...state.items, item] });
  return item;
}

export async function updateItem(id, patch) {
  const state = await loadState();
  const items = state.items.map((item) => item.id === id ? normalizeItem({ ...item, ...patch, updated_at: new Date().toISOString() }) : item);
  await chrome.storage.local.set({ items });
  return items.find((item) => item.id === id) || null;
}

export async function deleteItem(id) {
  const state = await loadState();
  await chrome.storage.local.set({ items: state.items.filter((item) => item.id !== id) });
}

export async function addCategory(name) {
  const state = await loadState();
  const category = { id: crypto.randomUUID(), name, sort_order: state.categories.length, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await chrome.storage.local.set({ categories: [...state.categories, category] });
  return category;
}

export async function updateCategory(id, patch) {
  const state = await loadState();
  const categories = state.categories.map((c) => c.id === id ? { ...c, ...patch, updated_at: new Date().toISOString() } : c);
  await chrome.storage.local.set({ categories });
  return categories.find((c) => c.id === id) || null;
}

export async function deleteCategory(id) {
  const state = await loadState();
  await chrome.storage.local.set({ categories: state.categories.filter((c) => c.id !== id), items: state.items.map((i) => i.category_id === id ? { ...i, category_id: null } : i) });
}

export async function reorderItems(order) {
  const state = await loadState();
  const ranks = new Map(order.map((x) => [x.id, x.sort_order]));
  const items = state.items.map((i) => ranks.has(i.id) ? { ...i, sort_order: ranks.get(i.id) } : i).sort((a,b) => a.sort_order - b.sort_order);
  await chrome.storage.local.set({ items });
}

export async function exportBackup() {
  const state = await loadState();
  return JSON.stringify({ exported_at: new Date().toISOString(), version: 1, categories: state.categories, items: state.items, settings: state.settings }, null, 2);
}

export async function importBackup(payload) {
  if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.items)) throw new Error("Invalid backup file format");
  const categories = payload.categories.map((c, index) => ({ ...c, id: c.id || crypto.randomUUID(), sort_order: c.sort_order ?? index }));
  const catIds = new Map(categories.map((c) => [c.id, c.id]));
  const items = payload.items.map((item, index) => normalizeItem({ ...item, id: item.id || crypto.randomUUID(), category_id: catIds.has(item.category_id) ? item.category_id : null, sort_order: item.sort_order ?? index }));
  const settings = { ...DEFAULT_SETTINGS, ...(payload.settings || {}) };
  await chrome.storage.local.set({ categories, items, settings, health: {} });
}

export async function resetSettings(scope) {
  const state = await loadState();
  const appearance = { ...DEFAULT_SETTINGS };
  const cards = { card_size: "medium", block_size: "medium", cards_area_width: "100", columns: "auto", sort_mode: "custom", card_backdrop: "false", card_backdrop_opacity: "medium", card_backdrop_color: "white", card_icon_plain: "false", icon_background_color: "#ffffff" };
  const patch = scope === "appearance" ? appearance : cards;
  return saveSettings(patch);
}
