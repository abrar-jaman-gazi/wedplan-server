
import { Router, type RequestHandler } from "express";
import multer from "multer";

import { uploadImage } from "../controllers/upload.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
      return;
    }

    callback(null, true);
  },
});

const handleImageUpload: RequestHandler = (req, res, next) => {
  upload.single("image")(req, res, (error?: unknown) => {
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

      res.status(status).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Image size must not exceed 5 MB"
            : "Invalid image upload",
      });
      return;
    }

    if (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid image upload",
      });
      return;
    }

    next();
  });
};

router.post(
  "/image",
  authenticate,
  requireRole("customer", "vendor"),
  handleImageUpload,
  uploadImage
);

export default router;
