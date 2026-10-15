import { getDb } from "../db.js";
import { formatBookingId } from "./bookingModel.js";

const SELECT = `
  SELECT r.*, e.title AS excursion_title, e.event_name, e.slug AS excursion_slug
  FROM reviews r JOIN excursions e ON e.id = r.excursion_id
`;

// "JESSICA HELENA ARAUJO" → "Jessica A."
function shortName(full) {
  const parts = full.trim().toLowerCase().split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0];
}

function toReview(row, { admin = false } = {}) {
  const base = {
    id: row.id,
    customerName: admin ? row.customer_name : shortName(row.customer_name),
    customerCity: row.customer_city ?? undefined,
    rating: row.rating,
    comment: row.comment,
    excursionTitle: row.excursion_title,
    eventName: row.event_name || row.excursion_title,
    excursionSlug: row.excursion_slug,
    featured: Boolean(row.featured),
    createdAt: row.created_at.slice(0, 10),
  };
  if (!admin) return base;
  return {
    ...base,
    status: row.status,
    customerEmail: row.customer_email,
    bookingId: formatBookingId(row.booking_id),
    excursionId: String(row.excursion_id),
    moderatedAt: row.moderated_at ?? undefined,
  };
}

export function listApprovedReviews(limit = 12) {
  return getDb()
    .prepare(`${SELECT} WHERE r.status = 'approved' ORDER BY r.featured DESC, r.id DESC LIMIT ?`)
    .all(limit)
    .map((r) => toReview(r));
}

export function getPublicStats() {
  const db = getDb();
  const r = db.prepare("SELECT COUNT(*) AS n, AVG(rating) AS avg, SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS good FROM reviews WHERE status = 'approved'").get();
  const travelers = db.prepare("SELECT COALESCE(SUM(seats), 0) AS n FROM bookings WHERE payment_status = 'paid'").get().n;
  const trips = db.prepare("SELECT COUNT(DISTINCT excursion_id) AS n FROM bookings WHERE payment_status = 'paid'").get().n;
  return {
    reviews: r.n,
    averageRating: r.n ? Math.round(r.avg * 10) / 10 : null,
    recommendPercent: r.n ? Math.round((r.good / r.n) * 100) : null,
    travelers,
    trips,
  };
}

export function listReviewsForAdmin(status) {
  const rows = status
    ? getDb().prepare(`${SELECT} WHERE r.status = ? ORDER BY r.id DESC`).all(status)
    : getDb().prepare(`${SELECT} ORDER BY r.id DESC`).all();
  return rows.map((r) => toReview(r, { admin: true }));
}

export function listCustomerReviews(email) {
  return getDb()
    .prepare(`${SELECT} WHERE r.customer_email = ? ORDER BY r.id DESC`)
    .all(email)
    .map((r) => toReview(r, { admin: true }));
}

export function createReview(data) {
  const info = getDb()
    .prepare(
      `INSERT INTO reviews (booking_id, excursion_id, customer_email, customer_name, customer_city, rating, comment)
       VALUES (@bookingId, @excursionId, @email, @name, @city, @rating, @comment)`,
    )
    .run(data);
  return toReview(getDb().prepare(`${SELECT} WHERE r.id = ?`).get(info.lastInsertRowid), { admin: true });
}

// Nota e nº de avaliações da excursão passam a refletir as avaliações aprovadas
function recomputeExcursionRating(excursionId) {
  const db = getDb();
  const r = db.prepare("SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE excursion_id = ? AND status = 'approved'").get(excursionId);
  if (r.n) {
    db.prepare("UPDATE excursions SET rating = ?, review_count = ? WHERE id = ?").run(Math.round(r.avg * 10) / 10, r.n, excursionId);
  } else {
    db.prepare("UPDATE excursions SET review_count = 0 WHERE id = ?").run(excursionId);
  }
}

export function moderateReview(id, { status, featured }) {
  const db = getDb();
  const current = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
  if (!current) return null;
  db.prepare(
    `UPDATE reviews SET status = COALESCE(@status, status), featured = COALESCE(@featured, featured),
       moderated_at = CURRENT_TIMESTAMP WHERE id = @id`,
  ).run({ id, status: status ?? null, featured: featured === undefined ? null : featured ? 1 : 0 });
  recomputeExcursionRating(current.excursion_id);
  return toReview(db.prepare(`${SELECT} WHERE r.id = ?`).get(id), { admin: true });
}

export function deleteReview(id) {
  const db = getDb();
  const current = db.prepare("SELECT excursion_id FROM reviews WHERE id = ?").get(id);
  if (!current) return false;
  db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
  recomputeExcursionRating(current.excursion_id);
  return true;
}

export function countPendingReviews() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").get().n;
}
