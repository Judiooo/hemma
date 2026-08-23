const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();
const DIR = path.join(__dirname, "..", "..", "data", "backgrounds");
const WALLPAPER_DIR = path.join(__dirname, "..", "..", "public", "wallpaper");
fs.mkdirSync(DIR, { recursive: true });
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp"]);

function wallpaperLabel(file) {
  const base = path.basename(file, path.extname(file))
    .replace(/[_-]+/g, " ")
    .replace(/\b\d{3,5}\s*[x×]\s*\d{3,5}\b/gi, "")
    .replace(/\b\d{5,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return base || path.basename(file);
}

router.get("/builtin", (req, res) => {
  if (!fs.existsSync(WALLPAPER_DIR)) return res.json({ wallpapers: [] });
  const wallpapers = fs.readdirSync(WALLPAPER_DIR)
    .filter((file) => IMAGE_EXT.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((file) => ({
      url: `/wallpaper/${encodeURIComponent(file)}`,
      name: wallpaperLabel(file),
    }));
  res.json({ wallpapers });
});

const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/bmp": ".bmp",
};

router.post("/", (req, res) => {
  const contentType = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/")) {
    return res.status(415).json({ error: "Ожидалось изображение" });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "Пустой файл" });
  }

  const id = crypto.randomUUID();
  const fileName = `${id}${EXTENSIONS[contentType] || ".img"}`;
  fs.writeFileSync(path.join(DIR, fileName), req.body);
  res.json({ url: `/api/backgrounds/${fileName}` });
});

router.get("/:file", (req, res) => {
  const file = path.basename(req.params.file);
  const fullPath = path.join(DIR, file);
  if (!fs.existsSync(fullPath)) return res.status(404).end();
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(fullPath);
});

module.exports = router;
