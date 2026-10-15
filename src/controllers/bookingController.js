import * as Booking from "../models/bookingModel.js";
import * as Payment from "../services/paymentService.js";

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof Booking.BookingError) return res.status(err.status).json({ message: err.message });
      next(err);
    }
  };
}

export const create = handle(async (req, res) => {
  res.status(201).json(await Payment.checkout(req.body));
});

export const getPublic = handle(async (req, res) => {
  const booking = await Payment.getPublicStatus(req.params.token);
  if (!booking) return res.status(404).json({ message: "Reserva não encontrada" });
  res.json(booking);
});

export const list = handle(async (req, res) => {
  res.json(Booking.listBookings({ excursionId: req.query.excursionId }));
});

export const updateStatus = handle(async (req, res) => {
  res.json(await Payment.adminChangeStatus(Booking.parseBookingId(req.params.id), req.body.paymentStatus));
});

export const sync = handle(async (req, res) => {
  res.json(await Payment.adminSync(Booking.parseBookingId(req.params.id)));
});
