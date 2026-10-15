// Uso: npm run asaas:webhook -- https://seu-dominio-publico.com
import dotenv from "dotenv";
import { asaas } from "../src/services/asaasClient.js";

dotenv.config({ quiet: true });

const base = process.argv[2];
if (!base) {
  console.error("Informe a URL pública da API. Ex.: npm run asaas:webhook -- https://abc.ngrok-free.app");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/api/webhooks/asaas`;
const config = {
  name: "API Excursões",
  url,
  email: process.env.ADMIN_EMAIL,
  enabled: true,
  interrupted: false,
  apiVersion: 3,
  authToken: process.env.ASAAS_WEBHOOK_TOKEN,
  sendType: "SEQUENTIALLY",
  events: [
    "PAYMENT_CREATED",
    "PAYMENT_UPDATED",
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_OVERDUE",
    "PAYMENT_DELETED",
    "PAYMENT_RESTORED",
    "PAYMENT_REFUNDED",
    "PAYMENT_PARTIALLY_REFUNDED",
    "PAYMENT_REFUND_IN_PROGRESS",
    "PAYMENT_CHARGEBACK_REQUESTED",
    "PAYMENT_AWAITING_RISK_ANALYSIS",
    "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
    "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  ],
};

const existing = (await asaas.listWebhooks()).find((w) => w.name === config.name);
const result = existing ? await asaas.updateWebhook(existing.id, config) : await asaas.createWebhook(config);
console.log(`Webhook ${existing ? "atualizado" : "criado"}: ${result.url}`);
