const express = require("express");
const { log } = require("../logger");

const router = express.Router();

// Resolves the icon a site actually serves right now: the page markup is read,
// every declared icon is ranked, and the winning file is downloaded and checked
// by its binary signature before the URL is handed back to the UI. A site that
// declares nothing still gets the /favicon.ico convention as a last resort.
const USER_AGENT = "Mozilla/5.0 (compatible; HomePortal/1.1; +http://localhost)";
const HTML_TIMEOUT_MS = 4000;
const FILE_TIMEOUT_MS = 3000;
const TOTAL_BUDGET_MS = 8000;
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const MAX_CANDIDATES = 6;
const CACHE_TTL_MS = 10 * 60 * 1000;

// rel -> base score. Apple touch icons are usually the largest bitmap a site
// publishes, so they win over the classic 16x16 favicon.
const ICON_REL_SCORES = {
  "apple-touch-icon": 70,
  "apple-touch-icon-precomposed": 66,
  icon: 60,
  "shortcut icon": 58,
  "icon shortcut": 58,
  "fluid-icon": 30,
  "mask-icon": 10,
};

const cache = new Map(); // "origin/path" -> { value, expires }

function normalizeTarget(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch (_) {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  return url;
}

function absoluteUrl(href, baseUrl) {
  const value = String(href || "").trim();
  if (!value || /^data:/i.test(value)) return "";
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function decodeEntities(value) {
  return String(value)
    .replace(/&(?:amp|#0*38|#x0*26);/gi, "&")
    .replace(/&(?:quot|#0*34);/gi, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&(?:lt|#0*60);/gi, "<")
    .replace(/&(?:gt|#0*62);/gi, ">");
}

function attrValue(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, "i");
  const m = tag.match(re);
  if (!m) return "";
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim();
}

// Largest square edge declared in a sizes attribute ("32x32 64x64" -> 64).
function parseSizes(value) {
  const text = String(value || "").toLowerCase();
  let max = 0;
  for (const pair of text.match(/\d+\s*x\s*\d+/g) || []) {
    const [w, h] = pair.split("x").map((n) => parseInt(n, 10));
    max = Math.max(max, Math.min(w || 0, h || 0));
  }
  if (/\bany\b/.test(text)) max = Math.max(max, 512);
  return max;
}

function sizeBonus(size) {
  return Math.min(size, 512) / 8;
}

function headOf(html) {
  return html.split(/<\/head\s*>/i)[0] || html;
}

function tagsOf(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) || [];
}

function collectHtmlCandidates(html, baseUrl) {
  const head = headOf(html);
  const candidates = [];

  for (const tag of tagsOf(head, "link")) {
    const rel = attrValue(tag, "rel").toLowerCase().replace(/\s+/g, " ").trim();
    if (!rel || !/\bicon\b/.test(rel)) continue;
    const url = absoluteUrl(attrValue(tag, "href"), baseUrl);
    if (!url) continue;
    const score = ICON_REL_SCORES[rel] ?? 50;
    const type = attrValue(tag, "type").toLowerCase();
    let size = parseSizes(attrValue(tag, "sizes"));
    // SVG icons scale to any card size, so treat them as a large bitmap.
    if (!size && (type === "image/svg+xml" || /\.svg(?:[?#]|$)/i.test(url))) size = 512;
    candidates.push({ url, source: "link", score: score + sizeBonus(size) });
  }

  for (const tag of tagsOf(head, "meta")) {
    if (attrValue(tag, "name").toLowerCase() !== "msapplication-tileimage") continue;
    const url = absoluteUrl(attrValue(tag, "content"), baseUrl);
    if (url) candidates.push({ url, source: "meta", score: 55 });
  }

  return candidates;
}

function findManifestUrl(html, baseUrl) {
  for (const tag of tagsOf(headOf(html), "link")) {
    if (attrValue(tag, "rel").toLowerCase().trim() !== "manifest") continue;
    const url = absoluteUrl(attrValue(tag, "href"), baseUrl);
    if (url) return url;
  }
  return "";
}

async function collectManifestCandidates(manifestUrl) {
  try {
    const { res, body } = await fetchCapped(manifestUrl, { timeoutMs: HTML_TIMEOUT_MS, maxBytes: MAX_TEXT_BYTES });
    if (!res.ok) return [];
    const manifest = JSON.parse(body.toString("utf8"));
    const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
    return icons
      .map((icon) => {
        const url = absoluteUrl(icon?.src, res.url || manifestUrl);
        if (!url) return null;
        return { url, source: "manifest", score: 45 + sizeBonus(parseSizes(icon?.sizes)) };
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

// Identifies the payload by its magic bytes. This is what makes the check a
// check: servers happily answer 200 with an HTML error page for a missing
// /favicon.ico, and some serve .ico files as text/plain.
function detectImageType(buffer) {
  if (buffer.length < 4) return null;
  const b = buffer;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) return "image/x-icon";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii4 = b.subarray(0, 4).toString("latin1");
  if (ascii4 === "GIF8") return "image/gif";
  if (ascii4 === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.subarray(0, 2).toString("latin1") === "BM") return "image/bmp";
  const text = b.subarray(0, 2048).toString("utf8").toLowerCase();
  if (/<svg[\s>]/.test(text) && !/<html[\s>]/.test(text)) return "image/svg+xml";
  return null;
}

async function readCapped(res, maxBytes) {
  if (!res.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    const buf = Buffer.from(chunk);
    chunks.push(buf);
    size += buf.length;
    if (size >= maxBytes) break;
  }
  return Buffer.concat(chunks).subarray(0, maxBytes);
}

async function fetchCapped(url, { timeoutMs, maxBytes, accept }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: accept || "image/*,*/*;q=0.8" },
    });
    const body = await readCapped(res, maxBytes);
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

async function verifyCandidate(url) {
  try {
    const { res, body } = await fetchCapped(url, { timeoutMs: FILE_TIMEOUT_MS, maxBytes: MAX_ICON_BYTES });
    if (!res.ok) return null;
    const type = detectImageType(body);
    if (!type) return null;
    return { url: res.url || url, type, bytes: body.length };
  } catch (_) {
    return null;
  }
}

function dedupe(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  return unique;
}

async function resolveSiteIcon(target) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const candidates = [];
  let pageUrl = target.href;

  try {
    const { res, body } = await fetchCapped(target.href, {
      timeoutMs: HTML_TIMEOUT_MS,
      maxBytes: MAX_TEXT_BYTES,
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    });
    if (res.ok) {
      pageUrl = res.url || pageUrl;
      // The URL may point straight at an image instead of a page.
      const directType = detectImageType(body);
      if (directType && directType !== "image/svg+xml") {
        return { url: pageUrl, type: directType, bytes: body.length, source: "url" };
      }
      const html = body.toString("utf8");
      candidates.push(...collectHtmlCandidates(html, pageUrl));
      if (!candidates.length) {
        const manifestUrl = findManifestUrl(html, pageUrl);
        if (manifestUrl && Date.now() < deadline) candidates.push(...(await collectManifestCandidates(manifestUrl)));
      }
    }
  } catch (err) {
    // A page that cannot be read is not fatal: /favicon.ico may still be there.
    log("warn", "Site page could not be read for icon detection", { url: target.href, reason: err.message });
  }

  const fallback = absoluteUrl("/favicon.ico", pageUrl);
  if (fallback) candidates.push({ url: fallback, source: "default", score: 20 });

  const ordered = dedupe(candidates).sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
  for (const candidate of ordered) {
    if (Date.now() > deadline) break;
    const verified = await verifyCandidate(candidate.url);
    if (verified) return { ...verified, source: candidate.source };
  }
  return null;
}

router.get("/", async (req, res) => {
  const target = normalizeTarget(req.query.url);
  if (!target) return res.status(400).json({ error: "Некорректный URL сайта" });

  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  const cacheKey = `${target.origin}${target.pathname}`;
  if (!refresh) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return res.json({ ...hit.value, cached: true });
  }

  try {
    const resolved = await resolveSiteIcon(target);
    if (!resolved) {
      cache.delete(cacheKey);
      log("info", "No usable site icon found", { url: target.href });
      return res.json({ url: null });
    }
    cache.set(cacheKey, { value: resolved, expires: Date.now() + CACHE_TTL_MS });
    log("info", "Site icon resolved", { url: target.href, icon: resolved.url, source: resolved.source });
    res.json(resolved);
  } catch (err) {
    log("error", "Site icon detection failed", { url: target.href, message: err.message });
    res.status(502).json({ error: "Не удалось проверить иконку сайта" });
  }
});

module.exports = router;
