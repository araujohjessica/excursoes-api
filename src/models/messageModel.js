import { getDb } from "../db.js";
import { formatBookingId } from "./bookingModel.js";

function toMessage(row) {
  return {
    id: row.id,
    sender: row.sender,
    body: row.body,
    bookingId: row.booking_id ? formatBookingId(row.booking_id) : undefined,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  };
}

export function listThread(email) {
  return getDb().prepare("SELECT * FROM messages WHERE customer_email = ? ORDER BY id").all(email).map(toMessage);
}

export function addMessage({ email, sender, body, bookingId = null }) {
  const info = getDb()
    .prepare("INSERT INTO messages (customer_email, booking_id, sender, body) VALUES (?, ?, ?, ?)")
    .run(email, bookingId, sender, body);
  return toMessage(getDb().prepare("SELECT * FROM messages WHERE id = ?").get(info.lastInsertRowid));
}

/** Marca como lidas as mensagens enviadas pelo outro lado. */
/** Retorna true se alguma mensagem foi marcada. */
export function markRead(email, reader) {
  const other = reader === "customer" ? "admin" : "customer";
  return (
    getDb()
      .prepare("UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE customer_email = ? AND sender = ? AND read_at IS NULL")
      .run(email, other).changes > 0
  );
}

export function countUnreadForCustomer(email) {
  return getDb()
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE customer_email = ? AND sender = 'admin' AND read_at IS NULL")
    .get(email).n;
}

export function listThreads() {
  return getDb()
    .prepare(
      `SELECT m.customer_email AS email,
              (SELECT customer_name FROM bookings b WHERE b.customer_email = m.customer_email ORDER BY b.id DESC LIMIT 1) AS name,
              (SELECT customer_phone FROM bookings b WHERE b.customer_email = m.customer_email ORDER BY b.id DESC LIMIT 1) AS phone,
              (SELECT last_seen_at FROM customer_presence p WHERE p.email = m.customer_email) AS last_seen_at,
              MAX(m.id) AS last_id,
              SUM(CASE WHEN m.sender = 'customer' AND m.read_at IS NULL THEN 1 ELSE 0 END) AS unread
       FROM messages m
       GROUP BY m.customer_email
       ORDER BY last_id DESC`,
    )
    .all()
    .map((t) => {
      const last = getDb().prepare("SELECT * FROM messages WHERE id = ?").get(t.last_id);
      return {
        email: t.email,
        name: t.name || t.email,
        phone: t.phone,
        unread: t.unread,
        lastSeenAt: t.last_seen_at ?? undefined,
        lastMessage: toMessage(last),
      };
    });
}

export function countUnreadForAdmin() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM messages WHERE sender = 'customer' AND read_at IS NULL").get().n;
}
