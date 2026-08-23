const express = require("express");
const { db } = require("../db");
const { log } = require("../logger");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM categories ORDER BY sort_order ASC, id ASC").all();
  res.json(rows);
});

router.post("/", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories").get().m;
  const info = db
    .prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)")
    .run(name, maxOrder + 1);

  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(info.lastInsertRowid);
  log("info", "Category created", { id: row.id, name: row.name });
  res.status(201).json(row);
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Category not found" });

  const name = req.body.name ?? existing.name;
  const sort_order = req.body.sort_order ?? existing.sort_order;

  db.prepare("UPDATE categories SET name = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?").run(
    name,
    sort_order,
    req.params.id
  );

  const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
  log("info", "Category updated", { id: row.id, name: row.name });
  res.json(row);
});

router.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Category not found" });

  db.prepare("UPDATE items SET category_id = NULL WHERE category_id = ?").run(req.params.id);
  db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
  log("info", "Category deleted", { id: existing.id, name: existing.name });
  res.status(204).end();
});

module.exports = router;
