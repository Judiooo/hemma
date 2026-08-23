const express = require("express");
const { db } = require("../db");
const { log } = require("../logger");
const { normalizeCheckType } = require("../probe");

const router = express.Router();

const DISPLAY_MODES = ["grid", "favorite", "block"];
const ICON_BACKGROUND_MODES = ["inherit", "on", "off"];

router.get("/export", (req, res) => {
  // item_checks is deliberately left out: 30 days of samples for a handful of
  // services already run into tens of thousands of rows, and availability
  // history from another installation says nothing about this one. Import drops
  // the items, and ON DELETE CASCADE takes their history with them.
  const categories = db.prepare("SELECT * FROM categories ORDER BY sort_order").all();
  const items = db.prepare("SELECT * FROM items ORDER BY sort_order").all();
  const settingsRows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  const payload = {
    exported_at: new Date().toISOString(),
    version: 1,
    categories,
    items,
    settings,
  };

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="homepage-backup-${date}.json"`);
  res.setHeader("Content-Type", "application/json");
  log("info", "Backup exported");
  res.send(JSON.stringify(payload, null, 2));
});

router.post("/import", (req, res) => {
  const { categories = [], items = [], settings = {} } = req.body || {};

  if (!Array.isArray(categories) || !Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid backup file format" });
  }

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM items").run();
    db.prepare("DELETE FROM categories").run();

    const catIdMap = {};
    const insertCat = db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)");
    categories.forEach((c) => {
      const info = insertCat.run(c.name, c.sort_order ?? 0);
      catIdMap[c.id] = info.lastInsertRowid;
    });

    const insertItem = db.prepare(`
      INSERT INTO items (name, url, type, icon, icon_background_color, icon_background_mode, category_id, is_favorite, display_mode, sort_order, health_check_enabled, health_check_type)
      VALUES (@name, @url, @type, @icon, @icon_background_color, @icon_background_mode, @category_id, @is_favorite, @display_mode, @sort_order, @health_check_enabled, @health_check_type)
    `);
    items.forEach((it) => {
      // Backups taken before display modes existed only carry is_favorite.
      const mode = DISPLAY_MODES.includes(it.display_mode)
        ? it.display_mode
        : it.is_favorite
          ? "favorite"
          : "grid";
      insertItem.run({
        name: it.name,
        url: it.url,
        type: it.type === "bookmark" ? "bookmark" : "service",
        icon: it.icon || null,
        icon_background_color: it.icon_background_color || "#ffffff",
        // Backups older than v27 have no override and follow the global switch.
        icon_background_mode: ICON_BACKGROUND_MODES.includes(it.icon_background_mode) ? it.icon_background_mode : "inherit",
        category_id: it.category_id != null ? catIdMap[it.category_id] ?? null : null,
        is_favorite: mode === "favorite" ? 1 : 0,
        display_mode: mode,
        sort_order: it.sort_order ?? 0,
        health_check_enabled: it.health_check_enabled === false || it.health_check_enabled === 0 ? 0 : 1,
        health_check_type: normalizeCheckType(it.health_check_type),
      });
    });

    if (settings && typeof settings === "object") {
      const upsert = db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      );
      for (const [k, v] of Object.entries(settings)) upsert.run(k, String(v));
    }
  });

  try {
    tx();
    log("info", "Backup imported", { categories: categories.length, items: items.length });
    res.json({ ok: true, imported: { categories: categories.length, items: items.length } });
  } catch (err) {
    log("error", "Backup import failed", { message: err.message });
    res.status(500).json({ error: "Import failed: " + err.message });
  }
});

module.exports = router;
