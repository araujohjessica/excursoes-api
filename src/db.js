import Database from "better-sqlite3";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const databaseFile = process.env.DATABASE_FILE || path.join(__dirname, "../data/database.db");

let db;

export function initializeDatabase() {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  db = new Database(databaseFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      password_changed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS excursions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      full_description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      event_name TEXT NOT NULL DEFAULT '',
      artists TEXT NOT NULL DEFAULT '[]',
      image TEXT NOT NULL DEFAULT '',
      gallery TEXT NOT NULL DEFAULT '[]',
      price REAL NOT NULL,
      original_price REAL,
      duration TEXT NOT NULL DEFAULT '',
      departure_city TEXT NOT NULL DEFAULT '',
      event_city TEXT NOT NULL DEFAULT '',
      event_venue TEXT NOT NULL DEFAULT '',
      departure_date TEXT,
      return_date TEXT,
      event_date TEXT,
      max_spots INTEGER NOT NULL,
      booked_spots INTEGER NOT NULL DEFAULT 0,
      has_tickets INTEGER NOT NULL DEFAULT 1,
      ticket_type TEXT,
      included TEXT NOT NULL DEFAULT '[]',
      not_included TEXT NOT NULL DEFAULT '[]',
      itinerary TEXT NOT NULL DEFAULT '[]',
      meeting_point TEXT NOT NULL DEFAULT '',
      rating REAL NOT NULL DEFAULT 5,
      review_count INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      excursion_id INTEGER NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_cpf TEXT NOT NULL,
      seats INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      ticket_code TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_excursion ON bookings(excursion_id);

    CREATE TABLE IF NOT EXISTS customer_login_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_login_codes_email ON customer_login_codes(email);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_email TEXT NOT NULL,
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      sender TEXT NOT NULL CHECK (sender IN ('customer', 'admin')),
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_messages_email ON messages(customer_email);

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      excursion_id INTEGER NOT NULL REFERENCES excursions(id) ON DELETE CASCADE,
      customer_email TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_city TEXT,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      featured INTEGER NOT NULL DEFAULT 0,
      moderated_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);

    CREATE TABLE IF NOT EXISTS excursion_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_city TEXT,
      event_date TEXT,
      departure_city TEXT,
      people INTEGER NOT NULL DEFAULT 1,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'planned', 'archived')),
      admin_notes TEXT,
      updated_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_requests_status ON excursion_requests(status);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_presence (
      email TEXT PRIMARY KEY,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      payment_id TEXT,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  addColumns("users", { password_changed_at: "TEXT", username: "TEXT" });
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");
  addColumns("excursions", { image_position: "TEXT NOT NULL DEFAULT 'center'" });
  addColumns("bookings", {
    public_token: "TEXT",
    installments: "INTEGER NOT NULL DEFAULT 1",
    due_date: "TEXT",
    paid_at: "TEXT",
    asaas_customer_id: "TEXT",
    asaas_payment_id: "TEXT",
    asaas_installment_id: "TEXT",
    asaas_status: "TEXT",
    invoice_url: "TEXT",
    bank_slip_url: "TEXT",
    pix_payload: "TEXT",
    pix_qr_image: "TEXT",
    last_sync_at: "TEXT",
    expires_at: "TEXT",
    net_value: "REAL",
  });
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_public_token ON bookings(public_token);
    CREATE INDEX IF NOT EXISTS idx_bookings_asaas_payment ON bookings(asaas_payment_id);
  `);
  // Reservas pendentes antigas, sem prazo: 24h a partir da criação
  db.exec(`UPDATE bookings SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+24 hours')
           WHERE expires_at IS NULL AND payment_status = 'pending'`);

  seedAdmin();
  return db;
}

// Migração simples: adiciona colunas novas sem perder dados existentes
function addColumns(table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

function seedAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL.toLowerCase());
  if (exists) return;

  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')").run(
    ADMIN_NAME || "Admin",
    ADMIN_EMAIL.toLowerCase(),
    hash,
  );
  console.log(`Admin criado: ${ADMIN_EMAIL}`);
}

export function getDb() {
  if (!db) throw new Error("Banco de dados não inicializado");
  return db;
}
