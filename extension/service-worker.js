const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 5000;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await scheduleHealthChecks();
  await runHealthChecks();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await scheduleHealthChecks();
  await runHealthChecks();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "hemma-health") await runHealthChecks();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "schedule-health") {
      await scheduleHealthChecks();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "run-health") {
      const statuses = await runHealthChecks();
      sendResponse({ ok: true, statuses });
      return;
    }
    sendResponse({ ok: false, error: "Unknown message" });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function ensureDefaults() {
  const data = await chrome.storage.local.get(["settings", "items", "categories"]);
  if (!data.settings) {
    await chrome.storage.local.set({
      settings: {
        theme: "dark",
        language: "en",
        card_size: "medium",
        block_size: "medium",
        cards_area_width: "100",
        columns: "auto",
        healthcheck_enabled: "true",
        healthcheck_interval: String(DEFAULT_INTERVAL_SECONDS),
        healthcheck_timeout: "5",
        link_behavior: "new_tab",
        confirm_external_links: "false",
        background: "",
        background_rotation_enabled: "false",
        background_rotation_value: "30",
        background_rotation_unit: "minutes",
        background_rotation_list: "[]",
        background_rotation_last: "",
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
      }
    });
  }
  if (!Array.isArray(data.items)) await chrome.storage.local.set({ items: [] });
  if (!Array.isArray(data.categories)) await chrome.storage.local.set({ categories: [] });
}

async function scheduleHealthChecks() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  await chrome.alarms.clear("hemma-health");
  if (settings.healthcheck_enabled === "false") return;
  const seconds = Math.max(30, Number(settings.healthcheck_interval) || DEFAULT_INTERVAL_SECONDS);
  await chrome.alarms.create("hemma-health", { periodInMinutes: seconds / 60 });
}

async function runHealthChecks() {
  const { items = [], settings = {}, health = {} } = await chrome.storage.local.get(["items", "settings", "health"]);
  if (settings.healthcheck_enabled === "false") return health;
  const timeout = Math.max(1000, (Number(settings.healthcheck_timeout) || 5) * 1000);
  const next = { ...health };
  await Promise.all(items.filter((item) => item.type === "service" && item.health_check_enabled !== false).map(async (item) => {
    next[item.id] = await probe(item, timeout);
  }));
  await chrome.storage.local.set({ health: next });
  return next;
}

async function probe(item, timeout) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const target = new URL(item.url);
    const response = await fetch(target.href, { method: "GET", cache: "no-store", signal: controller.signal });
    return {
      status: response.ok ? "online" : "offline",
      checked_at: new Date().toISOString(),
      method: "http",
      latency_ms: Math.round(performance.now() - started),
      http_status: response.status
    };
  } catch (error) {
    return {
      status: "offline",
      checked_at: new Date().toISOString(),
      method: "http",
      error: error.name === "AbortError" ? "timeout" : "unreachable"
    };
  } finally {
    clearTimeout(timer);
  }
}
