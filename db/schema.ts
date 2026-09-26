import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
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
export const searchHistory = sqliteTable(
  "search_history",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    intake: text("intake").notNull(),
    trip: text("trip"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_history_owner_created").on(t.owner, t.createdAt, t.id)],
);
export const tripShares = sqliteTable("trip_shares", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  tripId: text("trip_id").notNull(),
  payload: text("payload").notNull(),
}, t => [index("idx_shares_owner_trip").on(t.owner, t.tripId)]);
export const subscriptions = sqliteTable("subscriptions", {
  owner: text("owner").primaryKey(),
  subscriptionId: text("subscription_id"),
  status: text("status").notNull().default("creating"),
  currentEnd: integer("current_end").notNull().default(0),
  paidCount: integer("paid_count").notNull().default(0),
  checkedAt: integer("checked_at").notNull().default(0),
}, t => [index("idx_subscription_id").on(t.subscriptionId)]);

// One-time Plus passes (Razorpay Orders); paying flips status created -> paid exactly once.
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("created"),
  paymentId: text("payment_id"),
}, t => [index("idx_orders_owner").on(t.owner)]);

export const outings = sqliteTable("outings", {
  id: text("id").primaryKey(), owner: text("owner").notNull(),
  city: text("city").notNull(), destination: text("destination").notNull(),
  startDate: text("start_date").notNull(), capacity: integer("capacity").notNull(),
  status: text("status").notNull().default("draft"),
  payload: text("payload").notNull(), meeting: text("meeting").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [index("idx_outings_owner").on(t.owner), index("idx_outings_status_date").on(t.status,t.startDate)]);
export const outingRequests = sqliteTable("outing_requests", {
  tripId: text("trip_id").notNull().references(()=>outings.id),
  member: text("member").notNull(), name: text("name").notNull(),
  message: text("message").notNull(), status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.tripId,t.member]}),index("idx_outing_requests_member").on(t.member)]);
export const outingReports = sqliteTable("outing_reports", {
  tripId: text("trip_id").notNull().references(()=>outings.id),
  reporter: text("reporter").notNull(), reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.tripId,t.reporter]})]);

// Event history deliberately survives a trip's deletion; trip links re-check access.
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey().default(sql`(lower(hex(randomblob(16))))`),
  recipient: text("recipient").notNull(),
  tripId: text("trip_id").notNull(),
  type: text("type").notNull(),
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  readAt: text("read_at"),
}, t => [index("idx_notifications_recipient_created").on(t.recipient,t.createdAt,t.id), index("idx_notifications_recipient_read").on(t.recipient,t.readAt)]);
