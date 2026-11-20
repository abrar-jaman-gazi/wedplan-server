
import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  approveAdminService,
  deleteAdminService,
  getAdminServiceById,
  getAllAdminServices,
  rejectAdminService,
  updateAdminServiceStatus,
} from "../controllers/admin-service.controller.js";

const router = Router();

router.use(authenticate, requireRole("admin"));

router.get("/", getAllAdminServices);
router.get("/:id", getAdminServiceById);
router.patch("/:id/approve", approveAdminService);
router.patch("/:id/reject", rejectAdminService);
router.patch("/:id/status", updateAdminServiceStatus);
router.delete("/:id", deleteAdminService);

export default router;
