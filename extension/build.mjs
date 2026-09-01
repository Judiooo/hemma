import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = path.join(root, "app", "public");
const dist = path.join(here, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.cp(source, dist, { recursive: true });

const indexPath = path.join(dist, "index.html");
let html = await fs.readFile(indexPath, "utf8");
html = html
  .replace(/href="\/([^"]+)"/g, 'href="$1"')
  .replace(/src="\/([^"]+)"/g, 'src="$1"')
  .replace('<script src="app.js"></script>', '<script type="module" src="extension-bootstrap.js"></script>');
await fs.writeFile(indexPath, html);

// app.js contains absolute asset URLs because the self-hosted build is served
// from the Express root. Make those URLs extension-relative.
const appJsPath = path.join(dist, "app.js");
let appJs = await fs.readFile(appJsPath, "utf8");
appJs = appJs
  .replaceAll("'/icons/", "'icons/")
  .replaceAll('"/icons/', '"icons/')
  .replaceAll("`/icons/", "`icons/")
  .replaceAll("'/wallpaper/", "'wallpaper/")
  .replaceAll('"/wallpaper/', '"wallpaper/')
  .replaceAll("`/wallpaper/", "`wallpaper/");
await fs.writeFile(appJsPath, appJs);

await fs.copyFile(path.join(here, "manifest.json"), path.join(dist, "manifest.json"));
await fs.copyFile(path.join(here, "service-worker.js"), path.join(dist, "service-worker.js"));
await fs.copyFile(path.join(here, "storage.js"), path.join(dist, "storage.js"));
await fs.copyFile(path.join(here, "extension-bootstrap.js"), path.join(dist, "extension-bootstrap.js"));

console.log(`Hemma extension built at ${dist}`);
