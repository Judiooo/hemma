const express = require("express");
const { log } = require("../logger");
const { runSpeedTest } = require("../speedtest");

const router = express.Router();

// One measurement at a time, process-wide. Two runs sharing the line would each
// report roughly half of it, and the second click is nearly always an impatient
// repeat of the first rather than a second question.
let running = null;

router.post("/", async (req, res, next) => {
  if (running) return res.status(429).json({ error: "A measurement is already running" });
  running = true;
  try {
    const result = await runSpeedTest(req.body?.server);
    log("info", "Speed test finished", {
      server: result.serverId,
      download: result.download === null ? null : Math.round(result.download / 1e6),
      upload: result.upload === null ? null : Math.round(result.upload / 1e6),
      latency: result.latency === null ? null : Math.round(result.latency),
    });
    // A run that measured nothing at all is a failure, not a result: the widget
    // should say so instead of showing three dashes as if that were the answer.
    if (result.download === null && result.upload === null && result.latency === null) {
      return res.status(502).json({ error: "The test server did not respond" });
    }
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    running = null;
  }
});

module.exports = router;
