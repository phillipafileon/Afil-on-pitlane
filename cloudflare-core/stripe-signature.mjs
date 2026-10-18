/**
 * Stripe webhook signature verification for Cloudflare Workers.
 * NOT WIRED INTO THE STAGING WORKER. No Stripe events are processed by it.
 * Use only with raw unmodified request bytes, before JSON parsing, and the
 * webhook signing secret associated with that exact endpoint/environment.
 */
const encoder = new TextEncoder();

function decodeHex(hex) {
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return null; // sha256 HMAC only
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/**
 * @param {object} opts
 * @param {Uint8Array|string} opts.rawBody original HTTP body, not JSON re-encoded
 * @param {string} opts.signatureHeader Stripe-Signature request header
 * @param {string} opts.webhookSecret secret stored in Worker secrets, not source
 * @param {number} [opts.nowMs] injectable clock for tests
 * @returns {Promise<boolean>}
 */
export async function verifyStripeWebhook({
  rawBody, signatureHeader, webhookSecret, nowMs = Date.now()
} = {}) {
  // Fail closed on malformed inputs and unset secrets.
  if (!(rawBody instanceof Uint8Array) && typeof rawBody !== "string")
    return false;
  if (typeof signatureHeader !== "string" || signatureHeader.length < 10 ||
      signatureHeader.length > 2048 || !webhookSecret ||
      typeof webhookSecret !== "string" || webhookSecret.length > 512)
    return false;
  if (!Number.isFinite(nowMs) || nowMs <= 0 || !globalThis.crypto?.subtle)
    return false;
  const bodyBytes = typeof rawBody === "string" ? encoder.encode(rawBody) : rawBody;
  if (bodyBytes.length > 1024 * 1024) return false;

  const parts = signatureHeader.split(",").map(v => v.trim());
  const timestamps = [];
  const signatures = [];
  for (const pair of parts) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    const field = pair.slice(0, i);
    const value = pair.slice(i + 1);
    if (field === "t") timestamps.push(value);
    if (field === "v1") signatures.push(value);
  }
  if (timestamps.length !== 1 || signatures.length < 1 || signatures.length > 8)
    return false;
  const timestamp = timestamps[0];
  if (!/^[1-9][0-9]{0,12}$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  // Stripe recommended default tolerance is 5 minutes; check both directions.
  if (!Number.isSafeInteger(seconds) ||
      Math.abs(nowMs - seconds * 1000) > 300000) return false;

  const prefix = encoder.encode(timestamp + ".");
  const signed = new Uint8Array(prefix.length + bodyBytes.length);
  signed.set(prefix);
  signed.set(bodyBytes, prefix.length);
  const key = await globalThis.crypto.subtle.importKey(
    "raw", encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  for (const candidate of signatures) {
    const signature = decodeHex(candidate);
    if (signature && await globalThis.crypto.subtle.verify(
      "HMAC", key, signature, signed
    )) return true;
  }
  return false;
}
