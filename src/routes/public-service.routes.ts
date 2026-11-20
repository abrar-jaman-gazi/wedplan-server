
import { Router } from "express";

import {
  getPublicServiceById,
  getPublicServices,
} from "../controllers/public-service.controller.js";

const router = Router();

router.get("/", getPublicServices);
router.get("/:id", getPublicServiceById);

export default router;
