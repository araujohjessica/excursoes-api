import { getDb } from "../db.js";

export function findUserByEmail(email) {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
}

/** Aceita e-mail ou nome de usuário. */
export function findUserByLogin(login) {
  const value = String(login).trim().toLowerCase();
  return getDb().prepare("SELECT * FROM users WHERE email = ? OR lower(username) = ?").get(value, value);
}

export function findUserById(id) {
  return getDb().prepare("SELECT id, name, email, username, role, password_changed_at, created_at FROM users WHERE id = ?").get(id);
}

export function findUserWithPassword(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function updatePassword(id, hash) {
  getDb().prepare("UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?").run(hash, id);
}
