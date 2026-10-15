import { getDb } from "../db.js";

function toRequest(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    eventName: r.event_name,
    eventCity: r.event_city ?? undefined,
    eventDate: r.event_date ?? undefined,
    departureCity: r.departure_city ?? undefined,
    people: r.people,
    message: r.message ?? undefined,
    status: r.status,
    adminNotes: r.admin_notes ?? undefined,
    updatedAt: r.updated_at ?? undefined,
    createdAt: r.created_at,
  };
}

export function createRequest(d) {
  const info = getDb()
    .prepare(
      `INSERT INTO excursion_requests (name, email, phone, event_name, event_city, event_date, departure_city, people, message)
       VALUES (@name, @email, @phone, @eventName, @eventCity, @eventDate, @departureCity, @people, @message)`,
    )
    .run({
      name: d.name,
      email: d.email.toLowerCase(),
      phone: d.phone,
      eventName: d.eventName,
      eventCity: d.eventCity || null,
      eventDate: d.eventDate || null,
      departureCity: d.departureCity || null,
      people: d.people,
      message: d.message || null,
    });
  return findRequest(info.lastInsertRowid);
}

export function findRequest(id) {
  const r = getDb().prepare("SELECT * FROM excursion_requests WHERE id = ?").get(id);
  return r ? toRequest(r) : null;
}

export function listRequests(status) {
  const rows = status
    ? getDb().prepare("SELECT * FROM excursion_requests WHERE status = ? ORDER BY id DESC").all(status)
    : getDb().prepare("SELECT * FROM excursion_requests ORDER BY id DESC").all();
  return rows.map(toRequest);
}

export function updateRequest(id, { status, adminNotes }) {
  getDb()
    .prepare(
      `UPDATE excursion_requests SET status = COALESCE(@status, status),
         admin_notes = CASE WHEN @hasNotes THEN @adminNotes ELSE admin_notes END,
         updated_at = CURRENT_TIMESTAMP WHERE id = @id`,
    )
    .run({ id, status: status ?? null, hasNotes: adminNotes !== undefined ? 1 : 0, adminNotes: adminNotes ?? null });
  return findRequest(id);
}

export function deleteRequest(id) {
  return getDb().prepare("DELETE FROM excursion_requests WHERE id = ?").run(id).changes > 0;
}

export function countNewRequests() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM excursion_requests WHERE status = 'new'").get().n;
}

const normalize = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Eventos mais pedidos (agrupando nomes parecidos), para saber onde há demanda. */
export function demandRanking(limit = 8) {
  const rows = getDb()
    .prepare("SELECT event_name, people, departure_city FROM excursion_requests WHERE status != 'archived'")
    .all();
  const groups = new Map();
  for (const r of rows) {
    const key = normalize(r.event_name);
    const g = groups.get(key) || { eventName: r.event_name, requests: 0, people: 0, cities: new Set() };
    g.requests++;
    g.people += r.people;
    if (r.departure_city) g.cities.add(r.departure_city.trim());
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.people - a.people || b.requests - a.requests)
    .slice(0, limit)
    .map((g) => ({ eventName: g.eventName, requests: g.requests, people: g.people, departureCities: [...g.cities].slice(0, 5) }));
}
