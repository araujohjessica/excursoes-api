import crypto from "crypto";
import { getDb } from "../db.js";

export const PIX_DISCOUNT = 0.05;
export const MAX_INSTALLMENTS = 12;
export const MIN_INSTALLMENT_VALUE = 5;
// Tempo que uma reserva pendente segura a vaga antes de ser cancelada
export const PENDING_TTL_HOURS = Number(process.env.PAYMENT_PENDING_HOURS) || 24;
// Status que ocupam vaga na excursão
const SEAT_HOLDING = ["pending", "paid"];

export class BookingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SELECT = `
  SELECT b.*, e.title AS excursion_title, e.slug AS excursion_slug, e.event_date, e.departure_date,
         e.meeting_point, e.image AS excursion_image
  FROM bookings b JOIN excursions e ON e.id = b.excursion_id
`;

export function formatBookingId(id) {
  return `BK-${String(id).padStart(4, "0")}`;
}

export function parseBookingId(id) {
  return Number(String(id).replace(/^BK-/i, ""));
}

// Visão completa, usada no admin
function toBooking(row) {
  if (!row) return null;
  return {
    id: formatBookingId(row.id),
    excursionId: String(row.excursion_id),
    excursionTitle: row.excursion_title,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    customerCpf: row.customer_cpf,
    seats: row.seats,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    installments: row.installments,
    bookingDate: row.created_at.slice(0, 10),
    dueDate: row.due_date ?? undefined,
    expiresAt: row.payment_status === "pending" ? row.expires_at ?? undefined : undefined,
    paidAt: row.paid_at ?? undefined,
    ticketCode: row.ticket_code ?? undefined,
    invoiceUrl: row.invoice_url ?? undefined,
    bankSlipUrl: row.bank_slip_url ?? undefined,
    asaasPaymentId: row.asaas_payment_id ?? undefined,
    asaasStatus: row.asaas_status ?? undefined,
    publicToken: row.public_token ?? undefined,
  };
}

// Visão pública (página de pagamento do cliente, acessada pelo token)
function toPublicBooking(row) {
  if (!row) return null;
  const paid = row.payment_status === "paid";
  return {
    id: formatBookingId(row.id),
    token: row.public_token,
    excursion: {
      title: row.excursion_title,
      slug: row.excursion_slug,
      image: row.excursion_image,
      eventDate: row.event_date,
      departureDate: row.departure_date,
      meetingPoint: row.meeting_point,
    },
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    seats: row.seats,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    installments: row.installments,
    bookingDate: row.created_at.slice(0, 10),
    dueDate: row.due_date ?? undefined,
    expiresAt: row.payment_status === "pending" ? row.expires_at ?? undefined : undefined,
    paidAt: row.paid_at ?? undefined,
    invoiceUrl: row.payment_status === "pending" ? row.invoice_url ?? undefined : undefined,
    bankSlipUrl: row.payment_status === "pending" ? row.bank_slip_url ?? undefined : undefined,
    pixPayload: row.payment_status === "pending" ? row.pix_payload ?? undefined : undefined,
    pixQrImage: row.payment_status === "pending" ? row.pix_qr_image ?? undefined : undefined,
    ticketCode: paid ? row.ticket_code ?? undefined : undefined,
  };
}

function findRow(where, value) {
  return getDb().prepare(`${SELECT} WHERE ${where} = ?`).get(value);
}

export function findBookingRow(id) {
  return findRow("b.id", id);
}

export function findBookingRowByToken(token) {
  return findRow("b.public_token", token);
}

export function findBookingRowByAsaas({ paymentId, installmentId, externalReference }) {
  return (
    (paymentId && findRow("b.asaas_payment_id", paymentId)) ||
    (installmentId && findRow("b.asaas_installment_id", installmentId)) ||
    (externalReference && /^\d+$/.test(externalReference) && findRow("b.id", Number(externalReference))) ||
    null
  );
}

export const findBookingById = (id) => toBooking(findBookingRow(id));
export const findPublicBooking = (token) => toPublicBooking(findBookingRowByToken(token));
export { toBooking, toPublicBooking };

export function listBookings({ excursionId } = {}) {
  const db = getDb();
  const rows = excursionId
    ? db.prepare(`${SELECT} WHERE b.excursion_id = ? ORDER BY b.id DESC`).all(excursionId)
    : db.prepare(`${SELECT} ORDER BY b.id DESC`).all();
  return rows.map(toBooking);
}

export function listExpiredPendingBookings() {
  return getDb()
    .prepare(`${SELECT} WHERE b.payment_status = 'pending' AND b.expires_at IS NOT NULL AND b.expires_at <= ? ORDER BY b.id`)
    .all(new Date().toISOString());
}

export function listPendingAsaasBookings() {
  return getDb()
    .prepare(`${SELECT} WHERE b.payment_status = 'pending' AND b.asaas_payment_id IS NOT NULL ORDER BY b.id`)
    .all();
}

