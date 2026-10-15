import bcrypt from "bcrypt";
import { findUserByLogin, findUserById, findUserWithPassword, updatePassword } from "../models/userModel.js";
import { signToken } from "../utils/jwt.js";

export async function login(req, res) {
  // O campo "email" aceita e-mail ou nome de usuário
  const { email: login, password } = req.body;
  const user = findUserByLogin(login);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Usuário ou senha inválidos" });
  }

  const token = signToken({ sub: user.id, role: user.role });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role } });
}

export function me(req, res) {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
  return res.json(user);
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = findUserWithPassword(req.user.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return res.status(400).json({ message: "Senha atual incorreta" });
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    return res.status(400).json({ message: "A nova senha precisa ser diferente da atual" });
  }
  updatePassword(user.id, await bcrypt.hash(newPassword, 10));
  return res.json({ message: "Senha alterada com sucesso" });
}
