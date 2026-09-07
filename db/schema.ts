import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    payload: text("payload").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_trips_owner_created").on(t.owner, t.createdAt)],
);
export const usage = sqliteTable("usage", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
});
export const waitlist = sqliteTable("waitlist", {
  owner: text("owner").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
});
