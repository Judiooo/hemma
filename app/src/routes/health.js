const express = require("express");
const healthcheck = require("../healthcheck");

const router = express.Router();

// Portal's own liveness
router.get("/", (req, res) => {
  res.json({ status: "ok", uptime_s: Math.round(process.uptime()) });
});

// Statuses of all monitored services
router.get("/services", (req, res) => {
  res.json(healthcheck.getAllStatuses());
});

module.exports = router;
