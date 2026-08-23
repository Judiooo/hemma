const { probeTcp } = require("./probe");

// Network speed measurement for the bottom-left widget (v30).
//
// The measurement runs here, on the backend, not in the browser: most public
// test files answer without CORS headers, so a page cannot time them, and a
// self-hosted portal's interesting number is the line the server sits on. The
// widget says as much next to its results.
//
// Each server is a download URL plus, where the provider offers one, an upload
// sink. Anything without a sink reports a download and a latency and leaves the
// upload empty rather than borrowing another provider's endpoint and reporting a
// number the chosen server never produced.
// Cloudflare's __down refuses anything much above 80 MB with a 403 and a
// one-byte body, so the request stays at 50 MB; measureDownload keeps asking for
// more chunks when a line drains one that fast, which is the case the larger
// file was meant to cover anyway.
const CLOUDFLARE_DOWN = "https://speed.cloudflare.com/__down?bytes=52428800";

const SPEED_SERVERS = {
  // Cloudflare answers from whichever of its datacenters is closest (anycast),
  // which is exactly what "auto" means here — hence the same endpoint twice,
  // under two ids.
  auto: {
    label: "Cloudflare",
    download: CLOUDFLARE_DOWN,
    upload: "https://speed.cloudflare.com/__up",
    host: "speed.cloudflare.com",
  },
  cloudflare: {
    label: "Cloudflare",
    download: CLOUDFLARE_DOWN,
    upload: "https://speed.cloudflare.com/__up",
    host: "speed.cloudflare.com",
  },
  // Hetzner retired speed.hetzner.de; the per-datacenter hosts are the current
  // ones, and being able to aim at a specific city is the point of the list.
  hetzner: {
    label: "Hetzner (DE)",
    download: "https://fsn1-speed.hetzner.com/100MB.bin",
    upload: null,
    host: "fsn1-speed.hetzner.com",
  },
  hetzner_us: {
    label: "Hetzner (US)",
    download: "https://ash-speed.hetzner.com/100MB.bin",
    upload: null,
    host: "ash-speed.hetzner.com",
  },
  ovh: {
    label: "OVH (FR)",
    download: "https://proof.ovh.net/files/100Mb.dat",
    upload: null,
    host: "proof.ovh.net",
  },
};

const DEFAULT_SERVER = "auto";

// A transfer stops on whichever limit it reaches first. The time caps keep a
// slow line from turning one click into a minute of waiting; the byte caps keep
// a fast one from pulling half a gigabyte to answer a question 128 MB already
// answers.
const DOWNLOAD_MAX_MS = 8000;
const DOWNLOAD_MAX_BYTES = 128 * 1024 * 1024;
// A sample much shorter than this is mostly TCP slow-start rather than the speed
// of the line, so a connection that drains one file that fast keeps asking for
// another until the sample is long enough or a cap stops it.
const DOWNLOAD_MIN_SECONDS = 2;
const DOWNLOAD_MAX_REQUESTS = 4;
const UPLOAD_MAX_MS = 12000;
const UPLOAD_BYTES = 8 * 1024 * 1024;
const LATENCY_ATTEMPTS = 3;
const LATENCY_TIMEOUT_MS = 1500;

// Some CDNs answer a bare Node request with a challenge page; a plain browser
// UA gets the file.
const USER_AGENT = "Mozilla/5.0 (compatible; HemmaHub/1.0; +speedtest)";

function normalizeServer(value) {
  const id = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SPEED_SERVERS, id) ? id : DEFAULT_SERVER;
}

function bitsPerSecond(bytes, seconds) {
  if (!(bytes > 0) || !(seconds > 0)) return null;
  return (bytes * 8) / seconds;
}

