const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { log } = require("./logger");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");

// make sure the folder exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('service','bookmark')),
      icon TEXT,
      icon_background_color TEXT NOT NULL DEFAULT '#ffffff',
      icon_background_mode TEXT NOT NULL DEFAULT 'inherit',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      display_mode TEXT NOT NULL DEFAULT 'grid',
      sort_order INTEGER NOT NULL DEFAULT 0,
      health_check_enabled INTEGER NOT NULL DEFAULT 1,
      health_check_type TEXT NOT NULL DEFAULT 'http',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- v32: one row per health check, kept for 30 days (src/history.js prunes it).
    -- checked_at is unix milliseconds rather than the TEXT datetime('now') the
    -- other tables use: every read of this table is a range scan plus an integer
    -- division into time buckets (checked_at / bucket_ms), which with text
    -- timestamps would mean a strftime() call per row on tens of thousands of
    -- rows. latency_ms is only set when ok = 1 — a failed probe has no latency
    -- to report, and storing 0 would drag the averages down.
    CREATE TABLE IF NOT EXISTS item_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      checked_at INTEGER NOT NULL,
      ok INTEGER NOT NULL,
      latency_ms INTEGER,
      http_status INTEGER,
      method TEXT,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_item_checks_item_time
      ON item_checks (item_id, checked_at);
  `);

  // Did the CREATE TABLE above just create this database? A fresh deployment has
  // no settings rows, and this is the last moment that is still true — the
  // defaults below fill the table. seedInitialData() needs the answer: it seeds
  // categories and no longer any items, so the old "zero items" test would also
  // match an install where the user had simply deleted every card.
  const isFreshInstall = db.prepare("SELECT COUNT(*) AS c FROM settings").get().c === 0;

  const itemColumns = db.prepare("PRAGMA table_info(items)").all();
  if (!itemColumns.some((column) => column.name === "icon_background_color")) {
    db.exec("ALTER TABLE items ADD COLUMN icon_background_color TEXT NOT NULL DEFAULT '#ffffff'");
  }
  if (!itemColumns.some((column) => column.name === "display_mode")) {
    db.exec("ALTER TABLE items ADD COLUMN display_mode TEXT NOT NULL DEFAULT 'grid'");
  }
  // v27: whether *this* card overrides the global icon-background switch.
  // 'inherit' follows Настройки → Карточки, 'on'/'off' force the tile on or off.
  if (!itemColumns.some((column) => column.name === "icon_background_mode")) {
    db.exec("ALTER TABLE items ADD COLUMN icon_background_mode TEXT NOT NULL DEFAULT 'inherit'");
  }

  const defaults = {
    theme: "dark",
    // Interface language (ru | en). English is the default since v30.
    language: "en",
    card_size: "medium",
    // Category blocks scale independently of the cards: small | medium | large.
    block_size: "medium",
    cards_area_width: "100",
    columns: "auto",
    healthcheck_enabled: "true",
    healthcheck_interval: "60",
    healthcheck_timeout: "5",
    link_behavior: "new_tab",
    confirm_external_links: "false",
    // Either a wallpaper URL or a plain "#rrggbb" fill for the page background.
    background: "",
    // Automatic wallpaper rotation. The interval is stored as a value plus its
    // unit so the UI can say "2 часа" instead of "120 минут"; the list holds the
    // wallpapers taking part (empty = the whole gallery) and _last is the
    // timestamp of the most recent switch, so a reload does not restart the wait.
    background_rotation_enabled: "false",
    background_rotation_value: "30",
    background_rotation_unit: "minutes",
    background_rotation_list: "[]",
    background_rotation_last: "",
    font: "system",
    card_backdrop: "false",
    card_backdrop_opacity: "medium",
    card_backdrop_color: "white",
    // Cards show only the icon artwork, without the coloured tile behind it.
    card_icon_plain: "false",
    // One colour for the plate behind every icon (was per-card until v26).
    icon_background_color: "#ffffff",
    // How much of the wallpaper shows through each group of frosted surfaces,
    // 0–100. The defaults reproduce the fills these surfaces had before the
    // sliders existed.
    block_transparency: "90",
    widget_transparency: "60",
    search_transparency: "60",
    button_transparency: "60",
    brand_visible: "false",
    brand_icon: "🏠",
    brand_title: "Home",
    search_engine: "google",
    sort_mode: "custom",
    // Dashboard Icons picker: which image format the icon search looks for
    // (svg | webp | png).
    icon_search_format: "svg",
    // Date and time are the two widgets a new portal opens with; every other
    // widget stays off until it is asked for. The INSERT OR IGNORE below means
    // this only reaches a fresh database — an existing install is left alone,
    // because a stored "false" cannot be told apart from a deliberate
    // switch-off, and the v22/v23 rule is that a hand-picked value is never
    // overwritten.
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
    widget_date_font_size: "15",
    widget_time_font_size: "15",
    widget_weather_font_size: "15",
    widget_order: "date,time,weather",
    // The docked widgets cannot be moved or repositioned by the user.
    // Date/Time/Weather are docked in the top bar (left of the search field);
    // Ping is docked, centered, at the bottom of the page. Only which widgets
    // are shown (and, for date/time/weather, their stacking order) is
    // configurable.
    //
    // v29: the Sticky Note is the one exception — a to-do pad the user places
    // anywhere on the screen. Its position is stored as a fraction of the
    // viewport (0..1 of width/height) so the note keeps its spot on a different
    // screen size; an empty value means "never placed" and the note opens at its
    // default anchor. The lines are a JSON array of
    // { id, type: "text" | "bullet" | "todo", done, html }, where html carries
    // only inline emphasis (<b>/<i>/<u>/<br>).
    widget_sticky_enabled: "false",
    widget_sticky_collapsed: "false",
    widget_sticky_x: "",
    widget_sticky_y: "",
    widget_sticky_lines: "[]",
    // v30: the network-speed panel. It sits in the bottom-left corner and is not
    // movable, so the only state it keeps is whether it is shown, whether it is
    // folded into its icon, and which test server the last run used.
    widget_speed_enabled: "false",
    widget_speed_collapsed: "true",
    widget_speed_server: "auto",
    search_scope: "all",
    search_engine_visible: "true",
    search_engine_style: "pill",
    search_width: "480",
    search_height: "38",
    toolbar_direction: "row",
    toolbar_position: "top-right",
    background_history: "[]",
  };

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);
  });
  tx();

  // v12: the weather widget must never become enabled implicitly.
  // Existing installations get a one-time reset so only explicitly enabled widgets remain active.
  const weatherMigration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v12_weather_reset'").get();
  if (!weatherMigration) {
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'widget_weather_enabled'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v12_weather_reset', 'true')").run();
  }

  // v13: widgets are no longer draggable; each one gets a fixed, distinct
  // corner. Existing installations get a one-time reset to distinct anchors
  // and drop the now-unused free-form offset/legacy anchor keys.
  const widgetsFixedMigration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v13_widgets_fixed'").get();
  if (!widgetsFixedMigration) {
    db.prepare("UPDATE settings SET value = 'top-left' WHERE key = 'widget_date_anchor'").run();
    db.prepare("UPDATE settings SET value = 'top-center' WHERE key = 'widget_time_anchor'").run();
    db.prepare("UPDATE settings SET value = 'top-right' WHERE key = 'widget_weather_anchor'").run();
    db.prepare(`
      DELETE FROM settings WHERE key IN (
        'widget_anchor',
        'widget_date_offset_x', 'widget_date_offset_y',
        'widget_time_offset_x', 'widget_time_offset_y',
        'widget_weather_offset_x', 'widget_weather_offset_y'
      )
    `).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v13_widgets_fixed', 'true')").run();
  }

  // v14: widgets moved from three separate corner anchors to a single
  // compact stack in the top-left corner. Drop the now-unused per-widget
  // anchor keys from existing installations.
  const widgetsStackMigration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v14_widgets_left_stack'").get();
  if (!widgetsStackMigration) {
    db.prepare(`
      DELETE FROM settings WHERE key IN (
        'widget_date_anchor', 'widget_time_anchor', 'widget_weather_anchor'
      )
    `).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v14_widgets_left_stack', 'true')").run();
  }

  // v20: dropped the "system" theme option (light/dark only) and removed the
  // ping widget's manual position setting — the ping widget is now always
  // docked, centered, at the bottom of the page. Also backfill the new
  // per-widget popover settings (style/format/interval/method) for the ping
  // widget on existing installations.
  const v20Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v20_widget_settings'").get();
  if (!v20Migration) {
    db.prepare("UPDATE settings SET value = 'light' WHERE key = 'theme' AND value = 'system'").run();
    db.prepare("DELETE FROM settings WHERE key = 'widget_ping_position'").run();
    const insertIfMissing = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    insertIfMissing.run("widget_ping_style", "minimal");
    insertIfMissing.run("widget_ping_format", "full");
    insertIfMissing.run("widget_ping_interval", "10");
    insertIfMissing.run("widget_ping_method", "icmp");
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v20_widget_settings', 'true')").run();
  }

  // v21: compact 38px top bar / ping dock. Existing installs that still use
  // the previous default search height of 54px are moved to 38px once.
  const v21Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v21_compact_bar'").get();
  if (!v21Migration) {
    db.prepare("UPDATE settings SET value = '38' WHERE key = 'search_height' AND value = '54'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v21_compact_bar', 'true')").run();
  }

  // v22: dark theme by default, no page title, cards without backdrop.
  const v22Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v22_defaults'").get();
  if (!v22Migration) {
    db.prepare("UPDATE settings SET value = 'dark' WHERE key = 'theme' AND value = 'light'").run();
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'brand_visible'").run();
    db.prepare("UPDATE settings SET value = 'false' WHERE key = 'card_backdrop'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v22_defaults', 'true')").run();
  }

  // v23: HemmaHub defaults — date/time/weather share one font size (15px), the
  // date widget shows the numeric format and the search field is 480px wide.
  // Only installations still sitting on a previous default are moved over, so a
  // value the user picked by hand is never overwritten.
  const v23Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v23_hemmahub_defaults'").get();
  if (!v23Migration) {
    db.prepare("UPDATE settings SET value = '15' WHERE key = 'widget_date_font_size' AND value IN ('13','14')").run();
    db.prepare("UPDATE settings SET value = '15' WHERE key = 'widget_time_font_size' AND value IN ('19','23')").run();
    db.prepare("UPDATE settings SET value = '15' WHERE key = 'widget_weather_font_size' AND value IN ('17','21')").run();
    db.prepare("UPDATE settings SET value = 'numeric' WHERE key = 'widget_date_format' AND value = 'full'").run();
    db.prepare("UPDATE settings SET value = '480' WHERE key = 'search_width' AND value = '620'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v23_hemmahub_defaults', 'true')").run();
  }

  // v25: an item now has exactly one display mode (grid | favorite | block)
  // instead of "in the grid, and additionally on the favorites shelf". The old
  // is_favorite flag becomes the seed for display_mode and is kept in sync from
  // then on, so a rollback still sees a sane favorites list.
  const v25Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v25_display_mode'").get();
  if (!v25Migration) {
    db.prepare(
      "UPDATE items SET display_mode = CASE WHEN is_favorite = 1 THEN 'favorite' ELSE 'grid' END"
    ).run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v25_display_mode', 'true')").run();
  }

  // v26: the icon background colour moved from a per-card field to one setting
  // that paints every icon. Seed it from the cards themselves, so an install
  // where they all shared one colour keeps that colour; a mix of colours has no
  // single right answer and stays on the default. The items column is left in
  // place — nothing reads it any more, but a rollback would.
  const v26Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v26_icon_background'").get();
  if (!v26Migration) {
    const colors = db.prepare(`
      SELECT DISTINCT icon_background_color AS color FROM items
      WHERE icon_background_color IS NOT NULL AND icon_background_color <> ''
    `).all();
    if (colors.length === 1) {
      db.prepare("UPDATE settings SET value = ? WHERE key = 'icon_background_color'").run(colors[0].color);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v26_icon_background', 'true')").run();
  }

  // v27: the per-card icon background is back, but only as an override on top of
  // the global switch — so every existing card starts on 'inherit' and keeps
  // looking exactly as it did. The colour column, dormant since v26, becomes the
  // colour used when a card sets its override to 'on'.
  const v27Migration = db.prepare("SELECT value FROM settings WHERE key = 'migration_v27_icon_background_mode'").get();
  if (!v27Migration) {
    db.prepare("UPDATE items SET icon_background_mode = 'inherit' WHERE icon_background_mode IS NULL OR icon_background_mode NOT IN ('inherit','on','off')").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v27_icon_background_mode', 'true')").run();
  }

  // v30: English is the new default language. INSERT OR IGNORE above only reaches
  // fresh installs, so an existing one is moved over once — and only from the old
  // default, following the v22/v23 rule that a value the user picked by hand is
  // never overwritten. A value picked by hand *after* this runs is safe: the flag
  // makes sure the flip happens exactly once.
  const v30Language = db.prepare("SELECT value FROM settings WHERE key = 'migration_v30_default_english'").get();
  if (!v30Language) {
    db.prepare("UPDATE settings SET value = 'en' WHERE key = 'language' AND value = 'ru'").run();
    db.prepare("INSERT INTO settings (key, value) VALUES ('migration_v30_default_english', 'true')").run();
  }

  seedInitialData(isFreshInstall);
}

function seedInitialData(isFreshInstall) {
  if (!isFreshInstall) return;

  log("info", "Seeding default categories");

  // The four groups a new portal opens with, in display order. They start empty:
  // the cards belong to whoever deploys this, and the seed they replace pointed
  // at five services on one specific LAN — worse than nothing anywhere else.
  const categories = ["Home lab", "Media", "Social", "AI services"];

  const insertCategory = db.prepare(
    "INSERT INTO categories (name, sort_order) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    categories.forEach((name, i) => insertCategory.run(name, i));
  });
  tx();
}

module.exports = { db, init, DB_PATH };
