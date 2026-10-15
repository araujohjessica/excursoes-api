import { Router } from "express";
import Joi from "joi";
import { login, me, changePassword } from "../controllers/authController.js";
import { createRateLimiter } from "../utils/rateLimiter.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const loginSchema = Joi.object({
  // "email" aceita e-mail ou nome de usuário
  email: Joi.string().trim().min(3).max(120).required(),
  password: Joi.string().required(),
});

const loginLimit = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

const passwordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .max(100)
    .pattern(/[A-Za-z]/)
    .pattern(/\d/)
    .required()
    .messages({ "string.min": "A nova senha precisa ter pelo menos 8 caracteres", "string.pattern.base": "A nova senha precisa ter letras e números" }),
});

router.post(
  "/login",
  (req, res, next) => (loginLimit(`ip:${req.ip}`) ? next() : res.status(429).json({ message: "Muitas tentativas. Aguarde alguns minutos." })),
  validate(loginSchema),
  login,
);
router.post("/change-password", requireAuth, validate(passwordSchema), changePassword);
router.get("/me", requireAuth, me);

export default router;
