// Popula o banco com dados fictícios para demonstração.
// Uso: npm run db:seed            (só roda com o banco vazio)
//      npm run db:seed -- --force (apaga os dados e recria)
import "dotenv/config";
import crypto from "crypto";
import { initializeDatabase } from "../src/db.js";

const db = initializeDatabase();
const force = process.argv.includes("--force");

const total = db.prepare("SELECT COUNT(*) AS n FROM excursions").get().n;
if (total > 0 && !force) {
  console.log(`O banco já tem ${total} excursões. Use "npm run db:seed -- --force" para recriar.`);
  process.exit(0);
}

const DAY = 24 * 60 * 60 * 1000;
const at = (days) => new Date(Date.now() + days * DAY).toISOString();
const json = (v) => JSON.stringify(v);
const token = () => crypto.randomBytes(16).toString("hex");
const ticket = () => "EXC-" + crypto.randomBytes(3).toString("hex").toUpperCase();

const excursions = [
  {
    title: "Festival Aurora 2027", slug: "festival-aurora-2027", category: "festival",
    event_name: "Festival Aurora", artists: ["Banda Horizonte", "DJ Lumen", "Coral Norte"],
    description: "Dois dias de festival com transporte ida e volta saindo de São Paulo.",
    price: 389.9, original_price: 449.9, duration: "2 dias",
    departure_city: "São Paulo, SP", event_city: "Curitiba, PR", event_venue: "Parque das Águas",
    days: 45, max_spots: 46, featured: 1,
    image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1200",
  },
  {
    title: "Show Noite de Estrelas", slug: "show-noite-de-estrelas", category: "show",
    event_name: "Noite de Estrelas", artists: ["Orquestra Vento Sul"],
    description: "Show em estádio com saída de Campinas e retorno na mesma noite.",
    price: 189.9, original_price: null, duration: "1 dia",
    departure_city: "Campinas, SP", event_city: "São Paulo, SP", event_venue: "Arena Central",
    days: 20, max_spots: 44, featured: 1,
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200",
  },
  {
    title: "Carnaval na Praia", slug: "carnaval-na-praia", category: "carnaval",
    event_name: "Carnaval do Litoral", artists: [],
    description: "Quatro dias de bloquinhos no litoral, com hospedagem inclusa.",
    price: 899.0, original_price: 990.0, duration: "4 dias",
    departure_city: "Belo Horizonte, MG", event_city: "Porto Seguro, BA", event_venue: "Circuito da Orla",
    days: 120, max_spots: 40, featured: 0,
    image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1200",
  },
  {
    title: "Réveillon na Serra", slug: "reveillon-na-serra", category: "reveillon",
    event_name: "Virada na Serra", artists: ["DJ Lumen"],
    description: "Virada do ano com festa, hospedagem e café da manhã.",
    price: 649.0, original_price: null, duration: "3 dias",
    departure_city: "Ribeirão Preto, SP", event_city: "Campos do Jordão, SP", event_venue: "Espaço Montanha",
    days: 75, max_spots: 30, featured: 0,
    image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200",
  },
];

const insertExcursion = db.prepare(`
  INSERT INTO excursions (title, slug, description, full_description, category, event_name, artists,
    image, gallery, price, original_price, duration, departure_city, event_city, event_venue,
    departure_date, return_date, event_date, max_spots, included, not_included, meeting_point, featured)
  VALUES (@title, @slug, @description, @full_description, @category, @event_name, @artists,
    @image, '[]', @price, @original_price, @duration, @departure_city, @event_city, @event_venue,
    @departure_date, @return_date, @event_date, @max_spots, @included, @not_included, @meeting_point, @featured)
`);

const insertBooking = db.prepare(`
  INSERT INTO bookings (excursion_id, customer_name, customer_email, customer_phone, customer_cpf,
    seats, total_amount, payment_method, payment_status, ticket_code, public_token, created_at, paid_at)
  VALUES (@excursion_id, @name, @email, @phone, '000.000.000-00',
    @seats, @total, @method, @status, @ticket, @token, @created_at, @paid_at)
`);

