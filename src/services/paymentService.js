import { asaas, AsaasError } from "./asaasClient.js";
import * as Booking from "../models/bookingModel.js";
import { sendMail, notifyTeam } from "../utils/mailer.js";
import { paragraph, button, details, badge, codeBox, esc, frontendUrl } from "../utils/emailTemplate.js";

const BILLING_TYPES = { pix: "PIX", boleto: "BOLETO", credit: "CREDIT_CARD" };


// Status do Asaas → status da reserva
const STATUS_MAP = {
  PENDING: "pending",
  AWAITING_RISK_ANALYSIS: "pending",
  CONFIRMED: "paid",
  RECEIVED: "paid",
  RECEIVED_IN_CASH: "paid",
  OVERDUE: "cancelled",
  REFUNDED: "refunded",
  REFUND_REQUESTED: "refunded",
  REFUND_IN_PROGRESS: "refunded",
  CHARGEBACK_REQUESTED: "refunded",
  CHARGEBACK_DISPUTE: "refunded",
  AWAITING_CHARGEBACK_REVERSAL: "refunded",
};

// Transições que o Asaas pode aplicar sozinho (nunca "despaga" uma reserva)
const AUTO_TRANSITIONS = {
  pending: ["paid", "cancelled", "refunded"],
  cancelled: ["paid"],
  paid: ["refunded"],
  refunded: [],
};

function todayBR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Vencimento no Asaas = dia em que a reserva expira (a reserva segura a vaga por PENDING_TTL_HOURS)
function computeDueDate(expiresAt, departureDate) {
  const today = todayBR();
  let due = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(expiresAt));
  // O pagamento precisa vencer antes da saída da excursão
  if (departureDate) {
    const limit = addDays(departureDate.slice(0, 10), -1);
    if (limit < due) due = limit;
  }
  return due < today ? today : due;
}

async function ensureCustomer({ customerName, customerEmail, customerPhone, customerCpf }) {
  const cpf = customerCpf.replace(/\D/g, "");
  const data = {
    name: customerName,
    cpfCnpj: cpf,
    email: customerEmail.toLowerCase(),
    mobilePhone: customerPhone.replace(/\D/g, ""),
    notificationDisabled: false,
  };
  const existing = await asaas.findCustomerByCpf(cpf);
  // Atualiza e-mail/telefone para a cobrança chegar no endereço informado agora
  if (existing) return asaas.updateCustomer(existing.id, data);
  return asaas.createCustomer(data);
}

async function loadPixQrCode(paymentId) {
  try {
    const qr = await asaas.getPixQrCode(paymentId);
    return { pixPayload: qr.payload, pixQrImage: qr.encodedImage };
  } catch (err) {
    console.warn(`[asaas] QR Code Pix indisponível para ${paymentId}: ${err.message}`);
    return {};
  }
}

