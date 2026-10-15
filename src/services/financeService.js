import { asaas } from "./asaasClient.js";
import { getDb } from "../db.js";

const CACHE_MS = 10 * 60 * 1000;
let cache = { at: 0, data: null };

const isValid = (date) => Boolean(date) && new Date(date.replace(" ", "T")) > new Date();

/** Tabela de taxas da conta Asaas, normalizada para o painel (cache de 10 min). */
export async function getFees({ refresh = false } = {}) {
  if (!refresh && cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;

  const f = await asaas.getFees();
  const pix = f.payment?.pix || {};
  const card = f.payment?.creditCard || {};
  const cardDiscount = Boolean(card.hasValidDiscount) && isValid(card.discountExpiration);
  const pixDiscount = pix.fixedFeeValueWithDiscount != null && isValid(pix.discountExpiration);

  const tier = (label, min, max, def, disc) => ({
    label,
    minInstallments: min,
    maxInstallments: max,
    percentage: cardDiscount && disc != null ? disc : def,
    defaultPercentage: def,
  });

  const data = {
    fetchedAt: new Date().toISOString(),
    environment: (process.env.ASAAS_BASE_URL || "").includes("sandbox") ? "sandbox" : "production",
    pix: {
      type: pix.type,
      fee: pixDiscount ? pix.fixedFeeValueWithDiscount : pix.fixedFeeValue,
      defaultFee: pix.fixedFeeValue,
      percentageFee: pix.percentageFee,
      minimumFee: pix.minimumFeeValue,
      maximumFee: pix.maximumFeeValue,
      discountUntil: pixDiscount ? pix.discountExpiration : null,
      monthlyFree: pix.monthlyCreditsWithoutFee ?? 0,
      usedThisMonth: pix.creditsReceivedOfCurrentMonth ?? 0,
      daysToReceive: 0,
    },
    creditCard: {
      operationFee: card.operationValue ?? 0,
      daysToReceive: card.daysToReceive,
      discountUntil: cardDiscount ? card.discountExpiration : null,
      tiers: [
        tier("À vista (1x)", 1, 1, card.oneInstallmentPercentage, card.discountOneInstallmentPercentage),
        tier("2 a 6 parcelas", 2, 6, card.upToSixInstallmentsPercentage, card.discountUpToSixInstallmentsPercentage),
        tier("7 a 12 parcelas", 7, 12, card.upToTwelveInstallmentsPercentage, card.discountUpToTwelveInstallmentsPercentage),
      ],
    },
    anticipation: {
      creditCardSingleMonthlyPercentage: f.anticipation?.creditCard?.detachedMonthlyFeeValue ?? null,
      creditCardInstallmentMonthlyPercentage: f.anticipation?.creditCard?.installmentMonthlyFeeValue ?? null,
    },
    transfer: {
      monthlyFree: f.transfer?.monthlyTransfersWithoutFee ?? 0,
      pixFee: f.transfer?.pix?.feeValue ?? null,
      pixCountsInFree: Boolean(f.transfer?.pix?.consideredInMonthlyTransfersWithoutFee),
      tedFee: f.transfer?.ted?.feeValue ?? null,
      tedCountsInFree: Boolean(f.transfer?.ted?.consideredInMonthlyTransfersWithoutFee),
    },
    notifications: {
      sms: f.notification?.smsFeeValue ?? null,
      whatsApp: f.notification?.whatsAppFeeValue ?? null,
      voice: f.notification?.phoneCallFeeValue ?? null,
      messaging: f.notification?.messagingFeeValue ?? null,
      postal: f.notification?.postalServiceFeeValue ?? null,
    },
    other: {
      invoice: f.invoice?.feeValue ?? null,
      dunning: f.paymentDunning?.feeValue ?? null,
    },
  };

  cache = { at: Date.now(), data };
  return data;
}

/** Taxa estimada para um pagamento, a partir da tabela atual. */
export function estimateFee(fees, method, value, installments = 1) {
  if (method === "pix") {
    if (fees.pix.type === "PERCENTAGE" && fees.pix.percentageFee != null) {
      let fee = (value * fees.pix.percentageFee) / 100;
      if (fees.pix.minimumFee != null) fee = Math.max(fee, fees.pix.minimumFee);
      if (fees.pix.maximumFee != null) fee = Math.min(fee, fees.pix.maximumFee);
      return round(fee);
    }
    return fees.pix.fee ?? 0;
  }
  if (method === "credit") {
    const t = fees.creditCard.tiers.find((x) => installments >= x.minInstallments && installments <= x.maxInstallments) || fees.creditCard.tiers.at(-1);
    return round((value * t.percentage) / 100 + fees.creditCard.operationFee);
  }
  return 0;
}

const round = (v) => Math.round(v * 100) / 100;

/** Resumo do que já foi recebido e quanto foi de taxa (real quando o Asaas informou, estimada quando não). */
export async function getSummary() {
  const fees = await getFees().catch(() => null);
  const rows = getDb()
    .prepare(
      `SELECT b.payment_method, b.installments, b.total_amount, b.net_value, b.seats, e.price
       FROM bookings b JOIN excursions e ON e.id = b.excursion_id
       WHERE b.payment_status = 'paid'`,
    )
    .all();

  const byMethod = {};
  let gross = 0, feesTotal = 0, estimated = 0, pixDiscountGiven = 0;

  for (const r of rows) {
    const m = (byMethod[r.payment_method] ||= { count: 0, gross: 0, fees: 0 });
    let fee;
    if (r.net_value != null) fee = r.total_amount - r.net_value;
    else {
      fee = fees ? estimateFee(fees, r.payment_method, r.total_amount, r.installments) : 0;
      estimated++;
    }
    m.count++;
    m.gross += r.total_amount;
    m.fees += fee;
    gross += r.total_amount;
    feesTotal += fee;
    if (r.payment_method === "pix") pixDiscountGiven += r.price * r.seats - r.total_amount;
  }

  let balance = null;
  try {
    balance = (await asaas.getBalance()).balance;
  } catch {
    /* saldo indisponível */
  }

  for (const k of Object.keys(byMethod)) {
    byMethod[k].gross = round(byMethod[k].gross);
    byMethod[k].fees = round(byMethod[k].fees);
  }

  return {
    paidBookings: rows.length,
    gross: round(gross),
    fees: round(feesTotal),
    net: round(gross - feesTotal),
    estimatedCount: estimated,
    pixDiscountGiven: round(pixDiscountGiven),
    byMethod,
    balance,
  };
}
