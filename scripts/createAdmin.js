// Cria (ou atualiza a senha de) um administrador que entra pelo nome de usuário, sem e-mail.
// Uso: node scripts/createAdmin.js <usuario> <senha> [nome]
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config({ quiet: true });
const { initializeDatabase, getDb } = await import("../src/db.js");

const [username, password, name = "Administrador"] = process.argv.slice(2);
if (!username || !password) {
  console.error("Uso: node scripts/createAdmin.js <usuario> <senha> [nome]");
  process.exit(1);
}

initializeDatabase();
const db = getDb();
const login = username.trim().toLowerCase();
const hash = bcrypt.hashSync(password, 10);

const existing = db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(login);
if (existing) {
  db.prepare("UPDATE users SET password = ?, role = 'admin' WHERE id = ?").run(hash, existing.id);
  console.log(`Senha do usuário "${login}" atualizada.`);
} else {
  // A tabela exige e-mail único: usa um identificador interno, que não recebe mensagens
  db.prepare("INSERT INTO users (name, email, username, password, role) VALUES (?, ?, ?, ?, 'admin')").run(
    name,
    `${login}@usuario.local`,
    login,
    hash,
  );
  console.log(`Usuário "${login}" criado.`);
}