// One pass over one response body. The clock starts when the first byte of
// payload lands, so the DNS lookup, the TCP handshake and the TLS handshake stay
// out of the throughput figure — that part of the connection is what the latency
// number is for. The first chunk pays for starting the clock and is not counted.
async function streamOnce(url, budgetMs, byteBudget) {
  const controller = new AbortController();
  const guard = setTimeout(() => controller.abort(), budgetMs + 5000);
  const empty = { bytes: 0, seconds: 0 };
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, "accept-encoding": "identity" },
    });
    if (!res.ok || !res.body) {
      if (res.body) await res.body.cancel();
      return { ...empty, error: `http_${res.status}` };
    }

    const reader = res.body.getReader();
    let received = 0;
    let started = null;
    let deadline = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (started === null) {
        started = process.hrtime.bigint();
        deadline = started + BigInt(budgetMs) * 1000000n;
        continue;
      }
      received += value.length;
      if (received >= byteBudget || process.hrtime.bigint() >= deadline) {
        await reader.cancel();
        break;
      }
    }
    if (started === null) return { ...empty, error: "empty" };
    return { bytes: received, seconds: Number(process.hrtime.bigint() - started) / 1e9, error: null };
  } catch (err) {
    return { ...empty, error: err.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(guard);
  }
}

// Bytes and streaming time accumulate across passes; the gap between one
// response ending and the next beginning is not counted, for the same reason the
// handshake is not.
async function measureDownload(url) {
  let bytes = 0;
  let seconds = 0;
  let error = null;
  for (let pass = 0; pass < DOWNLOAD_MAX_REQUESTS; pass += 1) {
    const budgetMs = DOWNLOAD_MAX_MS - Math.round(seconds * 1000);
    if (budgetMs <= 0) break;
    const chunk = await streamOnce(url, budgetMs, DOWNLOAD_MAX_BYTES - bytes);
    if (chunk.error) {
      if (bytes === 0) error = chunk.error;
      break;
    }
    bytes += chunk.bytes;
    seconds += chunk.seconds;
    if (bytes >= DOWNLOAD_MAX_BYTES || seconds >= DOWNLOAD_MIN_SECONDS) break;
  }
  if (error) return { speed: null, error };
  const speed = bitsPerSecond(bytes, seconds);
  return speed === null ? { speed: null, error: "too_short" } : { speed, error: null };
}

// Upload has no partial-credit path: an aborted POST leaves no reliable count of
// what reached the far end, so the whole payload either goes out inside the cap
// or the widget shows a dash.
async function measureUpload(url) {
  const controller = new AbortController();
  const guard = setTimeout(() => controller.abort(), UPLOAD_MAX_MS);
  const payload = Buffer.alloc(UPLOAD_BYTES, 0x48);
  try {
    const started = process.hrtime.bigint();
    const res = await fetch(url, {
      method: "POST",
      body: payload,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "content-type": "application/octet-stream",
        "content-length": String(payload.length),
      },
    });
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    if (res.body) await res.body.cancel();
    if (!res.ok) return { speed: null, error: `http_${res.status}` };
    const speed = bitsPerSecond(payload.length, seconds);
    return speed === null ? { speed: null, error: "too_short" } : { speed, error: null };
  } catch (err) {
    return { speed: null, error: err.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(guard);
  }
}

// The best of a few TCP handshakes against the test server's HTTPS port. The
// minimum, not the average: a single scheduling hiccup should not be reported as
// the state of the line.
async function measureLatency(host) {
  let best = null;
  for (let attempt = 0; attempt < LATENCY_ATTEMPTS; attempt += 1) {
    const { ok, latency } = await probeTcp(host, 443, LATENCY_TIMEOUT_MS);
    if (ok && Number.isFinite(latency) && (best === null || latency < best)) best = latency;
  }
  return best;
}

async function runSpeedTest(serverId) {
  const id = normalizeServer(serverId);
  const server = SPEED_SERVERS[id];

  // Latency first: it is the cheapest of the three and the only one that still
  // says something useful when the transfers fail.
  const latency = await measureLatency(server.host);
  const download = await measureDownload(server.download);
  const upload = server.upload ? await measureUpload(server.upload) : { speed: null, error: "unsupported" };

  return {
    serverId: id,
    server: server.label,
    download: download.speed,
    upload: upload.speed,
    latency,
    errors: {
      download: download.error,
      upload: upload.error,
      latency: latency === null ? "unreachable" : null,
    },
  };
}

module.exports = { SPEED_SERVERS, DEFAULT_SERVER, normalizeServer, runSpeedTest };