const seed = db.transaction(() => {
  if (force) {
    for (const t of ["reviews", "messages", "bookings", "excursion_requests", "excursions",
      "customer_presence", "customer_login_codes", "webhook_events"]) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
  }

  const ids = excursions.map((e) =>
    insertExcursion.run({
      ...e,
      artists: json(e.artists),
      full_description: `${e.description} Grupo organizado, guia acompanhando a viagem e suporte pelo WhatsApp.`,
      departure_date: at(e.days - 1),
      event_date: at(e.days),
      return_date: at(e.days + 1),
      included: json(["Transporte ida e volta", "Guia acompanhante", "Seguro viagem"]),
      not_included: json(["Alimentação", "Ingresso para áreas VIP"]),
      meeting_point: `Terminal rodoviário de ${e.departure_city}`,
    }).lastInsertRowid
  );

  const bookings = [
    { ex: 0, name: "Mariana Souza", email: "mariana@exemplo.com", phone: "(11) 91234-5678", seats: 2, method: "PIX", status: "paid" },
    { ex: 0, name: "Rafael Lima", email: "rafael@exemplo.com", phone: "(31) 98888-7777", seats: 1, method: "CREDIT_CARD", status: "paid" },
    { ex: 1, name: "Camila Rocha", email: "camila@exemplo.com", phone: "(13) 97777-6666", seats: 3, method: "PIX", status: "pending" },
    { ex: 2, name: "Bruno Alves", email: "bruno@exemplo.com", phone: "(19) 95555-4444", seats: 2, method: "CREDIT_CARD", status: "paid" },
    { ex: 3, name: "Juliana Prado", email: "juliana@exemplo.com", phone: "(16) 94444-3333", seats: 1, method: "PIX", status: "pending" },
  ].map((b, i) => {
    const created = b.status === "pending" ? at(-0.1) : at(-(10 - i));
    const id = insertBooking.run({
      excursion_id: ids[b.ex], name: b.name, email: b.email, phone: b.phone, seats: b.seats,
      total: +(excursions[b.ex].price * b.seats).toFixed(2), method: b.method, status: b.status,
      ticket: ticket(), token: token(), created_at: created,
      paid_at: b.status === "paid" ? created : null,
    }).lastInsertRowid;
    return { ...b, id };
  });

  db.prepare(`UPDATE excursions SET booked_spots =
    (SELECT COALESCE(SUM(seats), 0) FROM bookings WHERE bookings.excursion_id = excursions.id)`).run();

  const insertReview = db.prepare(`
    INSERT INTO reviews (booking_id, excursion_id, customer_email, customer_name, customer_city, rating, comment, status, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertReview.run(bookings[0].id, ids[0], bookings[0].email, bookings[0].name, "São Paulo, SP", 5,
    "Organização impecável, ônibus confortável e o guia ajudou em tudo.", "approved", 1);
  insertReview.run(bookings[1].id, ids[0], bookings[1].email, bookings[1].name, "Belo Horizonte, MG", 4,
    "Ótima experiência, só a volta atrasou um pouco.", "approved", 0);
  insertReview.run(bookings[3].id, ids[2], bookings[3].email, bookings[3].name, "Campinas, SP", 5,
    "Melhor Carnaval que já fui, recomendo demais!", "pending", 0);

  const insertMessage = db.prepare(
    "INSERT INTO messages (customer_email, booking_id, sender, body, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  insertMessage.run(bookings[0].email, bookings[0].id, "customer", "Oi! Posso levar uma mala grande?", at(-2), at(-2));
  insertMessage.run(bookings[0].email, bookings[0].id, "admin", "Pode sim, uma mala por pessoa no bagageiro.", at(-2), at(-2));
  insertMessage.run(bookings[2].email, bookings[2].id, "customer", "Qual o horário exato da saída?", null, at(-1));

  const insertRequest = db.prepare(`
    INSERT INTO excursion_requests (name, email, phone, event_name, event_city, event_date, departure_city, people, message, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertRequest.run("Pedro Martins", "pedro@exemplo.com", "(21) 93333-2222", "Festival de Inverno",
    "Garanhuns, PE", at(200), "Recife, PE", 12, "Grupo de amigos, queremos saída no sábado de manhã.", "new");
  insertRequest.run("Ana Costa", "ana@exemplo.com", "(41) 92222-1111", "Show Acústico",
    "Florianópolis, SC", at(90), "Curitiba, PR", 6, null, "contacted");
});

seed();
console.log("Dados de exemplo criados: 4 excursões, 5 reservas, 3 avaliações, 3 mensagens e 2 pedidos.");