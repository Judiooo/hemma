const SENSITIVE_KEYS = ["password", "token", "secret", "authorization", "apikey", "api_key"];

function scrub(value) {
  if (value && typeof value === "object") {
    const clone = Array.isArray(value) ? [] : {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        clone[k] = "***";
      } else {
        clone[k] = scrub(v);
      }
    }
    return clone;
  }
  return value;
}

function log(level, message, meta) {
  const ts = new Date().toISOString();
  const safeMeta = meta ? scrub(meta) : undefined;
  const line = `[${ts}] [${level.toUpperCase()}] ${message}${safeMeta ? " " + JSON.stringify(safeMeta) : ""}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = { log };
