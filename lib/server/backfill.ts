import { env } from "cloudflare:workers";
import { lookupKey, seal, unseal } from "@/lib/server/vault";
// Seals rows written before DATA_ENCRYPTION_KEY existed. Runs from the Worker's cron (worker/index.ts) in small
// batches until nothing is left; a no-op without the key. Each update only lands if the row is unchanged since it
// was read, and the notification triggers ignore a plaintext -> sealed rewrite (drizzle/0009).
const COLUMNS = [
  ["trips", "payload"], ["trip_shares", "payload"], ["waitlist", "email"],
  ["search_history", "intake"], ["search_history", "trip"], ["search_history", "error"],
  ["outings", "payload"], ["outings", "meeting"], ["outing_requests", "name"], ["outing_requests", "message"], ["orders", "email"],
] as const;
const BATCH = 100;

export async function sealLegacyData() {
  const vars = env as unknown as { DB?: D1Database; DATA_ENCRYPTION_KEY?: string };
  if (!vars.DB || !vars.DATA_ENCRYPTION_KEY) return 0;
  const db = vars.DB;
  let sealed = 0;
  for (const [table, column] of COLUMNS) {
    const rows = (await db.prepare(`SELECT rowid id,${column} value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} NOT LIKE 'enc1:%' LIMIT ${BATCH}`).all<{ id: number; value: string }>()).results;
    for (const { id, value } of rows) {
      const field = `${table}.${column}`;
      const done = await db.prepare(`UPDATE ${table} SET ${column}=? WHERE rowid=? AND ${column}=?`).bind(await seal(await unseal(value, field), field), id, value).run();
      sealed += Number(done.meta.changes ?? 0);
    }
  }
  const invites = (await db.prepare(`SELECT id,email,email_key FROM outing_invites WHERE email NOT LIKE 'enc1:%' OR email_key IS NULL OR email_key NOT LIKE 'k1:%' LIMIT ${BATCH}`).all<{ id: string; email: string }>()).results;
  for (const { id, email } of invites) {
    const plain = await unseal(email, "outing_invites.email");
    // A duplicate lookup key (same email invited twice before the key existed) is left for refreshInvites().
    const done = await db.prepare("UPDATE outing_invites SET email=?,email_key=? WHERE id=? AND email=?").bind(await seal(plain, "outing_invites.email"), await lookupKey(plain), id, email).run().catch(() => null);
    sealed += Number(done?.meta.changes ?? 0);
  }
  return sealed;
}
