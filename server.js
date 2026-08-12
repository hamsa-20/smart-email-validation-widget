const express = require("express");
const dns = require("dns").promises;
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const disposableDomains = new Set([
  "10minutemail.com", "guerrillamail.com", "mailinator.com",
  "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "getnada.com"
]);

const domainCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getDomain(email) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

function isValidSyntax(email) {
  if (!email || email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (/\s/.test(email)) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;

  return labels.every(
    label =>
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label)
  );
}

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("DNS_TIMEOUT")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkDomain(domain) {
  const cached = domainCache.get(domain);

  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.result, cached: true };
  }

  try {
    const mxRecords = await withTimeout(dns.resolveMx(domain), 1200);

    if (mxRecords.length > 0) {
      const result = {
        valid: true,
        reason: "Domain has MX records and can receive email.",
        check: "MX record"
      };
      domainCache.set(domain, {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS
      });
      return result;
    }
  } catch (_) {}

  try {
    const addresses = await withTimeout(
      Promise.allSettled([dns.resolve4(domain), dns.resolve6(domain)]),
      1200
    );

    const resolves = addresses.some(
      item => item.status === "fulfilled" && item.value.length > 0
    );

    const result = resolves
      ? {
          valid: true,
          reason: "Domain resolves, but no MX record was found.",
          check: "A/AAAA fallback"
        }
      : {
          valid: false,
          reason: "Domain does not resolve.",
          check: "DNS"
        };

    domainCache.set(domain, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    return result;
  } catch (_) {
    throw new Error("DNS_UNAVAILABLE");
  }
}

app.post("/api/verify-email", async (req, res) => {
  const started = Date.now();
  const email = normalizeEmail(req.body?.email);
  const domain = getDomain(email);

  if (!isValidSyntax(email)) {
    return res.status(400).json({
      valid: false, blocking: true,
      reason: "Invalid email syntax.",
      check: "Syntax", latencyMs: Date.now() - started
    });
  }

  if (disposableDomains.has(domain)) {
    return res.json({
      valid: false, blocking: true,
      reason: "Disposable email domains are not accepted.",
      check: "Disposable domain", latencyMs: Date.now() - started
    });
  }

  try {
    const result = await checkDomain(domain);
    return res.json({
      valid: result.valid,
      blocking: !result.valid,
      reason: result.reason,
      check: result.check,
      cached: Boolean(result.cached),
      latencyMs: Date.now() - started
    });
  } catch (_) {
    return res.status(503).json({
      valid: null, blocking: false,
      reason: "Verification service unavailable.",
      check: "Network", latencyMs: Date.now() - started
    });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Smart Email Validator running at http://localhost:${PORT}`);
});