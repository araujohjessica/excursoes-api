import crypto from "crypto";
import { getDb } from "../db.js";
import { formatBookingId } from "./bookingModel.js";

const CODE_TTL_MIN = 10;
export const MAX_CODE_ATTEMPTS = 5;

const hashCode = (email, code) => crypto.createHash("sha256").update(`${email}:${code}:${process.env.JWT_SECRET}`).digest("hex");

export function customerExists(email) {
  return Boolean(getDb().prepare("SELECT 1 FROM bookings WHERE customer_email = ? LIMIT 1").get(email));
}

export function createLoginCode(email) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const db = getDb();
  db.prepare("UPDATE customer_login_codes SET used_at = CURRENT_TIMESTAMP WHERE email = ? AND used_at IS NULL").run(email);
  db.prepare("INSERT INTO customer_login_codes (email, code_hash, expires_at) VALUES (?, ?, ?)").run(
    email,
    hashCode(email, code),
    new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
  );
  return { code, ttlMinutes: CODE_TTL_MIN };
}

/** Retorna true se o código confere; conta tentativas e invalida após uso. */
export function consumeLoginCode(email, code) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM customer_login_codes WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1")
    .get(email);
  if (!row || row.expires_at < new Date().toISOString() || row.attempts >= MAX_CODE_ATTEMPTS) return false;

  const a = Buffer.from(row.code_hash);
  const b = Buffer.from(hashCode(email, code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    db.prepare("UPDATE customer_login_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return false;
  }
  db.prepare("UPDATE customer_login_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
  return true;
}

export function getCustomerProfile(email) {
  const db = getDb();
  const last = db
    .prepare("SELECT customer_name, customer_phone FROM bookings WHERE customer_email = ? ORDER BY id DESC LIMIT 1")
    .get(email);
  if (!last) return null;
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
              SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM bookings WHERE customer_email = ?`,
    )
    .get(email);
  const unread = db
    .prepare("SELECT COUNT(*) AS n FROM messages WHERE customer_email = ? AND sender = 'admin' AND read_at IS NULL")
    .get(email).n;
  return {
    name: last.customer_name,
    email,
    phone: last.customer_phone,
    stats: { bookings: stats.total, paid: stats.paid || 0, pending: stats.pending || 0, unreadMessages: unread },
  };
}

export function listCustomerBookings(email) {
  const rows = getDb()
    .prepare(
      `SELECT b.*, e.title, e.slug, e.image, e.event_name, e.event_city, e.event_venue, e.departure_city,
              e.event_date, e.departure_date, e.return_date, e.duration, e.meeting_point, e.itinerary,
              e.included, e.not_included, e.ticket_type,
              r.id AS review_id, r.status AS review_status, r.rating AS review_rating
       FROM bookings b
       JOIN excursions e ON e.id = b.excursion_id
       LEFT JOIN reviews r ON r.booking_id = b.id
       WHERE b.customer_email = ?
       ORDER BY COALESCE(e.departure_date, b.created_at) DESC, b.id DESC`,
    )
    .all(email);

  return rows.map((r) => {
    const paid = r.payment_status === "paid";
    return {
      id: formatBookingId(r.id),
      paymentToken: r.public_token,
      seats: r.seats,
      totalAmount: r.total_amount,
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      installments: r.installments,
      bookingDate: r.created_at.slice(0, 10),
      dueDate: r.due_date ?? undefined,
      expiresAt: r.payment_status === "pending" ? r.expires_at ?? undefined : undefined,
      paidAt: r.paid_at ?? undefined,
      ticketCode: paid ? r.ticket_code ?? undefined : undefined,
      excursion: {
        title: r.title,
        slug: r.slug,
        image: r.image,
        eventName: r.event_name,
        eventCity: r.event_city,
        eventVenue: r.event_venue,
        departureCity: r.departure_city,
        eventDate: r.event_date,
        departureDate: r.departure_date,
        returnDate: r.return_date,
        duration: r.duration,
        meetingPoint: r.meeting_point,
        ticketType: r.ticket_type ?? undefined,
        itinerary: JSON.parse(r.itinerary),
        included: JSON.parse(r.included),
        notIncluded: JSON.parse(r.not_included),
      },
      review: r.review_id ? { status: r.review_status, rating: r.review_rating } : null,
      canReview: paid && !r.review_id,
    };
  });
}

export function findCustomerBooking(email, bookingId) {
  return getDb().prepare("SELECT * FROM bookings WHERE id = ? AND customer_email = ?").get(bookingId, email);
}
