const express = require("express");
const path = require("path");
const net = require("net");
const { init } = require("./src/db");
const { log } = require("./src/logger");
const healthcheck = require("./src/healthcheck");
const { probeIcmp, probeTcp } = require("./src/probe");

init();

const app = express();
const PORT = process.env.PORT || 3000;

app.use("/api/backgrounds", express.raw({ type: ["image/*", "application/octet-stream"], limit: "50mb" }));
app.use(express.json({ limit: "2mb" }));

app.post("/api/ping", async (req, res) => {
  const method = req.body?.method === "tcp" ? "tcp" : "icmp";
  const hosts = Array.isArray(req.body?.hosts)
    ? req.body.hosts.map((host) => String(host || "").trim()).filter((host, i, arr) => host && i < 4 && arr.indexOf(host) === i)
    : [];
  if (!hosts.length) return res.json({ results: [] });

  if (method === "tcp") {
    // Optional "host:port" syntax; defaults to port 80 for a generic reachability check.
    const parsed = hosts.map((entry) => {
      const m = entry.match(/^(.+):(\d{1,5})$/);
      return m ? { host: entry, address: m[1], port: Number(m[2]) } : { host: entry, address: entry, port: 80 };
    });
    const results = await Promise.all(
      parsed.map(({ host, address, port }) =>
        probeTcp(address, port, 2000).then(({ ok, latency }) => ({ host, ok, latency: ok ? latency : null }))
      )
    );
    return res.json({ results });
  }

  const invalid = hosts.filter((host) => !net.isIP(host));
  if (invalid.length) return res.status(400).json({ error: `Некорректный IP: ${invalid.join(", ")}` });

  const results = await Promise.all(
    hosts.map((host) => probeIcmp(host, 2000).then(({ ok, latency }) => ({ host, ok, latency: ok ? latency : null })))
  );
  res.json({ results });
});

app.use("/api/items", require("./src/routes/items"));
app.use("/api/categories", require("./src/routes/categories"));
app.use("/api/settings", require("./src/routes/settings"));
app.use("/api/speedtest", require("./src/routes/speedtest"));
app.use("/api/health", require("./src/routes/health"));
app.use("/api/favicon", require("./src/routes/favicon"));
app.use("/api/backup", require("./src/routes/backup"));
const backgroundsRouter = require("./src/routes/backgrounds");
app.use("/api/backgrounds", backgroundsRouter);
// Legacy route kept for backgrounds saved by older versions of the application.
app.use("/backgrounds", backgroundsRouter);

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log("error", "Unhandled error", { message: err.message });
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  log("info", `Home portal listening on port ${PORT}`);
  healthcheck.start();
});

process.on("SIGTERM", () => {
  log("info", "Shutting down (SIGTERM)");
  healthcheck.stop();
  process.exit(0);
});
