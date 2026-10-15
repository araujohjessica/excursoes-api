import * as Customer from "../models/customerModel.js";
import * as Message from "../models/messageModel.js";
import * as Review from "../models/reviewModel.js";
import { parseBookingId } from "../models/bookingModel.js";
import { signToken } from "../utils/jwt.js";
import { sendMail, isMailConfigured, notifyTeam } from "../utils/mailer.js";
import { paragraph, button, codeBox, details, quote, badge, stars, esc, frontendUrl } from "../utils/emailTemplate.js";
import { createRateLimiter } from "../utils/rateLimiter.js";
import { notifyAdmins, notifyCustomer } from "../realtime/hub.js";
import { countUnreadForAdmin } from "../models/messageModel.js";

const codeRequestLimit = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });
const codeVerifyLimit = createRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

const CODE_SENT_MESSAGE = "Enviamos um código de acesso para o seu e-mail.";

export async function requestCode(req, res) {
  const email = req.body.email.toLowerCase();
  if (!codeRequestLimit(email) || !codeRequestLimit(`ip:${req.ip}`)) {
    return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
  }
  if (!Customer.customerExists(email)) {
    return res.status(404).json({ message: "Não encontramos nenhuma reserva com este e-mail. Confira se digitou o mesmo e-mail usado na reserva." });
  }

  const { code, ttlMinutes } = Customer.createLoginCode(email);
  await sendMail({
    to: email,
    subject: `Seu código de acesso: ${code}`,
    title: "Seu código de acesso",
    icon: "🔐",
    preheader: `Seu código é ${code}. Ele vale por ${ttlMinutes} minutos.`,
    text: `Use o código ${code} para entrar na sua área. Ele vale por ${ttlMinutes} minutos.`,
    body:
      paragraph("Use o código abaixo para entrar em <strong>Minha conta</strong> e acompanhar suas excursões:") +
      codeBox(code) +
      paragraph(`O código vale por <strong>${ttlMinutes} minutos</strong> e só pode ser usado uma vez.`, { muted: true, size: 14 }) +
      paragraph("Se não foi você que pediu, pode ignorar este e-mail com segurança.", { muted: true, size: 13 }),
  });

  const devMode = !isMailConfigured() && process.env.NODE_ENV !== "production";
  return res.json({ message: CODE_SENT_MESSAGE, ...(devMode ? { devCode: code } : {}) });
}

export function verifyCode(req, res) {
  const email = req.body.email.toLowerCase();
  if (!codeVerifyLimit(email) || !codeVerifyLimit(`ip:${req.ip}`)) {
    return res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos e tente de novo." });
  }
  if (!Customer.consumeLoginCode(email, req.body.code)) {
    return res.status(401).json({ message: "Código inválido ou expirado" });
  }
  const token = signToken({ sub: email, type: "customer" }, { expiresIn: "30d" });
  return res.json({ token, customer: Customer.getCustomerProfile(email) });
}

export function me(req, res) {
  const profile = Customer.getCustomerProfile(req.customer.email);
  if (!profile) return res.status(404).json({ message: "Cliente não encontrado" });
  res.json(profile);
}

export function bookings(req, res) {
  res.json(Customer.listCustomerBookings(req.customer.email));
}

export function messages(req, res) {
  const { email } = req.customer;
  if (Message.markRead(email, "customer")) {
    notifyAdmins({ type: "message:read", email, reader: "customer" });
    notifyCustomer(email, { type: "unread", count: 0 });
  }
  res.json(Message.listThread(email));
}

export async function sendMessage(req, res) {
  const { email } = req.customer;
  let bookingId = null;
  if (req.body.bookingId) {
    bookingId = parseBookingId(req.body.bookingId);
    if (!Customer.findCustomerBooking(email, bookingId)) return res.status(404).json({ message: "Reserva não encontrada" });
  }
  const message = Message.addMessage({ email, sender: "customer", body: req.body.body, bookingId });

  const profile = Customer.getCustomerProfile(email);
  const event = { type: "message:new", email, name: profile?.name || email, message };
  notifyAdmins(event);
  notifyAdmins({ type: "summary", unreadMessages: countUnreadForAdmin() });
  notifyCustomer(email, event);
  notifyTeam("newMessage", {
    subject: `${profile?.name || email}`,
    title: "Nova mensagem de cliente",
    icon: "💬",
    preheader: message.body.slice(0, 100),
    text: `${profile?.name || email} (${email}) escreveu:\n\n${message.body}`,
    body:
      paragraph(`<strong>${esc(profile?.name || email)}</strong> enviou uma mensagem${message.bookingId ? ` sobre a reserva <strong>${esc(message.bookingId)}</strong>` : ""}:`) +
      quote(message.body) +
      details([
        ["E-mail", esc(email)],
        ["Telefone", esc(profile?.phone || "")],
      ]),
    link: `/admin/mensagens?cliente=${encodeURIComponent(email)}`,
  });
  res.status(201).json(message);
}

export function reviews(req, res) {
  res.json(Review.listCustomerReviews(req.customer.email));
}

export function createReview(req, res) {
  const { email } = req.customer;
  const bookingId = parseBookingId(req.body.bookingId);
  const booking = Customer.findCustomerBooking(email, bookingId);
  if (!booking) return res.status(404).json({ message: "Reserva não encontrada" });
  if (booking.payment_status !== "paid") return res.status(400).json({ message: "Só é possível avaliar excursões com pagamento confirmado" });

  try {
    const review = Review.createReview({
      bookingId,
      excursionId: booking.excursion_id,
      email,
      name: req.body.displayName || booking.customer_name,
      city: req.body.city || null,
      rating: req.body.rating,
      comment: req.body.comment,
    });
    notifyAdmins({ type: "summary", pendingReviews: Review.countPendingReviews() });
    notifyTeam("newReview", {
      subject: `${review.rating}★ · ${review.excursionTitle}`,
      title: "Nova avaliação para aprovar",
      icon: "⭐",
      preheader: `${review.rating} estrelas para ${review.excursionTitle}`,
      text: `${review.customerName} deu ${review.rating} estrela(s) para ${review.excursionTitle}: "${review.comment}"`,
      body:
        badge("Aguardando aprovação", "warning") +
        paragraph(`<strong>${esc(review.customerName)}</strong> avaliou <strong>${esc(review.excursionTitle)}</strong>:`) +
        stars(review.rating) +
        quote(review.comment, { author: [review.customerName, review.customerCity].filter(Boolean).join(" · ") }) +
        paragraph("Ela só aparece no site depois que você publicar.", { muted: true, size: 13 }),
      link: "/admin/avaliacoes",
    });
    res.status(201).json(review);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) return res.status(409).json({ message: "Você já avaliou esta excursão" });
    throw err;
  }
}
