import { env } from "cloudflare:workers";
import { ApiError } from "@/lib/server/context";
// Personal data is sealed with AES-256-GCM before it reaches D1, so a database export, backup or the Cloudflare
// dashboard shows ciphertext. DATA_ENCRYPTION_KEY is 32 random bytes, base64 (`openssl rand -base64 32`).
// Until it is set, values are stored as before, and rows written before it was set stay readable,
// so the key can be added without downtime; sealLegacyData() then seals old rows. Never change the key once
// data is sealed with it. Sealing is deterministic (the IV is an HMAC of the content, as in AES-SIV): unchanged
// content keeps the same ciphertext, so "did it change?" triggers still work, and only equality is revealed.
const SEALED = "enc1:", RAW = "raw1:";
const text = new TextEncoder();
let cache: { raw: string; keys: Promise<{ aes: CryptoKey; siv: CryptoKey; mac: CryptoKey }> } | null = null;

function keys() {
  const raw = (env as unknown as Record<string, unknown>).DATA_ENCRYPTION_KEY;
  if (typeof raw !== "string" || !raw) return null;
  if (cache?.raw !== raw) cache = { raw, keys: derive(raw) };
  return cache.keys;
}
async function derive(raw: string) {
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(raw.trim()), c => c.charCodeAt(0)); } catch { bytes = new Uint8Array(); }
  if (bytes.length !== 32) throw new ApiError(503, "Storage is misconfigured. Please try again later.");
  const master = await crypto.subtle.importKey("raw", bytes as BufferSource, "HKDF", false, ["deriveKey"]);
  const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: text.encode(info) });
  return {
    aes: await crypto.subtle.deriveKey(hkdf("roamly/seal"), master, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    siv: await crypto.subtle.deriveKey(hkdf("roamly/iv"), master, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]),
    mac: await crypto.subtle.deriveKey(hkdf("roamly/lookup"), master, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]),
  };
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");

/** Encrypts `value` for storage. `field` (e.g. "trips.payload") is bound in, so a value can't be moved to another column. */
export async function seal(value: string, field: string) {
  const k = keys();
  if (!k) return value.startsWith(SEALED) || value.startsWith(RAW) ? RAW + value : value;
  const { aes, siv } = await k, plain = text.encode(value);
  const iv = new Uint8Array(await crypto.subtle.sign("HMAC", siv, text.encode(field + "\0" + value))).slice(0, 12);
  const box = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: text.encode(field) }, aes, plain);
  return SEALED + b64(new Uint8Array([...iv, ...new Uint8Array(box)]));
}

/** Reads a stored value: sealed values are decrypted, and plaintext written before the key existed passes through. */
export async function unseal(stored: string, field: string) {
  if (stored.startsWith(RAW)) return stored.slice(RAW.length);
  if (!stored.startsWith(SEALED)) return stored;
  const k = keys();
  if (!k) throw new ApiError(503, "Your data is temporarily unavailable. Please try again shortly.");
  try {
    const bytes = unb64(stored.slice(SEALED.length));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: text.encode(field) }, (await k).aes, bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch {
    throw new ApiError(503, "Your data is temporarily unavailable. Please try again shortly.");
  }
}
export const unsealJson = async <T>(stored: string, field: string) => JSON.parse(await unseal(stored, field)) as T;

/**
 * An equality-only stand-in for a sealed value (e.g. an invited email), so SQL can still match and de-duplicate it.
 * Keyed ("k1:") once DATA_ENCRYPTION_KEY exists; a plain hash ("s1:") before that, which refreshLookup() replaces.
 */
export async function lookupKey(value: string) {
  const normal = text.encode(value.trim().toLowerCase()), k = keys();
  return k ? "k1:" + hex(await crypto.subtle.sign("HMAC", (await k).mac, normal)) : "s1:" + hex(await crypto.subtle.digest("SHA-256", normal));
}
/** True when a stored value or lookup key predates the current key and should be rewritten. */
export const stale = (stored: string | null, key: string | null) => keys() ? !stored?.startsWith(SEALED) || !key?.startsWith("k1:") : !key;
