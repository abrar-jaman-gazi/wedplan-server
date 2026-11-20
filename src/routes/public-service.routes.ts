import { Router } from "express";

import { getPublicServices } from "../controllers/public-service.controller.js";

const router = Router();

router.get("/", getPublicServices);

export default router;