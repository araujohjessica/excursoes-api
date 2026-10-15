import { Router } from "express";
import Joi from "joi";
import * as Request from "../models/requestModel.js";
import { validate } from "../middleware/validate.js";
import { createRateLimiter } from "../utils/rateLimiter.js";
import { notifyTeam } from "../utils/mailer.js";
import { paragraph, details, quote, esc } from "../utils/emailTemplate.js";
import { notifyAdmins } from "../realtime/hub.js";

const router = Router();
const limit = createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 });

const schema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().custom((v, h) => (v.replace(/\D/g, "").length >= 10 ? v : h.error("any.invalid"))).required(),
  eventName: Joi.string().trim().min(2).max(120).required(),
  eventCity: Joi.string().trim().max(80).allow(""),
  eventDate: Joi.string().trim().max(40).allow(""),
  departureCity: Joi.string().trim().max(80).allow(""),
  people: Joi.number().integer().min(1).max(100).default(1),
  message: Joi.string().trim().max(1000).allow(""),
  website: Joi.string().allow(""), // honeypot anti-spam: humanos não preenchem
}).messages({ "any.invalid": "{{#label}} inválido" });

router.post("/", validate(schema), (req, res) => {
  if (req.body.website) return res.status(201).json({ ok: true }); // robô: finge sucesso
  if (!limit(`ip:${req.ip}`)) return res.status(429).json({ message: "Muitos pedidos seguidos. Tente mais tarde." });

  const request = Request.createRequest(req.body);
  notifyAdmins({ type: "request:new", request });
  notifyAdmins({ type: "summary", newRequests: Request.countNewRequests() });

  const r = request;
  notifyTeam("newRequest", {
    subject: `${r.eventName} (${r.people} pessoa${r.people > 1 ? "s" : ""})`,
    title: "Novo pedido de excursão",
    icon: "🚌",
    preheader: `${r.name} quer ir em ${r.eventName} com ${r.people} pessoa(s)`,
    text: `${r.name} (${r.email}, ${r.phone}) quer ir em ${r.eventName}. Pessoas: ${r.people}. Saída: ${r.departureCity || "-"}. ${r.message || ""}`,
    body:
      paragraph(`<strong>${esc(r.name)}</strong> quer ir em <strong>${esc(r.eventName)}</strong>.`) +
      details([
        ["Pessoas", r.people >= 30 ? "20+ (grupo grande)" : String(r.people)],
        ["Saindo de", esc(r.departureCity || "")],
        ["Cidade do evento", esc(r.eventCity || "")],
        ["Data", esc(r.eventDate || "")],
        ["E-mail", esc(r.email)],
        ["WhatsApp", esc(r.phone)],
      ]) +
      (r.message ? quote(r.message) : ""),
    link: "/admin/pedidos",
  });
  res.status(201).json({ ok: true });
});

export default router;
