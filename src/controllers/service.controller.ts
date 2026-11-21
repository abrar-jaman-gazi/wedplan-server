
import type { RequestHandler, Request } from "express";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";
import { getServicesCollection } from "../models/service.model.js";
import {
  validateCreateServiceInput,
  validateUpdateServiceInput,
} from "../utils/service.validation.js";

const getVendorId = (req: Request): ObjectId | null => {
  if (!req.auth?.userId || !ObjectId.isValid(req.auth.userId)) {
    return null;
  }

  return new ObjectId(req.auth.userId);
};

const getServiceId = (req: Request): string | null => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    return null;
  }

  return id;
};

export const createService: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const validation = validateCreateServiceInput(req.body);

    if (!validation.valid || !validation.data) {
      res.status(400).json({
        success: false,
        message: "Service validation failed",
        errors: validation.errors,
      });
      return;
    }

    const database = getDatabase();
    const vendor = await database.collection<{
      role?: string;
      isBlocked?: boolean;
      subscriptionPlan?: string;
      subscriptionExpiresAt?: Date | null;
      subscriptionPaymentStatus?: string;
    }>("users").findOne(
      { _id: vendorId },
      {
        projection: {
          role: 1,
          isBlocked: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
          subscriptionPaymentStatus: 1,
        },
      }
    );

    if (!vendor || vendor.role !== "vendor" || vendor.isBlocked) {
      res.status(403).json({
        success: false,
        message: "An active vendor account is required to create services.",
      });
      return;
    }

    const expiry = vendor.subscriptionExpiresAt;
    const hasActivePremiumSubscription =
      vendor.subscriptionPlan === "premium" &&
      expiry instanceof Date &&
      expiry.getTime() > Date.now() &&
      vendor.subscriptionPaymentStatus !== "past_due" &&
      vendor.subscriptionPaymentStatus !== "cancelled" &&
      vendor.subscriptionPaymentStatus !== "failed";

    if (!hasActivePremiumSubscription) {
      const activeServiceCount = await getServicesCollection().countDocuments({
        vendorId,
        approvalStatus: "approved",
        status: "active",
      });

      if (activeServiceCount >= 3) {
        res.status(409).json({
          success: false,
          message: "Free vendors can have a maximum of 3 active services. Upgrade to Premium or deactivate an existing service.",
        });
        return;
      }
    }

    const now = new Date();

    const service = {
      vendorId,
      ...validation.data,
      status: "inactive" as const,
      approvalStatus: "pending" as const,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      rejectedAt: null,
    };

    const result = await getServicesCollection().insertOne(service);

    res.status(201).json({
      success: true,
      message:
        "Service submitted successfully and is awaiting admin approval",
      data: {
        _id: result.insertedId,
        ...service,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyServices: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const services = await getServicesCollection()
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  } catch (error) {
    next(error);
  }
};

export const updateService: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const id = getServiceId(req);

    if (!id) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const validation = validateUpdateServiceInput(req.body);

    if (!validation.valid || !validation.data) {
      res.status(400).json({
        success: false,
        message: "Service validation failed",
        errors: validation.errors,
      });
      return;
    }

    const collection = getServicesCollection();
    const serviceId = new ObjectId(id);

    const existingService = await collection.findOne({
      _id: serviceId,
      vendorId,
    });

    if (!existingService) {
      res.status(404).json({
        success: false,
        message: "Service not found or you do not own this service",
      });
      return;
    }

    const now = new Date();

    await collection.updateOne(
      {
        _id: serviceId,
        vendorId,
      },
      {
        $set: {
          ...validation.data,
          approvalStatus: "pending",
          status: "inactive",
          rejectionReason: null,
          approvedAt: null,
          rejectedAt: null,
          updatedAt: now,
        },
      }
    );

    const updatedService = await collection.findOne({
      _id: serviceId,
      vendorId,
    });

    res.status(200).json({
      success: true,
      message: "Service updated and resubmitted for admin approval",
      data: updatedService,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteService: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const id = getServiceId(req);

    if (!id) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const result = await getServicesCollection().deleteOne({
      _id: new ObjectId(id),
      vendorId,
    });

    if (result.deletedCount === 0) {
      res.status(404).json({
        success: false,
        message: "Service not found or you do not own this service",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
