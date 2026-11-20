
import type { RequestHandler } from "express";
import {
  ObjectId,
  type ClientSession,
  type Filter,
} from "mongodb";

import { getDatabase, getMongoClient } from "../config/database.js";
import {
  getServicesCollection,
  isServiceApprovalStatus,
  isServiceAvailabilityStatus,
  isServiceCategory,
  type ServiceDocument,
} from "../models/service.model.js";

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getQueryString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }

  return undefined;
};

const parsePositiveInteger = (
  value: unknown,
  fallback: number,
  maximum: number
): number => {
  const parsed = Number(getQueryString(value));

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
};

const getServiceId = (req: Parameters<RequestHandler>[0]): ObjectId | null => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
};

const getActivationError = async (
  service: ServiceDocument,
  session: ClientSession
): Promise<string | null> => {
  const database = getDatabase();

  const vendor = await database.collection<{
    subscriptionPlan?: string;
    subscriptionExpiresAt?: Date | null;
  }>("users").findOne(
    { _id: service.vendorId },
    {
      session,
      projection: {
        subscriptionPlan: 1,
        subscriptionExpiresAt: 1,
      },
    }
  );

  if (!vendor) {
    return "The vendor account associated with this service was not found.";
  }

  const now = new Date();
  const expiry = vendor.subscriptionExpiresAt;

  const hasActivePremiumSubscription =
    vendor.subscriptionPlan === "premium" &&
    expiry instanceof Date &&
    expiry.getTime() > now.getTime();

  if (hasActivePremiumSubscription) {
    return null;
  }

  const activeServiceCount = await getServicesCollection().countDocuments(
    {
      vendorId: service.vendorId,
      approvalStatus: "approved",
      status: "active",
      _id: { $ne: service._id },
    },
    { session }
  );

  if (activeServiceCount >= 3) {
    return "This vendor has reached the maximum of 3 active services on the Free plan. The vendor must upgrade to Premium or deactivate another service.";
  }

  return null;
};

