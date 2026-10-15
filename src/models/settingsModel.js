import { getDb } from "../db.js";

// Valores iniciais do site; o admin altera em Configurações
export const DEFAULT_SITE_SETTINGS = {
  brand: {
    name: "Excursões",
    tagline: "Eventos",
    description: "Excursões para festivais, shows, Carnaval e Réveillon, com transporte de ida e volta e grupo organizado.",
  },
  contact: {
    phone: "(11) 99999-0000",
    hours: "Seg–Sex, 8h–18h",
    whatsapp: "(11) 99999-0000",
    email: "contato@excursoes.com.br",
    address: "",
  },
  social: { instagram: "", facebook: "", youtube: "", tiktok: "" },
  footer: {
    eventsTitle: "Eventos",
    eventsMode: "auto", // "auto" = próximas excursões ativas; "manual" = lista abaixo
    eventsLinks: [],
    companyTitle: "Empresa",
    companyLinks: [
      { label: "Como Funciona", url: "/como-funciona" },
      { label: "Excursões", url: "/excursoes" },
      { label: "Minha conta", url: "/minha-conta" },
    ],
    legalName: "Excursões Eventos Brasil",
    cnpj: "",
    showPaymentMethods: true,
    showAdminLink: true,
  },
  howItWorks: {
    title: "Como funciona",
    subtitle: "Viajar para o seu evento favorito sem dor de cabeça: a gente cuida do transporte, você cuida da diversão.",
    steps: [
      { icon: "🔎", title: "Escolha sua excursão", description: "Veja as excursões disponíveis, confira datas, cidade de saída, roteiro, ponto de encontro e tudo o que está incluso em cada pacote." },
      { icon: "📝", title: "Faça sua reserva", description: "Informe seus dados e a quantidade de pessoas. Sua vaga fica guardada por 24 horas enquanto você finaliza o pagamento." },
      { icon: "💳", title: "Pague com segurança", description: "Pague com Pix (com desconto) ou cartão de crédito parcelado. O pagamento é processado pelo Asaas e a confirmação chega no seu e-mail." },
      { icon: "📲", title: "Acompanhe tudo online", description: "Na área “Minha conta” você vê suas reservas, horários, ponto de encontro e fala direto com a nossa equipe." },
      { icon: "🚌", title: "Embarque e curta", description: "No dia, é só chegar no ponto de encontro no horário combinado. A gente cuida da ida e da volta enquanto você aproveita o evento." },
    ],
    faq: [
      { question: "O ingresso do evento está incluso?", answer: "Depende do pacote. A maioria das excursões inclui apenas o transporte. Quando o ingresso estiver incluso, isso aparece claramente na página do pacote." },
      { question: "Quanto tempo tenho para pagar?", answer: "Depois de reservar, você tem 24 horas para concluir o pagamento. Se não for pago nesse prazo, a reserva é cancelada automaticamente e a vaga volta a ficar disponível." },
      { question: "Quais formas de pagamento são aceitas?", answer: "Pix, com 5% de desconto, e cartão de crédito, com opção de parcelamento. Os dados do cartão são digitados na página segura do Asaas." },
      { question: "Como acompanho minha reserva?", answer: "Entre em “Minha conta” com o e-mail usado na reserva. Enviamos um código de acesso, sem precisar de senha." },
      { question: "Posso cancelar minha reserva?", answer: "Fale com a gente pela área “Minha conta” ou pelo WhatsApp. As condições de cancelamento e reembolso variam conforme o pacote e a antecedência." },
      { question: "O evento que eu quero não está no site. E agora?", answer: "Use o botão “Pedir uma excursão” na página inicial. Quando juntar gente interessada, a gente organiza a excursão." },
    ],
    ctaTitle: "Pronto para a próxima viagem?",
    ctaText: "Veja as excursões disponíveis e garanta sua vaga.",
  },
};

const KEY = "site";

function merge(base, override) {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return override ?? base;
  const out = { ...base };
  for (const k of Object.keys(override || {})) {
    out[k] = k in base ? merge(base[k], override[k]) : override[k];
  }
  return out;
}

export function getSiteSettings() {
  const row = getDb().prepare("SELECT value, updated_at FROM settings WHERE key = ?").get(KEY);
  const stored = row ? JSON.parse(row.value) : {};
  return { ...merge(DEFAULT_SITE_SETTINGS, stored), updatedAt: row?.updated_at ?? null };
}

export function saveSiteSettings(settings) {
  const { updatedAt: _ignored, ...value } = settings;
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(KEY, JSON.stringify(value));
  return getSiteSettings();
}

// ── Notificações por e-mail (privado: nunca sai na rota pública) ──
export const NOTIFICATION_EVENTS = {
  newRequest: "Novo pedido de excursão",
  newMessage: "Nova mensagem de cliente",
  newBooking: "Nova reserva criada",
  bookingPaid: "Pagamento confirmado",
  bookingExpired: "Reserva cancelada por falta de pagamento",
  newReview: "Nova avaliação para aprovar",
};

// Função (e não constante) porque o .env é carregado depois dos imports
const defaultNotifications = () => ({
  recipients: process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL] : [],
  events: { newRequest: true, newMessage: true, newBooking: true, bookingPaid: true, bookingExpired: false, newReview: true },
  smtp: { host: "", port: 587, user: "", pass: "", from: "" },
});

const NOTIF_KEY = "notifications";

export function getNotificationSettings() {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(NOTIF_KEY);
  return merge(defaultNotifications(), row ? JSON.parse(row.value) : {});
}

/** Versão para o painel: a senha do SMTP nunca é devolvida, só se existe. */
export function getNotificationSettingsForAdmin() {
  const n = getNotificationSettings();
  const envSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  return {
    ...n,
    smtp: { ...n.smtp, pass: "", hasPassword: Boolean(n.smtp.pass) },
    smtpSource: n.smtp.host && n.smtp.user ? "painel" : envSmtp ? "env" : "none",
    eventLabels: NOTIFICATION_EVENTS,
  };
}

export function saveNotificationSettings(data) {
  const current = getNotificationSettings();
  const smtp = { ...current.smtp, ...data.smtp };
  // Campo de senha vazio = manter a atual; clearPassword = apagar
  if (!data.smtp?.pass) smtp.pass = data.smtp?.clearPassword ? "" : current.smtp.pass;
  delete smtp.clearPassword;
  delete smtp.hasPassword;
  const value = { recipients: data.recipients, events: { ...current.events, ...data.events }, smtp };
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(NOTIF_KEY, JSON.stringify(value));
  return getNotificationSettingsForAdmin();
}
