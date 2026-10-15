// Cliente HTTP da API do Asaas (https://docs.asaas.com)

export class AsaasError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

function config() {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new AsaasError("ASAAS_API_KEY não configurada", 500);
  return { apiKey, baseUrl: process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3" };
}

async function request(method, path, body) {
  const { apiKey, baseUrl } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "api-excursao",
      access_token: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = data.errors || [];
    const message = errors.map((e) => e.description).join(" ") || `Erro Asaas (${res.status})`;
    throw new AsaasError(message, res.status, errors);
  }
  return data;
}

export const asaas = {
  findCustomerByCpf: (cpf) => request("GET", `/customers?cpfCnpj=${cpf}&limit=1`).then((r) => r.data?.[0] || null),
  createCustomer: (data) => request("POST", "/customers", data),
  updateCustomer: (id, data) => request("PUT", `/customers/${id}`, data),

  createPayment: (data) => request("POST", "/payments", data),
  getPayment: (id) => request("GET", `/payments/${id}`),
  deletePayment: (id) => request("DELETE", `/payments/${id}`),
  refundPayment: (id) => request("POST", `/payments/${id}/refund`, {}),
  receiveInCash: (id, data) => request("POST", `/payments/${id}/receiveInCash`, data),
  getPixQrCode: (id) => request("GET", `/payments/${id}/pixQrCode`),

  listInstallmentPayments: (id) => request("GET", `/installments/${id}/payments`).then((r) => r.data || []),
  deleteInstallment: (id) => request("DELETE", `/installments/${id}`),
  refundInstallment: (id) => request("POST", `/installments/${id}/refund`, {}),

  getFees: () => request("GET", "/myAccount/fees"),
  getBalance: () => request("GET", "/finance/balance"),

  listWebhooks: () => request("GET", "/webhooks").then((r) => r.data || []),
  createWebhook: (data) => request("POST", "/webhooks", data),
  updateWebhook: (id, data) => request("PUT", `/webhooks/${id}`, data),
};
