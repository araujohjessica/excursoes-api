import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import express from "express";
import { setupRealtime } from "./realtime/hub.js";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes.js";
import excursionRoutes from "./routes/excursionRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import adminCommsRoutes from "./routes/adminCommsRoutes.js";
import { publicReviews } from "./controllers/adminCommsController.js";
import { startPaymentSync } from "./jobs/paymentSync.js";
import { uploadsDir } from "./middleware/uploadMiddleware.js";
import multer from "multer";
import { initializeDatabase } from "./db.js";

const app = express();
// Atrás do Nginx: usa o IP real do visitante (limites de tentativas)
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
const port = process.env.PORT || 4001;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/excursions", excursionRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/admin", adminCommsRoutes);
app.get("/api/reviews", publicReviews);
app.use("/uploads", express.static(uploadsDir, { maxAge: "30d" }));

app.use((_req, res) => res.status(404).json({ message: "Rota não encontrada" }));
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Imagem maior que 8 MB" : err.message;
    return res.status(400).json({ message });
  }
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: "Erro interno do servidor" });
});

initializeDatabase();
startPaymentSync();
const server = createServer(app);
setupRealtime(server);
server.listen(port, () => console.log(`API Excursões rodando em http://localhost:${port} (WebSocket em /ws)`));
