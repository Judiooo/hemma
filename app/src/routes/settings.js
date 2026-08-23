const express = require("express");
const { db } = require("../db");
const { log } = require("../logger");
const healthcheck = require("../healthcheck");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.put("/", (req, res) => {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) upsert.run(k, String(v));
  });
  tx(Object.entries(req.body));

  log("info", "Settings updated", { keys: Object.keys(req.body) });

  // Interval/enabled may have changed -> restart the health-check loop
  if ("healthcheck_interval" in req.body || "healthcheck_enabled" in req.body) {
    healthcheck.restartLoop();
  }

  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});


// The interface language is deliberately absent here: an appearance reset must
// never throw a user back into a language they cannot read.
const DEFAULT_APPEARANCE = {
  theme: "dark",
  font: "system",
  background: "",
  brand_visible: "false",
  brand_icon: "",
  brand_title: "",
  search_engine: "google",
  search_scope: "web",
  search_engine_visible: "true",
  search_engine_style: "pill",
  search_width: "480",
  search_height: "38",
  toolbar_direction: "row",
  toolbar_position: "top-right",
  block_transparency: "90",
  widget_transparency: "60",
  search_transparency: "60",
  button_transparency: "60",
  // The wallpaper menu belongs to appearance, rotation included: a reset stops
  // the carousel instead of leaving it running over a background it just wiped.
  background_rotation_enabled: "false",
  background_rotation_value: "30",
  background_rotation_unit: "minutes",
  background_rotation_list: "[]",
  background_rotation_last: "",
};

const DEFAULT_CARDS = {
  card_size: "medium",
  block_size: "medium",
  cards_area_width: "100",
  columns: "auto",
  sort_mode: "custom",
  card_backdrop: "false",
  card_backdrop_opacity: "medium",
  card_backdrop_color: "white",
  card_icon_plain: "false",
  icon_background_color: "#ffffff",
};

router.post("/reset/:scope", (req, res) => {
  const scope = req.params.scope;
  const defaults = scope === "appearance" ? DEFAULT_APPEARANCE : scope === "cards" ? DEFAULT_CARDS : null;
  if (!defaults) return res.status(400).json({ error: "Неизвестная область сброса" });
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) upsert.run(k, String(v));
  });
  tx();
  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  log("info", "Settings reset", { scope });
  res.json(settings);
});

module.exports = router;
