import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import { uploadImage } from "../middleware/uploadMiddleware.js";

const router = Router();

router.post("/", requireAuth, requireAdmin, uploadImage.array("images", 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ message: "Nenhuma imagem enviada" });
  res.status(201).json({ urls: req.files.map((f) => `/uploads/${f.filename}`) });
});

export default router;
