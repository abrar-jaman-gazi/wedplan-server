
import type { RequestHandler } from "express";
import { env } from "../config/env.js";

type ImgBBResponse = {
  success?: boolean;
  data?: {
    url?: string;
    display_url?: string;
  };
};

const isValidImage = (buffer: Buffer, mimetype: string) => {
  if (mimetype === "image/jpeg") {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimetype === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    );
  }

  if (mimetype === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimetype === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
};

export const uploadImage: RequestHandler = async (req, res) => {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      success: false,
      message: "Please select an image to upload",
    });
    return;
  }

  if (!isValidImage(file.buffer, file.mimetype)) {
    res.status(400).json({
      success: false,
      message: "Invalid image file",
    });
    return;
  }

  if (!env.IMGBB_API_KEY) {
    res.status(503).json({
      success: false,
      message: "Image upload service is not configured",
    });
    return;
  }

  try {
    const formData = new FormData();

    const imageBlob = new Blob(
      [Uint8Array.from(file.buffer)],
      { type: file.mimetype }
    );

    formData.append("image", imageBlob, file.originalname);

    const uploadUrl = new URL("https://api.imgbb.com/1/upload");
    uploadUrl.searchParams.set("key", env.IMGBB_API_KEY);

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(20000),
    });

    const result = (await response.json()) as ImgBBResponse;

    if (!response.ok || !result.success || !result.data?.url) {
      console.error("ImgBB upload failed:", response.status);

      res.status(502).json({
        success: false,
        message: "Image hosting service could not process the upload",
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      data: {
        url: result.data.url,
        displayUrl: result.data.display_url || result.data.url,
      },
    });
  } catch (error) {
    console.error("Image upload error:", error);

    res.status(502).json({
      success: false,
      message: "Image upload failed. Please try again",
    });
  }
};
