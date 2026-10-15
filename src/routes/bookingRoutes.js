import { Router } from "express";
import Joi from "joi";
import * as ctrl from "../controllers/bookingController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { isValidCpf } from "../utils/cpf.js";
import { MAX_INSTALLMENTS } from "../models/bookingModel.js";

const router = Router();

const createSchema = Joi.object({
  excursionId: Joi.number().integer().required(),
  customerName: Joi.string().trim().min(2).required(),
  customerEmail: Joi.string().email().required(),
  customerPhone: Joi.string().custom((v, h) => (v.replace(/\D/g, "").length >= 10 ? v : h.error("any.invalid"))).required(),
  customerCpf: Joi.string().custom((v, h) => (isValidCpf(v) ? v : h.error("any.invalid"))).required(),
  seats: Joi.number().integer().min(1).max(20).required(),
  paymentMethod: Joi.string().valid("pix", "credit").required(),
  installments: Joi.number().integer().min(1).max(MAX_INSTALLMENTS).default(1),
}).messages({ "any.invalid": "{{#label}} inválido" });

const statusSchema = Joi.object({
  paymentStatus: Joi.string().valid("pending", "paid", "cancelled", "refunded").required(),
});

router.post("/", validate(createSchema), ctrl.create);
router.get("/public/:token", ctrl.getPublic);
router.get("/", requireAuth, requireAdmin, ctrl.list);
router.patch("/:id/status", requireAuth, requireAdmin, validate(statusSchema), ctrl.updateStatus);
router.post("/:id/sync", requireAuth, requireAdmin, ctrl.sync);

export default router;
