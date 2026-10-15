import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Token de autenticação ausente" });

  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Token de autenticação inválido ou expirado" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Acesso restrito a administradores" });
  }
  return next();
}

export function requireCustomer(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Faça login para continuar" });

  try {
    const payload = verifyToken(token);
    if (payload.type !== "customer") throw new Error("tipo inválido");
    req.customer = { email: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ message: "Sessão expirada. Entre novamente" });
  }
}
