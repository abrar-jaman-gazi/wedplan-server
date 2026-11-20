
import { Router } from "express";

import { createCheckoutSession } from "../controllers/stripe.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.use(authenticate, requireRole("vendor"));

router.post("/checkout", createCheckoutSession);

export default router;
