import { Router } from "express";
import Joi from "joi";
import { getSiteSettings, saveSiteSettings, getNotificationSettingsForAdmin, saveNotificationSettings, getNotificationSettings } from "../models/settingsModel.js";
import { sendMail } from "../utils/mailer.js";
import { paragraph, badge, button, frontendUrl } from "../utils/emailTemplate.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { notifyAdmins } from "../realtime/hub.js";

const router = Router();

const text = (max = 200) => Joi.string().trim().max(max).allow("");
// Link interno ("/excursoes", "/#como-funciona") ou externo (https://…, mailto:, tel:)
const url = () => Joi.string().trim().max(500).pattern(/^(\/|https?:\/\/|mailto:|tel:)/).allow("");
const link = Joi.object({ label: Joi.string().trim().min(1).max(60).required(), url: url().required() });

const schema = Joi.object({
  brand: Joi.object({ name: text(40).min(1).required(), tagline: text(30), description: text(300) }).required(),
  contact: Joi.object({ phone: text(30), hours: text(60), whatsapp: text(30), email: Joi.string().email().allow(""), address: text(200) }).required(),
  social: Joi.object({ instagram: url(), facebook: url(), youtube: url(), tiktok: url() }).required(),
  footer: Joi.object({
    eventsTitle: text(30),
    eventsMode: Joi.string().valid("auto", "manual").required(),
    eventsLinks: Joi.array().items(link).max(12),
    companyTitle: text(30),
    companyLinks: Joi.array().items(link).max(12),
    legalName: text(100),
    cnpj: text(20),
    showPaymentMethods: Joi.boolean(),
    showAdminLink: Joi.boolean(),
  }).required(),
  howItWorks: Joi.object({
    title: text(80).min(1).required(),
    subtitle: text(300),
    steps: Joi.array()
      .items(Joi.object({ icon: text(8), title: text(80).min(1).required(), description: text(500) }))
      .max(10)
      .required(),
    faq: Joi.array()
      .items(Joi.object({ question: text(200).min(1).required(), answer: text(1500).min(1).required() }))
      .max(30)
      .required(),
    ctaTitle: text(100),
    ctaText: text(200),
  }).required(),
  updatedAt: Joi.any(),
}).messages({ "string.pattern.base": "{{#label}} precisa começar com /, https://, mailto: ou tel:" });

router.get("/", (_req, res) => res.json(getSiteSettings()));

const notificationsSchema = Joi.object({
  recipients: Joi.array().items(Joi.string().email()).max(5).required(),
  events: Joi.object().pattern(Joi.string(), Joi.boolean()).required(),
  smtp: Joi.object({
    host: text(120),
    port: Joi.number().integer().min(1).max(65535).default(587),
    user: text(120),
    pass: Joi.string().max(200).allow(""),
    from: text(160),
    clearPassword: Joi.boolean(),
  }).required(),
}).options({ stripUnknown: true });

router.get("/notifications", requireAuth, requireAdmin, (_req, res) => res.json(getNotificationSettingsForAdmin()));
router.put("/notifications", requireAuth, requireAdmin, validate(notificationsSchema), (req, res) => res.json(saveNotificationSettings(req.body)));
router.post("/notifications/test", requireAuth, requireAdmin, async (_req, res) => {
  const { recipients } = getNotificationSettings();
  if (!recipients.length) return res.status(400).json({ message: "Cadastre pelo menos um e-mail para receber as notificações" });
  try {
    await sendMail(
      {
        to: recipients.join(", "),
        subject: "✅ Teste de notificação do site",
        title: "Está tudo funcionando!",
        icon: "✅",
        audience: "team",
        preheader: "As notificações por e-mail do site estão configuradas.",
        text: "Se você recebeu este e-mail, as notificações do site estão configuradas corretamente.",
        body:
          badge("E-mail configurado", "success") +
          paragraph("Se você recebeu este e-mail, o envio do site está funcionando. A partir de agora você recebe aqui os avisos que escolheu em <strong>Configurações → Notificações</strong>.") +
          paragraph("Os clientes também passam a receber o código de acesso, as respostas da equipe e a confirmação das reservas.", { muted: true, size: 14 }) +
          button("Abrir o painel", frontendUrl("/admin")),
      },
      { throwOnError: true },
    );
    res.json({ message: `E-mail de teste enviado para ${recipients.join(", ")}` });
  } catch (err) {
    res.status(400).json({ message: `Não foi possível enviar: ${err.message}` });
  }
});

router.put("/", requireAuth, requireAdmin, validate(schema), (req, res) => {
  const saved = saveSiteSettings(req.body);
  notifyAdmins({ type: "settings:updated" });
  res.json(saved);
});

export default router;
