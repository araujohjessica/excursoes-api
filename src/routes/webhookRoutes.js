import { Router } from "express";
import crypto from "crypto";
import { handleWebhook } from "../services/paymentService.js";

const router = Router();

function validToken(received) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN || "";
  if (!expected || typeof received !== "string") return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Configure no Asaas: URL {API}/api/webhooks/asaas e token = ASAAS_WEBHOOK_TOKEN
router.post("/asaas", async (req, res) => {
  if (!validToken(req.headers["asaas-access-token"])) {
    return res.status(401).json({ message: "Token do webhook inválido" });
  }
  try {
    const result = await handleWebhook(req.body);
    res.json({ received: true, result });
  } catch (err) {
    // Responder erro faz o Asaas tentar de novo mais tarde
    console.error("[webhook] erro ao processar evento", req.body?.id, err);
    res.status(500).json({ received: false });
  }
});

export default router;