/** Checkout completo: reserva a vaga, cria a cobrança no Asaas (que envia por e-mail) e retorna a visão pública. */
export async function checkout(data) {
  const bookingId = Booking.reserveSeats(data);
  const row = Booking.findBookingRow(bookingId);

  try {
    const customer = await ensureCustomer(data);
    const dueDate = computeDueDate(row.expires_at, row.departure_date);

    const payload = {
      customer: customer.id,
      billingType: BILLING_TYPES[data.paymentMethod],
      dueDate,
      description: `Reserva ${Booking.formatBookingId(bookingId)} — ${row.excursion_title} (${row.seats} pessoa${row.seats > 1 ? "s" : ""})`,
      externalReference: String(bookingId),
    };
    if (row.installments > 1) {
      payload.installmentCount = row.installments;
      payload.totalValue = row.total_amount;
    } else {
      payload.value = row.total_amount;
    }

    const payment = await asaas.createPayment(payload);

    Booking.setPaymentInfo(bookingId, {
      asaasCustomerId: customer.id,
      asaasPaymentId: payment.id,
      asaasInstallmentId: payment.installment ?? null,
      asaasStatus: payment.status,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl ?? null,
      dueDate: payment.dueDate,
      lastSyncAt: new Date().toISOString(),
      ...(data.paymentMethod === "pix" ? await loadPixQrCode(payment.id) : {}),
    });
  } catch (err) {
    Booking.discardReservation(bookingId);
    if (err instanceof AsaasError) {
      console.error("[asaas] falha no checkout:", err.message);
      throw new Booking.BookingError(err.status < 500 ? err.message : "Não foi possível gerar a cobrança. Tente novamente.", err.status < 500 ? 400 : 502);
    }
    throw err;
  }

  const created = Booking.findBookingRow(bookingId);
  notifyTeam("newBooking", {
    subject: `${Booking.formatBookingId(bookingId)} · ${created.excursion_title}`,
    title: "Nova reserva",
    icon: "🧾",
    preheader: `${created.customer_name} reservou ${created.seats} vaga(s) · ${brl(created.total_amount)}`,
    text: `${created.customer_name} reservou ${created.seats} vaga(s) em ${created.excursion_title}. Total ${brl(created.total_amount)} via ${METHOD_LABELS[created.payment_method]}.`,
    body: badge("Aguardando pagamento", "warning") + bookingDetails(created, { withCustomer: true }),
    link: "/admin/reservas",
  });

  // E-mail para o cliente com o resumo e o link de pagamento (o Asaas também envia a cobrança)
  const payUrl = frontendUrl(`/pagamento/${created.public_token}`);
  sendMail({
    to: created.customer_email,
    subject: `Reserva ${Booking.formatBookingId(bookingId)} recebida: finalize o pagamento`,
    title: `Quase lá, ${firstName(created.customer_name)}!`,
    icon: "🎟️",
    preheader: `Sua vaga em ${created.excursion_title} está guardada por ${Booking.PENDING_TTL_HOURS} horas.`,
    text: `Recebemos sua reserva ${Booking.formatBookingId(bookingId)} para ${created.excursion_title}. Pague em até ${Booking.PENDING_TTL_HOURS}h para garantir a vaga: ${payUrl}`,
    body:
      paragraph(`Recebemos sua reserva para <strong>${esc(created.excursion_title)}</strong>. Sua vaga fica guardada por <strong>${Booking.PENDING_TTL_HOURS} horas</strong> enquanto você finaliza o pagamento.`) +
      bookingDetails(created) +
      button(created.payment_method === "pix" ? "Pagar com Pix" : "Pagar com cartão", payUrl) +
      paragraph(`Se o pagamento não for feito até <strong>${formatDateTime(created.expires_at)}</strong>, a reserva é cancelada automaticamente e a vaga liberada.`, { muted: true, size: 13 }),
  });

  return Booking.findPublicBooking(row.public_token);
}

