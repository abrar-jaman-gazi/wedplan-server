
import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  createService,
  deleteService,
  getMyServices,
  updateService,
} from "../controllers/service.controller.js";

const router = Router();

router.post("/", authenticate, requireRole("vendor"), createService);
router.get("/mine", authenticate, requireRole("vendor"), getMyServices);
router.patch("/:id", authenticate, requireRole("vendor"), updateService);
router.delete("/:id", authenticate, requireRole("vendor"), deleteService);

export default router;
