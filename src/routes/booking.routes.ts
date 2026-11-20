
import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  cancelBooking,
  createBooking,
  getMyBookings,
  getVendorBookings,
  updateBookingStatus,
} from "../controllers/booking.controller.js";

const router = Router();

router.use(authenticate);

router.post(
  "/",
  requireRole("customer"),
  createBooking
);

router.get(
  "/mine",
  requireRole("customer"),
  getMyBookings
);

router.patch(
  "/:id/cancel",
  requireRole("customer"),
  cancelBooking
);

router.get(
  "/vendor",
  requireRole("vendor"),
  getVendorBookings
);

router.patch(
  "/:id/status",
  requireRole("vendor"),
  updateBookingStatus
);

export default router;
