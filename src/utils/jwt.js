import jwt from "jsonwebtoken";

const TOKEN_TTL = "12h";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não está definido no .env");
  return secret;
}

export function signToken(payload, { expiresIn = TOKEN_TTL } = {}) {
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}
