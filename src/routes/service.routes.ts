
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

router.use(authenticate, requireRole("vendor"));

router.post("/", createService);
router.get("/mine", getMyServices);
router.patch("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
