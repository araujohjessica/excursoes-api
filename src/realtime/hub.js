import { WebSocketServer } from "ws";
import { verifyToken } from "../utils/jwt.js";
import { getDb } from "../db.js";

// Conexões abertas: admins recebem tudo; clientes só o que é do próprio e-mail
const admins = new Set();
const customers = new Map(); // email → Set<ws>

const HEARTBEAT_MS = 30_000;

function send(ws, event) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
}

export function notifyAdmins(event) {
  for (const ws of admins) send(ws, event);
}

export function notifyCustomer(email, event) {
  for (const ws of customers.get(email) || []) send(ws, event);
}

function notifyAllCustomers(event) {
  for (const set of customers.values()) for (const ws of set) send(ws, event);
}

export function isCustomerOnline(email) {
  return customers.has(email);
}

export function onlineCustomers() {
  return [...customers.keys()];
}

function saveLastSeen(email) {
  const at = new Date().toISOString();
  getDb()
    .prepare("INSERT INTO customer_presence (email, last_seen_at) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at")
    .run(email, at);
  return at;
}

const teamPresence = () => ({ type: "team:presence", online: admins.size > 0 });

function identify(token) {
  try {
    const payload = verifyToken(token);
    if (payload.type === "customer") return { kind: "customer", email: payload.sub };
    if (payload.role === "admin") return { kind: "admin", id: payload.sub };
  } catch {
    /* token inválido */
  }
  return null;
}

function register(ws, who) {
  if (who.kind === "admin") {
    const wasEmpty = admins.size === 0;
    admins.add(ws);
    send(ws, { type: "presence:list", online: onlineCustomers() });
    if (wasEmpty) notifyAllCustomers(teamPresence());
  } else {
    const first = !customers.has(who.email);
    if (first) customers.set(who.email, new Set());
    customers.get(who.email).add(ws);
    send(ws, teamPresence());
    if (first) notifyAdmins({ type: "presence", email: who.email, online: true });
  }
}

function unregister(ws, who) {
  if (ws.unregistered) return;
  ws.unregistered = true;
  if (who.kind === "admin") {
    admins.delete(ws);
    if (admins.size === 0) notifyAllCustomers(teamPresence());
  } else {
    const set = customers.get(who.email);
    set?.delete(ws);
    if (set && !set.size) {
      customers.delete(who.email);
      const lastSeenAt = saveLastSeen(who.email);
      notifyAdmins({ type: "presence", email: who.email, online: false, lastSeenAt });
    }
  }
}

// Mensagens que o próprio navegador pode mandar: só o aviso de "digitando"
function handleClientEvent(who, raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }
  if (event?.type !== "typing") return;
  if (who.kind === "customer") notifyAdmins({ type: "typing", email: who.email, from: "customer" });
  else if (typeof event.email === "string") notifyCustomer(event.email.toLowerCase(), { type: "typing", from: "admin" });
}

export function setupRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4 * 1024 });

  wss.on("connection", (ws, req) => {
    const token = new URL(req.url, "http://localhost").searchParams.get("token");
    const who = token && identify(token);
    if (!who) {
      ws.close(4401, "unauthorized");
      return;
    }

    ws.isAlive = true;
    send(ws, { type: "ready", kind: who.kind });
    register(ws, who);

    ws.on("pong", () => (ws.isAlive = true));
    ws.on("message", (raw) => handleClientEvent(who, raw.toString()));
    ws.on("close", () => unregister(ws, who));
    ws.on("error", () => unregister(ws, who));
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}
