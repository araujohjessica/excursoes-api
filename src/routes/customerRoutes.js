import { Router } from "express";
import Joi from "joi";
import * as ctrl from "../controllers/customerController.js";
import { requireCustomer } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const email = Joi.string().email().required();

router.post("/auth/request-code", validate(Joi.object({ email })), ctrl.requestCode);
router.post(
  "/auth/verify",
  validate(Joi.object({ email, code: Joi.string().pattern(/^\d{6}$/).required() })),
  ctrl.verifyCode,
);

router.use(requireCustomer);
router.get("/me", ctrl.me);
router.get("/bookings", ctrl.bookings);
router.get("/messages", ctrl.messages);
router.post(
  "/messages",
  validate(Joi.object({ body: Joi.string().trim().min(1).max(2000).required(), bookingId: Joi.string().allow("", null) })),
  ctrl.sendMessage,
);
router.get("/reviews", ctrl.reviews);
router.post(
  "/reviews",
  validate(
    Joi.object({
      bookingId: Joi.string().required(),
      rating: Joi.number().integer().min(1).max(5).required(),
      comment: Joi.string().trim().min(10).max(1000).required(),
      displayName: Joi.string().trim().max(60).allow(""),
      city: Joi.string().trim().max(60).allow(""),
    }),
  ),
  ctrl.createReview,
);

export default router;
