const net = require("net");
const { execFile } = require("child_process");

// Availability of a service can be probed three ways; the method is stored per
// item in items.health_check_type.
//   http — an HTTP(S) request to the item's URL (any answer below 500 counts)
//   tcp  — a TCP handshake against the URL's host:port
//   icmp — an ICMP echo to the URL's host (the container image ships iputils)
const HEALTH_CHECK_TYPES = ["http", "tcp", "icmp"];
const DEFAULT_HEALTH_CHECK_TYPE = "http";

function normalizeCheckType(value) {
  const type = String(value || "").trim().toLowerCase();
  return HEALTH_CHECK_TYPES.includes(type) ? type : DEFAULT_HEALTH_CHECK_TYPE;
}

// RFC-1123 host label syntax. execFile passes an argument array (no shell), so
// this is not about shell escaping — it keeps anything option-like ("-f",
// "--flood") from ever reaching the ping binary as a "host".
const HOSTNAME_RE = /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/;

function isProbeHost(host) {
  const value = String(host || "").trim();
  if (!value) return false;
  return net.isIP(value) ? true : HOSTNAME_RE.test(value);
}

// Splits a stored URL into the pieces the probes need. A bare "host" or
// "host:port" is accepted too, because the URL field allows both.
function parseTarget(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch (_) {
    return null;
  }
  if (!url.hostname) return null;
  const secure = url.protocol === "https:";
  return {
    url: url.href,
    // new URL() keeps IPv6 literals in brackets; ping/connect want them bare.
    hostname: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : secure ? 443 : 80,
    secure,
  };
}

// "time=12.9 ms" (iputils/busybox, and the container runs Alpine) and
// "time<1ms" (Windows) both appear in ping output. A localized Windows ping
// writes its reply line in the OEM codepage, which does not survive the UTF-8
// decode, so those fall through to the wall-clock fallback instead.
function parseIcmpLatency(output) {
  const match = /time\s*[=<]\s*([\d]+(?:[.,][\d]+)?)/i.exec(String(output || ""));
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function probeIcmp(hostname, timeoutMs) {
  return new Promise((resolve) => {
    if (!isProbeHost(hostname)) return resolve({ ok: false, latency: null, error: "invalid_host" });
    const timeout = Math.max(200, Math.round(timeoutMs));
    const isWin = process.platform === "win32";
    // The family flag is only safe to force for literal addresses; a hostname
    // may well resolve to the other family.
    const family = net.isIPv6(hostname) ? "-6" : net.isIPv4(hostname) ? "-4" : null;
    // Windows: ping -n <count> -w <timeout_ms>; Unix: ping -c <count> -W <timeout_sec>
    const args = isWin
      ? ["-n", "1", "-w", String(timeout), hostname]
      : ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeout / 1000))), hostname];
    if (family) args.unshift(family);

    const started = process.hrtime.bigint();
    execFile("ping", args, { timeout: timeout + 1500, windowsHide: true }, (error, stdout) => {
      const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
      // The exit code is the primary signal (non-zero on every platform when no
      // echo reply arrived). The text check additionally catches the case where
      // a router answers "destination unreachable" and ping still exits 0.
      const unreachable = /unreachable/i.test(String(stdout || ""));
      if (error || unreachable) {
        return resolve({
          ok: false,
          latency: null,
          error: error && error.killed ? "timeout" : "unreachable",
        });
      }
      resolve({ ok: true, latency: parseIcmpLatency(stdout) ?? elapsed });
    });
  });
}

function probeTcp(hostname, port, timeoutMs) {
  return new Promise((resolve) => {
    const target = String(hostname || "").trim();
    const targetPort = Number(port);
    if (!target || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      return resolve({ ok: false, latency: null, error: "invalid_host" });
    }
    const socket = new net.Socket();
    const started = process.hrtime.bigint();
    let done = false;
    const finish = (ok, error) => {
      if (done) return;
      done = true;
      const latency = Number(process.hrtime.bigint() - started) / 1e6;
      socket.destroy();
      resolve(ok ? { ok: true, latency } : { ok: false, latency: null, error });
    };
    socket.setTimeout(Math.max(250, Math.round(timeoutMs)));
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "timeout"));
    socket.once("error", () => finish(false, "unreachable"));
    socket.connect(targetPort, target);
  });
}

async function probeHttp(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(250, Math.round(timeoutMs)));
  const started = process.hrtime.bigint();
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
    const latency = Number(process.hrtime.bigint() - started) / 1e6;
    // Any HTTP answer (even 401/403/404) means the host replied = online.
    return { ok: res.status < 500, latency, http_status: res.status };
  } catch (err) {
    return { ok: false, latency: null, error: err.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Runs the probe an item is configured for. Always resolves; the caller turns
// the result into a cached status.
async function probeItem(item, timeoutMs = 5000) {
  const method = normalizeCheckType(item?.health_check_type);
  const target = parseTarget(item?.url);
  if (!target) return { ok: false, latency: null, error: "invalid_url", method };

  if (method === "icmp") {
    return { ...(await probeIcmp(target.hostname, timeoutMs)), method, host: target.hostname };
  }
  if (method === "tcp") {
    return {
      ...(await probeTcp(target.hostname, target.port, timeoutMs)),
      method,
      host: target.hostname,
      port: target.port,
    };
  }
  return { ...(await probeHttp(target.url, timeoutMs)), method };
}

module.exports = {
  HEALTH_CHECK_TYPES,
  DEFAULT_HEALTH_CHECK_TYPE,
  normalizeCheckType,
  isProbeHost,
  parseTarget,
  probeIcmp,
  probeTcp,
  probeHttp,
  probeItem,
};