function generateTicketCode(eventCity) {
  const prefix = (eventCity.split(",")[0] || "").normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return `TK-${prefix || "EXC"}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function calculateTotal(price, seats, paymentMethod) {
  const base = price * seats;
  const total = paymentMethod === "pix" ? base * (1 - PIX_DISCOUNT) : base;
  return Math.round(total * 100) / 100;
}

/** Cria a reserva como pendente e já ocupa as vagas. Retorna o id interno. */
export function reserveSeats(data) {
  const db = getDb();

  const tx = db.transaction(() => {
    const exc = db.prepare("SELECT * FROM excursions WHERE id = ?").get(data.excursionId);
    if (!exc || !exc.active) throw new BookingError("Excursão não encontrada", 404);

    const spotsLeft = exc.max_spots - exc.booked_spots;
    if (data.seats > spotsLeft) throw new BookingError(`Apenas ${spotsLeft} vaga(s) disponível(is)`, 409);

    const total = calculateTotal(exc.price, data.seats, data.paymentMethod);
    const installments = data.paymentMethod === "credit" ? data.installments || 1 : 1;
    if (installments > 1 && total / installments < MIN_INSTALLMENT_VALUE) {
      throw new BookingError(`Cada parcela precisa ter no mínimo R$ ${MIN_INSTALLMENT_VALUE},00`);
    }

    const info = db
      .prepare(
        `INSERT INTO bookings (excursion_id, customer_name, customer_email, customer_phone, customer_cpf,
           seats, total_amount, payment_method, payment_status, installments, ticket_code, public_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      )
      .run(
        exc.id,
        data.customerName,
        data.customerEmail.toLowerCase(),
        data.customerPhone,
        data.customerCpf.replace(/\D/g, ""),
        data.seats,
        total,
        data.paymentMethod,
        installments,
        exc.has_tickets ? generateTicketCode(exc.event_city) : null,
        crypto.randomBytes(18).toString("base64url"),
        new Date(Date.now() + PENDING_TTL_HOURS * 3_600_000).toISOString(),
      );

    db.prepare("UPDATE excursions SET booked_spots = booked_spots + ? WHERE id = ?").run(data.seats, exc.id);
    return info.lastInsertRowid;
  });

  return tx();
}

/** Desfaz uma reserva que não chegou a gerar cobrança. */
export function discardReservation(id) {
  const db = getDb();
  db.transaction(() => {
    const row = db.prepare("SELECT excursion_id, seats FROM bookings WHERE id = ?").get(id);
    if (!row) return;
    db.prepare("UPDATE excursions SET booked_spots = MAX(0, booked_spots - ?) WHERE id = ?").run(row.seats, row.excursion_id);
    db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
  })();
}

const PAYMENT_COLUMNS = {
  asaasCustomerId: "asaas_customer_id",
  asaasPaymentId: "asaas_payment_id",
  asaasInstallmentId: "asaas_installment_id",
  asaasStatus: "asaas_status",
  invoiceUrl: "invoice_url",
  bankSlipUrl: "bank_slip_url",
  pixPayload: "pix_payload",
  pixQrImage: "pix_qr_image",
  dueDate: "due_date",
  paidAt: "paid_at",
  lastSyncAt: "last_sync_at",
  netValue: "net_value",
};

export function setPaymentInfo(id, data) {
  const row = {};
  for (const [key, column] of Object.entries(PAYMENT_COLUMNS)) if (key in data) row[column] = data[key] ?? null;
  const cols = Object.keys(row);
  if (!cols.length) return;
  getDb()
    .prepare(`UPDATE bookings SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`)
    .run({ ...row, id });
}

/**
 * Muda o status da reserva ajustando as vagas.
 * `force` permite ocupar vaga acima do limite (pagamento que chegou depois do cancelamento).
 */
export function changeStatus(id, status, { force = false, paidAt } = {}) {
  const db = getDb();

  db.transaction(() => {
    const current = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id);
    if (!current) throw new BookingError("Reserva não encontrada", 404);
    if (current.payment_status === status) return;

    const held = SEAT_HOLDING.includes(current.payment_status);
    const willHold = SEAT_HOLDING.includes(status);

    if (!held && willHold) {
      const exc = db.prepare("SELECT max_spots, booked_spots FROM excursions WHERE id = ?").get(current.excursion_id);
      if (!force && exc.booked_spots + current.seats > exc.max_spots) {
        throw new BookingError("Não há vagas suficientes para reativar esta reserva", 409);
      }
      db.prepare("UPDATE excursions SET booked_spots = booked_spots + ? WHERE id = ?").run(current.seats, current.excursion_id);
    } else if (held && !willHold) {
      db.prepare("UPDATE excursions SET booked_spots = MAX(0, booked_spots - ?) WHERE id = ?").run(current.seats, current.excursion_id);
    }

    db.prepare("UPDATE bookings SET payment_status = ?, paid_at = COALESCE(?, paid_at) WHERE id = ?").run(
      status,
      status === "paid" ? paidAt || new Date().toISOString().slice(0, 10) : null,
      id,
    );
  })();
}

export function registerWebhookEvent(event) {
  const info = getDb()
    .prepare("INSERT OR IGNORE INTO webhook_events (id, event, payment_id) VALUES (?, ?, ?)")
    .run(event.id, event.event, event.payment?.id ?? null);
  return info.changes > 0;
}
