import * as Message from "../models/messageModel.js";
import * as Review from "../models/reviewModel.js";
import { customerExists } from "../models/customerModel.js";
import { countNewRequests } from "../models/requestModel.js";
import { sendMail } from "../utils/mailer.js";
import { paragraph, button, quote, frontendUrl } from "../utils/emailTemplate.js";
import { notifyAdmins, notifyCustomer, isCustomerOnline } from "../realtime/hub.js";

export function threads(req, res) {
  res.json(Message.listThreads().map((t) => ({ ...t, online: isCustomerOnline(t.email) })));
}

export function thread(req, res) {
  const email = req.params.email.toLowerCase();
  if (Message.markRead(email, "admin")) {
    notifyCustomer(email, { type: "message:read", email, reader: "admin" });
    notifyAdmins({ type: "summary", unreadMessages: Message.countUnreadForAdmin() });
  }
  res.json(Message.listThread(email));
}

export async function reply(req, res) {
  const email = req.params.email.toLowerCase();
  if (!customerExists(email)) return res.status(404).json({ message: "Cliente não encontrado" });
  const message = Message.addMessage({ email, sender: "admin", body: req.body.body });
  const event = { type: "message:new", email, message };
  notifyCustomer(email, event);
  notifyCustomer(email, { type: "unread", count: Message.countUnreadForCustomer(email) });
  notifyAdmins(event);

  const link = frontendUrl("/minha-conta?aba=mensagens");
  sendMail({
    to: email,
    subject: "Você recebeu uma resposta 💬",
    title: "Respondemos sua mensagem",
    icon: "💬",
    preheader: message.body.slice(0, 100),
    text: `${message.body}\n\nVeja a conversa em ${link}`,
    body:
      paragraph("Nossa equipe respondeu você:") +
      quote(message.body, { author: "Equipe" }) +
      button("Ver a conversa", link) +
      paragraph("Para responder, use a área <strong>Minha conta</strong> no site.", { muted: true, size: 13 }),
  });
  res.status(201).json(message);
}

export function summary(req, res) {
  res.json({
    unreadMessages: Message.countUnreadForAdmin(),
    pendingReviews: Review.countPendingReviews(),
    newRequests: countNewRequests(),
  });
}

export function listReviews(req, res) {
  res.json(Review.listReviewsForAdmin(req.query.status));
}

export function moderateReview(req, res) {
  const review = Review.moderateReview(Number(req.params.id), req.body);
  if (!review) return res.status(404).json({ message: "Avaliação não encontrada" });
  res.json(review);
}

export function deleteReview(req, res) {
  if (!Review.deleteReview(Number(req.params.id))) return res.status(404).json({ message: "Avaliação não encontrada" });
  res.status(204).end();
}

export function publicReviews(req, res) {
  res.json({ reviews: Review.listApprovedReviews(12), stats: Review.getPublicStats() });
}
