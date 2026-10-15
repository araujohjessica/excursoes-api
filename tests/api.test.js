import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Sobe a API real com um banco temporário e dados do seed
const PORT = 4011;
const BASE = `http://localhost:${PORT}/api`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "excursoes-api-"));
const env = {
  ...process.env,
  PORT: String(PORT),
  DATABASE_FILE: path.join(dir, "test.db"),
  UPLOADS_DIR: path.join(dir, "uploads"),
  JWT_SECRET: "segredo-de-teste",
  ADMIN_EMAIL: "admin@teste.com",
  ADMIN_PASSWORD: "senha-de-teste",
  ASAAS_WEBHOOK_TOKEN: "token-de-teste",
  ASAAS_API_KEY: "",
};
let server;

before(async () => {
  const seed = spawnSync("node", ["scripts/seed.js"], { env, encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);

  server = spawn("node", ["src/server.js"], { env, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${BASE}/excursions`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("A API não subiu a tempo");
});

after(() => {
  server?.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

const login = (email, password) =>
  fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

test("lista as excursões do seed", async () => {
  const res = await fetch(`${BASE}/excursions`);
  assert.equal(res.status, 200);
  const body = await res.text();
  for (const slug of ["festival-aurora-2027", "show-noite-de-estrelas", "carnaval-na-praia", "reveillon-na-serra"]) {
    assert.ok(body.includes(slug), `excursão ${slug} não encontrada`);
  }
});

test("busca uma excursão pelo slug", async () => {
  const res = await fetch(`${BASE}/excursions/slug/festival-aurora-2027`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes("Festival Aurora 2027"));
});

test("retorna 404 para excursão inexistente", async () => {
  const res = await fetch(`${BASE}/excursions/slug/nao-existe`);
  assert.equal(res.status, 404);
});

test("webhook do Asaas rejeita requisição sem token", async () => {
  const res = await fetch(`${BASE}/webhooks/asaas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
  });
  assert.equal(res.status, 401);
});

test("webhook do Asaas rejeita token incorreto", async () => {
  const res = await fetch(`${BASE}/webhooks/asaas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": "token-errado" },
    body: JSON.stringify({ event: "PAYMENT_RECEIVED" }),
  });
  assert.equal(res.status, 401);
});

test("rota de admin exige autenticação", async () => {
  const res = await fetch(`${BASE}/bookings`);
  assert.equal(res.status, 401);
});

test("login do admin falha com senha errada", async () => {
  const res = await login("admin@teste.com", "senha-errada");
  assert.ok(res.status >= 400 && res.status < 500, `status inesperado: ${res.status}`);
});

test("admin autenticado lista as reservas", async () => {
  const res = await login("admin@teste.com", "senha-de-teste");
  assert.equal(res.status, 200);
  const { token } = await res.json();
  assert.ok(token, "login não retornou token");

  const bookings = await fetch(`${BASE}/bookings`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(bookings.status, 200);
  assert.ok((await bookings.text()).includes("mariana@exemplo.com"));
});

test("reserva com dados inválidos é rejeitada", async () => {
  const res = await fetch(`${BASE}/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seats: 0 }),
  });
  assert.equal(res.status, 400);
});