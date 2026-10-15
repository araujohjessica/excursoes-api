import { listPendingAsaasBookings, listExpiredPendingBookings } from "../models/bookingModel.js";
import { syncBooking, expireBooking } from "../services/paymentService.js";

const SYNC_INTERVAL_MS = Number(process.env.PAYMENT_SYNC_INTERVAL_MS) || 5 * 60 * 1000;
const EXPIRE_INTERVAL_MS = 2 * 60 * 1000;

let expiring = false;

async function expirePending() {
  if (expiring) return;
  expiring = true;
  try {
    for (const row of listExpiredPendingBookings()) {
      try {
        await expireBooking(row);
      } catch (err) {
        console.warn(`[expirar] reserva ${row.id}: ${err.message}`);
      }
    }
  } finally {
    expiring = false;
  }
}

// Rede de segurança caso algum webhook se perca (ou não esteja configurado, como no ambiente local)
async function syncPending() {
  for (const row of listPendingAsaasBookings()) {
    try {
      await syncBooking(row);
    } catch (err) {
      console.warn(`[sync] reserva ${row.id}: ${err.message}`);
    }
  }
}

export function startPaymentSync() {
  setTimeout(() => expirePending().then(syncPending), 10_000);
  setInterval(expirePending, EXPIRE_INTERVAL_MS).unref();
  setInterval(syncPending, SYNC_INTERVAL_MS).unref();
}
