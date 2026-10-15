import { getDb } from "../db.js";
import { slugify } from "../utils/slugify.js";

const JSON_FIELDS = ["artists", "gallery", "included", "notIncluded", "itinerary"];

const COLUMNS = {
  title: "title",
  description: "description",
  fullDescription: "full_description",
  category: "category",
  eventName: "event_name",
  artists: "artists",
  image: "image",
  imagePosition: "image_position",
  gallery: "gallery",
  price: "price",
  originalPrice: "original_price",
  duration: "duration",
  departureCity: "departure_city",
  eventCity: "event_city",
  eventVenue: "event_venue",
  departureDate: "departure_date",
  returnDate: "return_date",
  eventDate: "event_date",
  maxSpots: "max_spots",
  hasTickets: "has_tickets",
  ticketType: "ticket_type",
  included: "included",
  notIncluded: "not_included",
  itinerary: "itinerary",
  meetingPoint: "meeting_point",
  rating: "rating",
  reviewCount: "review_count",
  featured: "featured",
  active: "active",
};

export function toExcursion(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    slug: row.slug,
    description: row.description,
    fullDescription: row.full_description,
    category: row.category,
    eventName: row.event_name,
    artists: JSON.parse(row.artists),
    image: row.image,
    imagePosition: row.image_position || "center",
    gallery: JSON.parse(row.gallery),
    price: row.price,
    originalPrice: row.original_price ?? undefined,
    duration: row.duration,
    departureCity: row.departure_city,
    eventCity: row.event_city,
    eventVenue: row.event_venue,
    departureDate: row.departure_date,
    returnDate: row.return_date,
    eventDate: row.event_date,
    maxSpots: row.max_spots,
    bookedSpots: row.booked_spots,
    hasTickets: Boolean(row.has_tickets),
    ticketType: row.ticket_type ?? undefined,
    included: JSON.parse(row.included),
    notIncluded: JSON.parse(row.not_included),
    itinerary: JSON.parse(row.itinerary),
    meetingPoint: row.meeting_point,
    rating: row.rating,
    reviewCount: row.review_count,
    featured: Boolean(row.featured),
    active: Boolean(row.active),
    createdAt: row.created_at.slice(0, 10),
  };
}

function toRow(data) {
  const row = {};
  for (const [key, column] of Object.entries(COLUMNS)) {
    if (!(key in data)) continue;
    let value = data[key];
    if (JSON_FIELDS.includes(key)) value = JSON.stringify(value ?? []);
    else if (typeof value === "boolean") value = value ? 1 : 0;
    row[column] = value ?? null;
  }
  return row;
}

function uniqueSlug(title, ignoreId = null) {
  const base = slugify(title) || "excursao";
  const db = getDb();
  let slug = base;
  for (let i = 2; db.prepare("SELECT id FROM excursions WHERE slug = ? AND id IS NOT ?").get(slug, ignoreId); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

export function listExcursions({ onlyActive = true } = {}) {
  const where = onlyActive ? "WHERE active = 1" : "";
  return getDb().prepare(`SELECT * FROM excursions ${where} ORDER BY created_at DESC, id DESC`).all().map(toExcursion);
}

export function findExcursionById(id) {
  return toExcursion(getDb().prepare("SELECT * FROM excursions WHERE id = ?").get(id));
}

export function findExcursionBySlug(slug) {
  return toExcursion(getDb().prepare("SELECT * FROM excursions WHERE slug = ?").get(slug));
}

export function createExcursion(data) {
  const row = { ...toRow(data), slug: uniqueSlug(data.title) };
  const cols = Object.keys(row);
  const info = getDb()
    .prepare(`INSERT INTO excursions (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`)
    .run(row);
  return findExcursionById(info.lastInsertRowid);
}

export function updateExcursion(id, data) {
  const row = toRow(data);
  if (data.title) row.slug = uniqueSlug(data.title, Number(id));
  const cols = Object.keys(row);
  if (cols.length) {
    getDb()
      .prepare(`UPDATE excursions SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`)
      .run({ ...row, id });
  }
  return findExcursionById(id);
}

export function deleteExcursion(id) {
  return getDb().prepare("DELETE FROM excursions WHERE id = ?").run(id).changes > 0;
}
