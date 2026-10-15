import { Router } from "express";
import Joi from "joi";
import * as ctrl from "../controllers/adminCommsController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { getFees, getSummary } from "../services/financeService.js";
import * as Request from "../models/requestModel.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/summary", ctrl.summary);
router.get("/messages", ctrl.threads);
router.get("/messages/:email", ctrl.thread);
router.post("/messages/:email", validate(Joi.object({ body: Joi.string().trim().min(1).max(2000).required() })), ctrl.reply);

router.get("/finance/fees", async (req, res) => {
  try {
    res.json(await getFees({ refresh: req.query.refresh === "1" }));
  } catch (err) {
    res.status(502).json({ message: `Não foi possível consultar as taxas no Asaas: ${err.message}` });
  }
});
router.get("/finance/summary", async (_req, res) => res.json(await getSummary()));

router.get("/requests", (req, res) => res.json({ requests: Request.listRequests(req.query.status), ranking: Request.demandRanking() }));
router.patch(
  "/requests/:id",
  validate(Joi.object({ status: Joi.string().valid("new", "contacted", "planned", "archived"), adminNotes: Joi.string().max(2000).allow("") }).min(1)),
  (req, res) => {
    const r = Request.updateRequest(Number(req.params.id), req.body);
    if (!r) return res.status(404).json({ message: "Pedido não encontrado" });
    res.json(r);
  },
);
router.delete("/requests/:id", (req, res) => {
  if (!Request.deleteRequest(Number(req.params.id))) return res.status(404).json({ message: "Pedido não encontrado" });
  res.status(204).end();
});

router.get("/reviews", ctrl.listReviews);
router.patch(
  "/reviews/:id",
  validate(Joi.object({ status: Joi.string().valid("pending", "approved", "rejected"), featured: Joi.boolean() }).min(1)),
  ctrl.moderateReview,
);
router.delete("/reviews/:id", ctrl.deleteReview);

export default router;
