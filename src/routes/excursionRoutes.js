import { Router } from "express";
import Joi from "joi";
import * as ctrl from "../controllers/excursionController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const str = () => Joi.string().allow("");
const strList = () => Joi.array().items(Joi.string().allow(""));
const date = () => Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("", null);

const fields = {
  title: Joi.string().trim().min(3),
  description: str(),
  fullDescription: str(),
  category: Joi.string().valid("festival", "carnaval", "reveillon", "show", "esportes", "teatro"),
  eventName: str(),
  artists: strList(),
  image: str(),
  imagePosition: Joi.string().valid("top", "center", "bottom"),
  gallery: strList(),
  price: Joi.number().min(0),
  originalPrice: Joi.number().min(0).allow(null),
  duration: str(),
  departureCity: str(),
  eventCity: str(),
  eventVenue: str(),
  departureDate: date(),
  returnDate: date(),
  eventDate: date(),
  maxSpots: Joi.number().integer().min(1),
  hasTickets: Joi.boolean(),
  ticketType: str().allow(null),
  included: strList(),
  notIncluded: strList(),
  itinerary: Joi.array().items(Joi.object({ time: str(), description: str() })),
  meetingPoint: str(),
  rating: Joi.number().min(0).max(5),
  reviewCount: Joi.number().integer().min(0),
  featured: Joi.boolean(),
  active: Joi.boolean(),
};

const createSchema = Joi.object(fields).fork(["title", "category", "price", "maxSpots"], (s) => s.required());
const updateSchema = Joi.object(fields).min(1);

router.get("/", ctrl.listPublic);
router.get("/admin/all", requireAuth, requireAdmin, ctrl.listAll);
router.get("/slug/:slug", ctrl.getBySlug);
router.post("/", requireAuth, requireAdmin, validate(createSchema), ctrl.create);
router.put("/:id", requireAuth, requireAdmin, validate(updateSchema), ctrl.update);
router.delete("/:id", requireAuth, requireAdmin, ctrl.remove);

export default router;
