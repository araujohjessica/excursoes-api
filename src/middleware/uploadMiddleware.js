import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

export const uploadImage = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    const err = new Error("Formato inválido. Use JPG, PNG, WEBP ou GIF");
    err.status = 400;
    cb(err);
  },
});
