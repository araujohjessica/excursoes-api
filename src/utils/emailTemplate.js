// Layout dos e-mails do site. Feito com tabelas e estilos inline para funcionar
// no Gmail, Outlook, Apple Mail e no celular.
import { getSiteSettings } from "../models/settingsModel.js";

const C = {
  orange: "#F97316",
  orangeDark: "#EA580C",
  dark: "#111111",
  text: "#1F2937",
  muted: "#6B7280",
  border: "#E5E7EB",
  bg: "#F3F4F6",
  soft: "#FFF7ED",
};
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

function site() {
  try {
    return getSiteSettings();
  } catch {
    return { brand: { name: "Excursões", tagline: "" }, contact: {}, social: {}, footer: {} };
  }
}

const frontendUrl = (path = "") => `${process.env.FRONTEND_URL || ""}${path}`;

// ── Blocos ───────────────────────────────────────────────────────────

export function paragraph(text, { muted = false, size = 15 } = {}) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${muted ? C.muted : C.text}">${text}</p>`;
}

export function button(label, href, { color = C.orange } = {}) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px">
    <tr><td style="border-radius:12px;background:${color}">
      <a href="${esc(href)}" target="_blank"
        style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">${esc(label)} &rarr;</a>
    </td></tr></table>`;
}

/** Código grande (ex.: código de acesso). */
export function codeBox(code) {
  const digits = String(code)
    .split("")
    .map((d) => `<td style="padding:0 4px"><div style="width:44px;height:56px;line-height:56px;text-align:center;background:#ffffff;border:2px solid ${C.orange};border-radius:12px;font-family:'SFMono-Regular',Consolas,monospace;font-size:28px;font-weight:800;color:${C.dark}">${esc(d)}</div></td>`)
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:8px auto 24px"><tr>${digits}</tr></table>`;
}

/** Tabela de detalhes: [[rótulo, valor], ...]. Valores já podem conter HTML seguro. */
export function details(rows) {
  const trs = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v], i) => `<tr>
        <td style="padding:12px 16px;font-family:${FONT};font-size:13px;color:${C.muted};border-top:${i ? `1px solid ${C.border}` : "0"};width:40%;vertical-align:top">${esc(k)}</td>
        <td style="padding:12px 16px;font-family:${FONT};font-size:14px;color:${C.text};font-weight:600;border-top:${i ? `1px solid ${C.border}` : "0"};vertical-align:top">${v}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;background:#FAFAFA;border:1px solid ${C.border};border-radius:12px;border-collapse:separate;overflow:hidden">${trs}</table>`;
}

/** Citação (mensagem do cliente, avaliação…). */
export function quote(text, { author } = {}) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px">
    <tr><td style="background:${C.soft};border-left:4px solid ${C.orange};border-radius:0 12px 12px 0;padding:16px 20px">
      <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text}">${nl2br(text)}</p>
      ${author ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:13px;color:${C.muted}">— ${esc(author)}</p>` : ""}
    </td></tr></table>`;
}

/** Faixa de destaque colorida (sucesso, alerta, info). */
export function badge(text, tone = "info") {
  const tones = {
    success: ["#ECFDF5", "#047857", "#A7F3D0"],
    warning: ["#FFFBEB", "#B45309", "#FDE68A"],
    danger: ["#FEF2F2", "#B91C1C", "#FECACA"],
    info: [C.soft, C.orangeDark, "#FED7AA"],
  }[tone];
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px"><tr>
    <td style="background:${tones[0]};border:1px solid ${tones[2]};border-radius:999px;padding:6px 14px;font-family:${FONT};font-size:12px;font-weight:700;color:${tones[1]};letter-spacing:.3px">${esc(text)}</td>
  </tr></table>`;
}

export function stars(rating) {
  return `<p style="margin:0 0 12px;font-size:22px;letter-spacing:2px;color:#F59E0B">${"★".repeat(rating)}<span style="color:#D1D5DB">${"★".repeat(5 - rating)}</span></p>`;
}

// ── Layout completo ──────────────────────────────────────────────────

/**
 * Monta o e-mail inteiro.
 * @param {object} o
 * @param {string} o.title       Título grande do cartão
 * @param {string} o.body        HTML do conteúdo (use os blocos acima)
 * @param {string} [o.preheader] Texto de prévia exibido na caixa de entrada
 * @param {string} [o.icon]      Emoji no topo do cartão
 * @param {"customer"|"team"} [o.audience] Rodapé para cliente ou para a equipe
 */
export function renderEmail({ title, body, preheader = "", icon = "", audience = "customer" }) {
  const s = site();
  const brand = s.brand?.name || "Excursões";
  const tagline = s.brand?.tagline || "";
  const initial = brand.charAt(0).toUpperCase();
  const home = frontendUrl("/");
  const contact = s.contact || {};
  const social = s.social || {};

  const socialLinks = [
    ["Instagram", social.instagram],
    ["Facebook", social.facebook],
    ["YouTube", social.youtube],
    ["TikTok", social.tiktok],
  ]
    .filter(([, url]) => url)
    .map(([name, url]) => `<a href="${esc(url)}" style="color:${C.orange};text-decoration:none;font-weight:600">${name}</a>`)
    .join(`<span style="color:#D1D5DB">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);

  const contactLine = [contact.whatsapp && `WhatsApp ${esc(contact.whatsapp)}`, contact.email && esc(contact.email)]
    .filter(Boolean)
    .join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  const footerNote =
    audience === "team"
      ? `Você recebe este aviso porque está cadastrado em Configurações → Notificações do painel.`
      : `Você recebeu este e-mail por causa de uma reserva ou contato no site ${esc(brand)}.`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bg}">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">

        <!-- Cabeçalho -->
        <tr><td style="background:${C.dark};border-radius:20px 20px 0 0;padding:22px 28px">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="width:40px;height:40px;background:${C.orange};border-radius:10px;text-align:center;vertical-align:middle;font-family:${FONT};font-size:20px;font-weight:900;color:#ffffff">${esc(initial)}</td>
            <td style="padding-left:12px;vertical-align:middle">
              <a href="${esc(home)}" style="text-decoration:none">
                <div style="font-family:${FONT};font-size:18px;font-weight:800;color:#ffffff;line-height:1.1">${esc(brand)}</div>
                ${tagline ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;color:${C.orange};letter-spacing:2px;text-transform:uppercase">${esc(tagline)}</div>` : ""}
              </a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="height:4px;background:linear-gradient(90deg,${C.orange},#FB923C,${C.orange});background-color:${C.orange};font-size:0;line-height:0">&nbsp;</td></tr>

        <!-- Cartão -->
        <tr><td style="background:#ffffff;padding:36px 32px 28px;border-radius:0 0 20px 20px">
          ${icon ? `<div style="font-size:40px;line-height:1;margin:0 0 16px">${icon}</div>` : ""}
          <h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:800;color:${C.dark}">${esc(title)}</h1>
          ${body}
        </td></tr>

        <!-- Rodapé -->
        <tr><td style="padding:24px 20px 8px;text-align:center">
          ${socialLinks ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:13px">${socialLinks}</p>` : ""}
          ${contactLine ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;color:${C.muted}">${contactLine}</p>` : ""}
          <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;color:#9CA3AF">${footerNote}</p>
          <p style="margin:0;font-family:${FONT};font-size:12px;color:#9CA3AF">© ${new Date().getFullYear()} ${esc(s.footer?.legalName || brand)} · <a href="${esc(home)}" style="color:#9CA3AF">${esc(home.replace(/^https?:\/\//, "").replace(/\/$/, "") || brand)}</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export { frontendUrl };
