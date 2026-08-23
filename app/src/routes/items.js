const express = require("express");
const { db } = require("../db");
const { log } = require("../logger");
const healthcheck = require("../healthcheck");
const history = require("../history");
const { normalizeCheckType } = require("../probe");

const router = express.Router();

// Where an item is shown. The three modes are mutually exclusive: an item lives
// in the main grid, on the favorites shelf, or in its category block — never in
// two of them. is_favorite is kept as a derived mirror of 'favorite'.
const DISPLAY_MODES = ["grid", "favorite", "block"];

function normalizeDisplayMode(value, fallbackFavorite) {
  const mode = String(value || "").trim().toLowerCase();
  if (DISPLAY_MODES.includes(mode)) return mode;
  return fallbackFavorite ? "favorite" : "grid";
}

// Per-card override of the global "Фон иконок" switch: 'inherit' follows the
// setting, 'on'/'off' decide for this card alone.
const ICON_BACKGROUND_MODES = ["inherit", "on", "off"];

function normalizeIconBackgroundMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ICON_BACKGROUND_MODES.includes(mode) ? mode : "inherit";
}

function serializeItem(row) {
  const status = row.type === "service" ? healthcheck.getStatus(row.id) : null;
  const display_mode = normalizeDisplayMode(row.display_mode, row.is_favorite);
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type,
    icon: row.icon,
    icon_background_color: row.icon_background_color || "#ffffff",
    icon_background_mode: normalizeIconBackgroundMode(row.icon_background_mode),
    category_id: row.category_id,
    is_favorite: display_mode === "favorite",
    display_mode,
    sort_order: row.sort_order,
    health_check_enabled: !!row.health_check_enabled,
    health_check_type: normalizeCheckType(row.health_check_type),
    created_at: row.created_at,
    updated_at: row.updated_at,
    health: status,
  };
}

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM items ORDER BY sort_order ASC, id ASC").all();
  res.json(rows.map(serializeItem));
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Item not found" });
  res.json(serializeItem(row));
});

router.post("/", (req, res) => {
  const { name, url, type, icon, icon_background_color, icon_background_mode, category_id, is_favorite, display_mode, health_check_enabled, health_check_type } = req.body;

  if (!name || !url || !type) {
    return res.status(400).json({ error: "name, url and type are required" });
  }
  if (!["service", "bookmark"].includes(type)) {
    return res.status(400).json({ error: "type must be 'service' or 'bookmark'" });
  }

  const mode = normalizeDisplayMode(display_mode, is_favorite);
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM items").get().m;

  const info = db
    .prepare(
      `INSERT INTO items (name, url, type, icon, icon_background_color, icon_background_mode, category_id, is_favorite, display_mode, sort_order, health_check_enabled, health_check_type)
       VALUES (@name, @url, @type, @icon, @icon_background_color, @icon_background_mode, @category_id, @is_favorite, @display_mode, @sort_order, @health_check_enabled, @health_check_type)`
    )
    .run({
      name,
      url,
      type,
      icon: icon || null,
      icon_background_color: icon_background_color || "#ffffff",
      icon_background_mode: normalizeIconBackgroundMode(icon_background_mode),
      category_id: category_id || null,
      is_favorite: mode === "favorite" ? 1 : 0,
      display_mode: mode,
      sort_order: maxOrder + 1,
      health_check_enabled: health_check_enabled === false ? 0 : 1,
      health_check_type: normalizeCheckType(health_check_type),
    });

  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(info.lastInsertRowid);
  log("info", "Item created", { id: row.id, name: row.name, type: row.type });
  res.status(201).json(serializeItem(row));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Item not found" });

  const fields = ["name", "url", "type", "icon", "icon_background_color", "icon_background_mode", "category_id", "display_mode", "sort_order", "health_check_enabled", "health_check_type"];
  const updated = { ...existing };
  for (const f of fields) {
    if (req.body[f] !== undefined) updated[f] = req.body[f];
  }
  // A bare {is_favorite} update (the card context menu) toggles between the
  // favorites shelf and the grid without touching a 'block' assignment.
  if (req.body.display_mode === undefined && req.body.is_favorite !== undefined) {
    updated.display_mode = req.body.is_favorite ? "favorite" : "grid";
  }
  updated.display_mode = normalizeDisplayMode(updated.display_mode, existing.is_favorite);
  updated.is_favorite = updated.display_mode === "favorite" ? 1 : 0;
  updated.icon_background_mode = normalizeIconBackgroundMode(updated.icon_background_mode);
  updated.health_check_enabled = updated.health_check_enabled ? 1 : 0;
  updated.health_check_type = normalizeCheckType(updated.health_check_type);

  db.prepare(
    `UPDATE items SET name=@name, url=@url, type=@type, icon=@icon, icon_background_color=@icon_background_color,
     icon_background_mode=@icon_background_mode, category_id=@category_id,
     is_favorite=@is_favorite, display_mode=@display_mode, sort_order=@sort_order, health_check_enabled=@health_check_enabled,
     health_check_type=@health_check_type, updated_at=datetime('now') WHERE id=@id`
  ).run({ ...updated, id: req.params.id });

  const row = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  log("info", "Item updated", { id: row.id, name: row.name });
  res.json(serializeItem(row));
});

router.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Item not found" });

  db.prepare("DELETE FROM items WHERE id = ?").run(req.params.id);
  log("info", "Item deleted", { id: existing.id, name: existing.name });
  res.status(204).end();
});

// Bulk reorder: [{id, sort_order}, ...]
router.post("/reorder/bulk", (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });

  const stmt = db.prepare("UPDATE items SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
  const tx = db.transaction((items) => {
    items.forEach(({ id, sort_order }) => stmt.run(sort_order, id));
  });
  tx(order);
  log("info", "Items reordered", { count: order.length });
  res.json({ ok: true });
});

router.post("/:id/recheck", async (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  await healthcheck.forceRecheck(item.id);
  res.json(healthcheck.getStatus(item.id));
});

// v32: availability history for the Monitoring window. Everything heavy is
// aggregated by SQLite (see src/history.js) — the answer is a summary plus one
// entry per time bucket, never the raw samples.
router.get("/:id/history", (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found" });

  const data = history.getHistory(item.id, req.query.range);
  const checksEnabled =
    (db.prepare("SELECT value FROM settings WHERE key = 'healthcheck_enabled'").get()?.value ?? "true") === "true";

  res.json({
    item: {
      id: item.id,
      name: item.name,
      url: item.url,
      type: item.type,
      method: normalizeCheckType(item.health_check_type),
      health_check_enabled: !!item.health_check_enabled,
    },
    // Global switch, so the window can explain an empty chart instead of just
    // showing dashes: checks may be off for the whole portal, or for this item.
    checks_enabled: checksEnabled,
    ...data,
  });
});

module.exports = router;
