
import { Router } from "express";

import { getAdminTransactions } from "../controllers/admin-transaction.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

router.use(authenticate, requireRole("admin"));

router.get("/", getAdminTransactions);

export default router;
