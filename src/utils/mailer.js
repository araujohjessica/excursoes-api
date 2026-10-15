import nodemailer from "nodemailer";
import { getNotificationSettings, NOTIFICATION_EVENTS } from "../models/settingsModel.js";
import { renderEmail, button, esc, frontendUrl } from "./emailTemplate.js";

// SMTP do painel (Configurações → Notificações) tem prioridade; senão usa o .env
function smtpConfig() {
  let panel = null;
  try {
    panel = getNotificationSettings().smtp;
  } catch {
    /* banco ainda não iniciado */
  }
  if (panel?.host && panel?.user) return panel;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.EMAIL_REMETENTE,
    };
  }
  return null;
}

let cached = { key: "", transporter: null };

function getTransporter(cfg) {
  const key = JSON.stringify(cfg);
  if (cached.key !== key) {
    const port = Number(cfg.port) || 587;
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: cfg.host,
        port,
        secure: port === 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 15000,
      }),
    };
  }
  return cached.transporter;
}

export function isMailConfigured() {
  return Boolean(smtpConfig());
}

/**
 * Envia e-mail com o layout do site; sem SMTP configurado apenas registra no log (não falha).
 * `body` é o HTML do conteúdo (blocos de emailTemplate.js). `throwOnError` para o teste do painel.
 */
export async function sendMail({ to, subject, title, body, text, preheader, icon, audience }, { throwOnError = false } = {}) {
  const cfg = smtpConfig();
  if (!cfg) {
    console.log(`[mail] (SMTP não configurado) para ${to}: ${subject}\n${text}`);
    if (throwOnError) throw new Error("Envio de e-mail (SMTP) não configurado");
    return false;
  }
  try {
    await getTransporter(cfg).sendMail({
      from: cfg.from || cfg.user,
      to,
      subject,
      text,
      html: renderEmail({ title: title || subject, body, preheader: preheader || text?.slice(0, 120), icon, audience }),
    });
    return true;
  } catch (err) {
    console.error(`[mail] falha ao enviar para ${to}:`, err.message);
    if (throwOnError) throw err;
    return false;
  }
}

/**
 * Alerta para a equipe, respeitando os destinatários e os tipos de aviso escolhidos em Configurações.
 * `link` é um caminho do site (ex.: /admin/pedidos) para o botão "Ver no site".
 */
export function notifyTeam(event, { subject, title, body, text, link, icon, preheader }) {
  let settings;
  try {
    settings = getNotificationSettings();
  } catch {
    return;
  }
  if (!settings.events[event] || !settings.recipients.length) return;
  const url = link ? frontendUrl(link) : "";
  sendMail({
    to: settings.recipients.join(", "),
    subject: `${icon ? `${icon} ` : ""}${NOTIFICATION_EVENTS[event]}: ${subject}`,
    title,
    icon,
    preheader,
    audience: "team",
    body: body + (url ? button("Ver no painel", url) : ""),
    text: url ? `${text}\n\nVer no painel: ${url}` : text,
  });
}

export { esc as escapeHtml };