const METHOD_LABELS = { pix: "Pix", credit: "Cartão de crédito", boleto: "Boleto", debit: "Débito" };
const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const firstName = (name) => {
  const n = String(name || "").trim().split(/\s+/)[0].toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const formatDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/** Tabela com os dados da reserva (e do cliente, nos avisos para a equipe). */
function bookingDetails(r, { withCustomer = false, withMeeting = false } = {}) {
  const payment = `${brl(r.total_amount)} · ${METHOD_LABELS[r.payment_method] || r.payment_method}${r.installments > 1 ? ` em ${r.installments}x` : ""}`;
  return details([
    ["Reserva", `<span style="font-family:monospace;color:#EA580C">${Booking.formatBookingId(r.id)}</span>`],
    ["Excursão", esc(r.excursion_title)],
    ["Saída", formatDate(r.departure_date)],
    ["Evento", formatDate(r.event_date)],
    ...(withMeeting ? [["Ponto de encontro", esc(r.meeting_point || "")]] : []),
    ["Pessoas", String(r.seats)],
    ["Total", payment],
    ...(withCustomer
      ? [
          ["Cliente", esc(r.customer_name)],
          ["E-mail", esc(r.customer_email)],
          ["Telefone", esc(r.customer_phone)],
        ]
      : []),
  ]);
}

/** Aplica o status vindo do Asaas respeitando as transições permitidas. */
function applyAsaasStatus(row, payment) {
  const target = STATUS_MAP[payment.status];
  Booking.setPaymentInfo(row.id, { asaasStatus: payment.status, lastSyncAt: new Date().toISOString() });
  if (!target || target === row.payment_status) return;
  if (!AUTO_TRANSITIONS[row.payment_status]?.includes(target)) return;

  Booking.changeStatus(row.id, target, {
    force: target === "paid",
    paidAt: payment.paymentDate || payment.confirmedDate || payment.clientPaymentDate,
  });
  console.log(`[asaas] ${Booking.formatBookingId(row.id)}: ${row.payment_status} → ${target} (${payment.status})`);

  if (target === "paid") {
    storeNetValue(row, payment).catch((err) => console.warn(`[asaas] valor líquido de ${payment.id}: ${err.message}`));
    notifyTeam("bookingPaid", {
      subject: `${Booking.formatBookingId(row.id)} · ${brl(row.total_amount)}`,
      title: "Pagamento confirmado",
      icon: "💰",
      preheader: `${row.customer_name} pagou ${brl(row.total_amount)}`,
      text: `${row.customer_name} pagou ${brl(row.total_amount)} da reserva ${Booking.formatBookingId(row.id)} (${row.excursion_title}).`,
      body: badge("Pago", "success") + bookingDetails(row, { withCustomer: true }),
      link: "/admin/reservas",
    });
    sendPaidEmailToCustomer(row.id);
  }

  // Cobrança vencida: remove no Asaas para não ser paga depois do cancelamento da vaga
  if (payment.status === "OVERDUE") {
    removeCharge(row).catch((err) => console.warn(`[asaas] não removeu cobrança vencida ${payment.id}: ${err.message}`));
  }
}

/** Confirmação de pagamento para o cliente, com os dados da viagem. */
function sendPaidEmailToCustomer(bookingId) {
  const r = Booking.findBookingRow(bookingId);
  if (!r) return;
  sendMail({
    to: r.customer_email,
    subject: `Pagamento confirmado! Reserva ${Booking.formatBookingId(r.id)} garantida ✅`,
    title: `Tudo certo, ${firstName(r.customer_name)}! 🎉`,
    icon: "✅",
    preheader: `Sua vaga em ${r.excursion_title} está garantida.`,
    text: `Recebemos o pagamento da reserva ${Booking.formatBookingId(r.id)} (${r.excursion_title}). Sua vaga está garantida. Detalhes em ${frontendUrl("/minha-conta")}`,
    body:
      badge("Vaga garantida", "success") +
      paragraph(`Recebemos o seu pagamento e sua vaga em <strong>${esc(r.excursion_title)}</strong> está garantida.`) +
      bookingDetails(r, { withMeeting: true }) +
      (r.ticket_code
        ? paragraph("Seu código de ingresso:", { size: 14 }) + codeBox(r.ticket_code.replace(/[^A-Z0-9]/gi, "").slice(-6))
          + paragraph(`Código completo: <strong style="font-family:monospace">${esc(r.ticket_code)}</strong>`, { muted: true, size: 13 })
        : "") +
      button("Ver minha reserva", frontendUrl("/minha-conta")) +
      paragraph("Chegue ao ponto de encontro com antecedência e leve um documento com foto. Qualquer dúvida, fale com a gente pela área Minha conta.", { muted: true, size: 13 }),
  });
}

/** Guarda quanto de fato entra na conta (valor − taxas do Asaas). Parcelado: soma todas as parcelas. */
export async function storeNetValue(row, payment) {
  let net = payment?.netValue;
  if (row.asaas_installment_id) {
    const payments = await asaas.listInstallmentPayments(row.asaas_installment_id);
    net = payments.reduce((s, p) => s + (p.netValue || 0), 0);
  } else if (net == null && row.asaas_payment_id) {
    net = (await asaas.getPayment(row.asaas_payment_id)).netValue;
  }
  if (net != null) Booking.setPaymentInfo(row.id, { netValue: Math.round(net * 100) / 100 });
}

function removeCharge(row) {
  return row.asaas_installment_id ? asaas.deleteInstallment(row.asaas_installment_id) : asaas.deletePayment(row.asaas_payment_id);
}

/** Consulta o Asaas e atualiza a reserva (usado quando o webhook não chega, ex.: ambiente local). */
export async function syncBooking(row) {
  if (!row?.asaas_payment_id) return row;
  if (row.asaas_installment_id) {
    const payments = await asaas.listInstallmentPayments(row.asaas_installment_id);
    const paid = payments.find((p) => STATUS_MAP[p.status] === "paid" || STATUS_MAP[p.status] === "refunded");
    applyAsaasStatus(row, paid || payments[0] || (await asaas.getPayment(row.asaas_payment_id)));
  } else {
    applyAsaasStatus(row, await asaas.getPayment(row.asaas_payment_id));
  }
  return Booking.findBookingRow(row.id);
}

const SYNC_INTERVAL_MS = 8000;

/** Visão pública da reserva; sincroniza com o Asaas se estiver pendente (com limite de frequência). */
export async function getPublicStatus(token) {
  let row = Booking.findBookingRowByToken(token);
  if (!row) return null;
  const stale = !row.last_sync_at || Date.now() - new Date(row.last_sync_at).getTime() > SYNC_INTERVAL_MS;
  if (row.payment_status === "pending" && row.expires_at && row.expires_at <= new Date().toISOString()) {
    await expireBooking(row).catch((err) => console.warn(`[expirar] ${err.message}`));
  } else if (row.payment_status === "pending" && stale) {
    try {
      row = await syncBooking(row);
    } catch (err) {
      console.warn(`[asaas] sync falhou para ${Booking.formatBookingId(row.id)}: ${err.message}`);
    }
  }
  return Booking.findPublicBooking(token);
}

const RELEVANT_EVENTS = /^PAYMENT_/;

/** Processa um evento de webhook do Asaas (idempotente pelo id do evento). */
export async function handleWebhook(event) {
  if (!event?.id || !RELEVANT_EVENTS.test(event.event || "") || !event.payment) return "ignored";
  if (!Booking.registerWebhookEvent(event)) return "duplicate";

  const { payment } = event;
  const row = Booking.findBookingRowByAsaas({
    paymentId: payment.id,
    installmentId: payment.installment,
    externalReference: payment.externalReference,
  });
  if (!row) return "not_found";

  if (event.event === "PAYMENT_DELETED") {
    if (row.payment_status === "pending") Booking.changeStatus(row.id, "cancelled");
    Booking.setPaymentInfo(row.id, { asaasStatus: "DELETED" });
    return "processed";
  }

  applyAsaasStatus(row, payment);
  return "processed";
}

/** Mudança de status feita pelo admin, refletida no Asaas. */
export async function adminChangeStatus(id, status) {
  const row = Booking.findBookingRow(id);
  if (!row) throw new Booking.BookingError("Reserva não encontrada", 404);
  const from = row.payment_status;
  if (from === status) return Booking.findBookingById(id);

  const hasCharge = Boolean(row.asaas_payment_id);

  try {
    if (status === "refunded") {
      if (from !== "paid") throw new Booking.BookingError("Só é possível reembolsar reservas pagas");
      if (hasCharge) await (row.asaas_installment_id ? asaas.refundInstallment(row.asaas_installment_id) : asaas.refundPayment(row.asaas_payment_id));
    } else if (status === "cancelled") {
      if (from === "paid") throw new Booking.BookingError("Reserva paga: use Reembolsado para devolver o valor");
      if (hasCharge && from === "pending") await removeCharge(row);
    } else if (status === "paid") {
      if (from === "refunded") throw new Booking.BookingError("Reserva já reembolsada");
      // Pagamento recebido por fora (dinheiro/transferência): informa o Asaas
      if (hasCharge && from === "pending" && row.payment_method !== "credit") {
        await asaas.receiveInCash(row.asaas_payment_id, { paymentDate: todayBR(), value: row.total_amount, notifyCustomer: true });
      }
    } else if (status === "pending") {
      throw new Booking.BookingError("Não é possível voltar a reserva para pendente");
    }
  } catch (err) {
    if (err instanceof AsaasError) throw new Booking.BookingError(`Asaas: ${err.message}`, 502);
    throw err;
  }

  Booking.changeStatus(id, status);
  if (status === "paid") sendPaidEmailToCustomer(id);
  return Booking.findBookingById(id);
}

/**
 * Cancela uma reserva pendente cujo prazo acabou. Consulta o Asaas antes,
 * para não cancelar quem pagou e o webhook ainda não chegou.
 */
export async function expireBooking(row) {
  let current = row;
  if (current.asaas_payment_id) {
    try {
      current = await syncBooking(current);
    } catch (err) {
      // Sem conseguir confirmar no Asaas, tenta de novo na próxima rodada
      console.warn(`[expirar] ${Booking.formatBookingId(row.id)}: não consultou o Asaas (${err.message})`);
      return false;
    }
  }
  if (current.payment_status !== "pending") return false;

  if (current.asaas_payment_id) {
    await removeCharge(current).catch((err) =>
      console.warn(`[expirar] ${Booking.formatBookingId(row.id)}: não removeu cobrança (${err.message})`),
    );
    Booking.setPaymentInfo(row.id, { asaasStatus: "EXPIRED" });
  }
  Booking.changeStatus(row.id, "cancelled");
  console.log(`[expirar] ${Booking.formatBookingId(row.id)} cancelada: pagamento não feito em ${Booking.PENDING_TTL_HOURS}h`);

  notifyTeam("bookingExpired", {
    subject: `${Booking.formatBookingId(row.id)} · ${current.excursion_title}`,
    title: "Reserva expirada",
    icon: "⌛",
    preheader: `${current.seats} vaga(s) liberada(s) em ${current.excursion_title}`,
    text: `A reserva ${Booking.formatBookingId(row.id)} de ${current.customer_name} expirou e ${current.seats} vaga(s) foram liberadas.`,
    body:
      badge("Cancelada por falta de pagamento", "danger") +
      bookingDetails(current, { withCustomer: true }) +
      paragraph("As vagas voltaram a ficar disponíveis no site.", { muted: true, size: 14 }),
    link: "/admin/reservas",
  });

  const link = frontendUrl(`/excursao/${current.excursion_slug}`);
  sendMail({
    to: current.customer_email,
    subject: `Reserva ${Booking.formatBookingId(row.id)} cancelada por falta de pagamento`,
    title: "Sua reserva expirou",
    icon: "⌛",
    preheader: "Não identificamos o pagamento e a vaga foi liberada.",
    text: `O pagamento da reserva ${Booking.formatBookingId(row.id)} (${current.excursion_title}) não foi identificado em ${Booking.PENDING_TTL_HOURS}h e a vaga foi liberada. Se ainda quiser ir, faça uma nova reserva: ${link}`,
    body:
      paragraph(`Não identificamos o pagamento da reserva <strong>${esc(Booking.formatBookingId(row.id))}</strong> para <strong>${esc(current.excursion_title)}</strong> em ${Booking.PENDING_TTL_HOURS} horas, então a vaga foi liberada.`) +
      paragraph("Se você já pagou, responda pela área Minha conta que a gente verifica na hora.", { muted: true, size: 14 }) +
      button("Reservar novamente", link),
  });
  return true;
}

/** Admin: força sincronização com o Asaas. */
export async function adminSync(id) {
  const row = Booking.findBookingRow(id);
  if (!row) throw new Booking.BookingError("Reserva não encontrada", 404);
  try {
    await syncBooking(row);
  } catch (err) {
    if (err instanceof AsaasError) throw new Booking.BookingError(`Asaas: ${err.message}`, 502);
    throw err;
  }
  return Booking.findBookingById(id);
}
