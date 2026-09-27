import type { Intake, Trip } from "@/lib/trips/schema";
import type { HistoryEntry } from "./types";
import { seal, unseal } from "@/lib/server/vault";
type HistoryRow = {
  id: string;
  intake: string;
  trip: string | null;
  status: HistoryEntry["status"];
  error: string | null;
  created_at: string;
};
async function decode(row: HistoryRow): Promise<HistoryEntry> {
  return {
    id: row.id,
    intake: JSON.parse(await unseal(row.intake, "search_history.intake")),
    trip: row.trip ? JSON.parse(await unseal(row.trip, "search_history.trip")) : null,
    status: row.status,
    error: row.error && await unseal(row.error, "search_history.error"),
    createdAt: row.created_at,
  };
}
export async function startSearch(
  database: D1Database,
  owner: string,
  intake: Intake,
) {
  const id = crypto.randomUUID();
  await database
    .prepare(
      "INSERT INTO search_history (id,owner,intake,status,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(
      id,
      owner,
      await seal(JSON.stringify(intake), "search_history.intake"),
      "pending",
      new Date().toISOString(),
    )
    .run();
  return id;
}
export async function completeSearch(
  database: D1Database,
  owner: string,
  id: string,
  trip: Trip,
) {
  await database
    .prepare(
      "UPDATE search_history SET trip=?,status='completed',error=NULL WHERE id=? AND owner=?",
    )
    .bind(await seal(JSON.stringify(trip), "search_history.trip"), id, owner)
    .run();
}
export async function failSearch(
  database: D1Database,
  owner: string,
  id: string,
  error: string,
) {
  await database
    .prepare(
      "UPDATE search_history SET status='failed',error=? WHERE id=? AND owner=?",
    )
    .bind(await seal(error.slice(0, 500), "search_history.error"), id, owner)
    .run();
}
export async function historyPage(
  database: D1Database,
  owner: string,
  offset = 0,
) {
  const rows = await database
    .prepare(
      "SELECT id,intake,trip,status,error,created_at FROM search_history WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?",
    )
    .bind(owner, offset)
    .all<HistoryRow>();
  return {
    entries: await Promise.all(rows.results.slice(0, 20).map(decode)),
    hasMore: rows.results.length > 20,
  };
}
export async function findSearch(
  database: D1Database,
  owner: string,
  id: string,
) {
  const row = await database
    .prepare(
      "SELECT id,intake,trip,status,error,created_at FROM search_history WHERE id=? AND owner=?",
    )
    .bind(id, owner)
    .first<HistoryRow>();
  return row ? decode(row) : null;
}
export async function deleteSearch(
  database: D1Database,
  owner: string,
  id: string,
) {
  await database
    .prepare("DELETE FROM search_history WHERE id=? AND owner=?")
    .bind(id, owner)
    .run();
}