export const getAllAdminServices: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const collection = getServicesCollection();

    const search = getQueryString(req.query.search);
    const category = getQueryString(req.query.category);
    const approvalStatus = getQueryString(req.query.approvalStatus);
    const status = getQueryString(req.query.status);

    const page = parsePositiveInteger(req.query.page, 1, 1000000);
    const limit = parsePositiveInteger(req.query.limit, 10, 100);

    if (category && !isServiceCategory(category)) {
      res.status(400).json({
        success: false,
        message: "Invalid service category",
      });
      return;
    }

    if (approvalStatus && !isServiceApprovalStatus(approvalStatus)) {
      res.status(400).json({
        success: false,
        message: "Invalid approval status",
      });
      return;
    }

    if (status && !isServiceAvailabilityStatus(status)) {
      res.status(400).json({
        success: false,
        message: "Invalid service availability status",
      });
      return;
    }

    const filter: Filter<ServiceDocument> = {};

    if (search) {
      filter.serviceName = {
        $regex: escapeRegex(search),
        $options: "i",
      };
    }

    if (category) {
      filter.category = category as ServiceDocument["category"];
    }

    if (approvalStatus) {
      filter.approvalStatus =
        approvalStatus as ServiceDocument["approvalStatus"];
    }

    if (status) {
      filter.status = status as ServiceDocument["status"];
    }

    const [services, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: services,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminServiceById: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const serviceId = getServiceId(req);

    if (!serviceId) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const service = await getServicesCollection().findOne({
      _id: serviceId,
    });

    if (!service) {
      res.status(404).json({
        success: false,
        message: "Service not found",
      });
      return;
    }

    const vendor = await getDatabase().collection("users").findOne(
      { _id: service.vendorId },
      {
        projection: {
          name: 1,
          email: 1,
          businessName: 1,
          subscriptionPlan: 1,
          subscriptionExpiresAt: 1,
        },
      }
    );

    res.status(200).json({
      success: true,
      data: {
        service,
        vendor,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const approveAdminService: RequestHandler = async (
  req,
  res,
  next
) => {
  const serviceId = getServiceId(req);

  if (!serviceId) {
    res.status(400).json({
      success: false,
      message: "Invalid service ID",
    });
    return;
  }

  const session = getMongoClient().startSession();

  try {
    let result:
      | {
          status: number;
          message: string;
        }
      | undefined;

    await session.withTransaction(async () => {
      const collection = getServicesCollection();

      const service = await collection.findOne(
        { _id: serviceId },
        { session }
      );

      if (!service) {
        result = {
          status: 404,
          message: "Service not found",
        };
        return;
      }

      if (service.approvalStatus !== "pending") {
        result = {
          status: 409,
          message: "Only pending services can be approved",
        };
        return;
      }

      const activationError = await getActivationError(
        service,
        session
      );

      if (activationError) {
        result = {
          status: 409,
          message: activationError,
        };
        return;
      }

      const now = new Date();

      const updateResult = await collection.updateOne(
        {
          _id: serviceId,
          approvalStatus: "pending",
        },
        {
          $set: {
            approvalStatus: "approved",
            status: "active",
            rejectionReason: null,
            approvedAt: now,
            rejectedAt: null,
            updatedAt: now,
          },
        },
        { session }
      );

      if (updateResult.modifiedCount !== 1) {
        result = {
          status: 409,
          message: "Service approval could not be completed. Please retry.",
        };
        return;
      }

      result = {
        status: 200,
        message: "Service approved and activated successfully",
      };
    });

    if (!result) {
      res.status(500).json({
        success: false,
        message: "Unable to complete service approval",
      });
      return;
    }

    if (result.status !== 200) {
      res.status(result.status).json({
        success: false,
        message: result.message,
      });
      return;
    }

    const updatedService = await getServicesCollection().findOne({
      _id: serviceId,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: updatedService,
    });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
};

export const rejectAdminService: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const serviceId = getServiceId(req);

    if (!serviceId) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const rejectionReason =
      typeof req.body?.rejectionReason === "string"
        ? req.body.rejectionReason.trim()
        : "";

    if (
      rejectionReason.length < 5 ||
      rejectionReason.length > 500
    ) {
      res.status(400).json({
        success: false,
        message: "Rejection reason must contain 5 to 500 characters",
      });
      return;
    }

    const collection = getServicesCollection();

    const result = await collection.updateOne(
      {
        _id: serviceId,
        approvalStatus: "pending",
      },
      {
        $set: {
          approvalStatus: "rejected",
          status: "inactive",
          rejectionReason,
          rejectedAt: new Date(),
          approvedAt: null,
          updatedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      const existingService = await collection.findOne({
        _id: serviceId,
      });

      res.status(existingService ? 409 : 404).json({
        success: false,
        message: existingService
          ? "Only pending services can be rejected"
          : "Service not found",
      });
      return;
    }

    const updatedService = await collection.findOne({
      _id: serviceId,
    });

    res.status(200).json({
      success: true,
      message: "Service rejected successfully",
      data: updatedService,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminServiceStatus: RequestHandler = async (
  req,
  res,
  next
) => {
  const serviceId = getServiceId(req);

  if (!serviceId) {
    res.status(400).json({
      success: false,
      message: "Invalid service ID",
    });
    return;
  }

  const requestedStatus = req.body?.status;

  if (!isServiceAvailabilityStatus(requestedStatus)) {
    res.status(400).json({
      success: false,
      message: "Status must be either active or inactive",
    });
    return;
  }

  const collection = getServicesCollection();

  if (requestedStatus === "inactive") {
    try {
      const result = await collection.updateOne(
        {
          _id: serviceId,
          approvalStatus: "approved",
        },
        {
          $set: {
            status: "inactive",
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount === 0) {
        const existingService = await collection.findOne({
          _id: serviceId,
        });

        res.status(existingService ? 409 : 404).json({
          success: false,
          message: existingService
            ? "Only approved services can change availability"
            : "Service not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Service deactivated successfully",
        data: await collection.findOne({ _id: serviceId }),
      });
      return;
    } catch (error) {
      next(error);
      return;
    }
  }

  const session = getMongoClient().startSession();

  try {
    let result:
      | {
          status: number;
          message: string;
        }
      | undefined;

    await session.withTransaction(async () => {
      const service = await collection.findOne(
        { _id: serviceId },
        { session }
      );

      if (!service) {
        result = {
          status: 404,
          message: "Service not found",
        };
        return;
      }

      if (service.approvalStatus !== "approved") {
        result = {
          status: 409,
          message: "Only approved services can be activated",
        };
        return;
      }

      if (service.status === "active") {
        result = {
          status: 200,
          message: "Service is already active",
        };
        return;
      }

      const activationError = await getActivationError(
        service,
        session
      );

      if (activationError) {
        result = {
          status: 409,
          message: activationError,
        };
        return;
      }

      const updateResult = await collection.updateOne(
        {
          _id: serviceId,
          approvalStatus: "approved",
          status: "inactive",
        },
        {
          $set: {
            status: "active",
            updatedAt: new Date(),
          },
        },
        { session }
      );

      if (updateResult.modifiedCount !== 1) {
        result = {
          status: 409,
          message: "Service activation could not be completed. Please retry.",
        };
        return;
      }

      result = {
        status: 200,
        message: "Service activated successfully",
      };
    });

    if (!result) {
      res.status(500).json({
        success: false,
        message: "Unable to complete service activation",
      });
      return;
    }

    if (result.status !== 200) {
      res.status(result.status).json({
        success: false,
        message: result.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: await collection.findOne({ _id: serviceId }),
    });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
};

export const deleteAdminService: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const serviceId = getServiceId(req);

    if (!serviceId) {
      res.status(400).json({
        success: false,
        message: "Invalid service ID",
      });
      return;
    }

    const result = await getServicesCollection().deleteOne({
      _id: serviceId,
    });

    if (result.deletedCount === 0) {
      res.status(404).json({
        success: false,
        message: "Service not found",
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
