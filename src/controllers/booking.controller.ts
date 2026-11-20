
import type { RequestHandler } from "express";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";
import { getBookingsCollection } from "../models/booking.model.js";
import { getServicesCollection } from "../models/service.model.js";

const getAuthenticatedId = (req: Parameters<RequestHandler>[0]) => {
  const userId = req.auth?.userId;

  return userId && ObjectId.isValid(userId)
    ? new ObjectId(userId)
    : null;
};

const getRouteId = (req: Parameters<RequestHandler>[0]) => {
  const value = req.params.id;
  const id = Array.isArray(value) ? value[0] : value;

  return typeof id === "string" && ObjectId.isValid(id)
    ? new ObjectId(id)
    : null;
};

const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
};

const isValidEventDate = (value: unknown): value is string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= new Date().toISOString().slice(0, 10)
  );
};

const getDatabaseUser = async (userId: ObjectId) => {
  return getDatabase().collection("users").findOne<{
    name?: string;
    email?: string;
    role?: string;
    isBlocked?: boolean;
  }>(
    { _id: userId },
    {
      projection: {
        name: 1,
        email: 1,
        role: 1,
        isBlocked: 1,
      },
    }
  );
};

export const createBooking: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const customerId = getAuthenticatedId(req);

    if (!customerId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!isPlainObject(req.body)) {
      res.status(400).json({
        success: false,
        message: "Request body must be a valid JSON object",
      });
      return;
    }

    const { serviceId, eventDate, eventLocation, message } = req.body;

    if (
      typeof serviceId !== "string" ||
      !ObjectId.isValid(serviceId)
    ) {
      res.status(400).json({
        success: false,
        message: "A valid service ID is required",
      });
      return;
    }

    if (!isValidEventDate(eventDate)) {
      res.status(400).json({
        success: false,
        message: "Event date must be a valid date that is today or later",
      });
      return;
    }

    if (
      typeof eventLocation !== "string" ||
      eventLocation.trim().length < 2 ||
      eventLocation.trim().length > 150
    ) {
      res.status(400).json({
        success: false,
        message: "Event location must contain 2 to 150 characters",
      });
      return;
    }

    if (
      message !== undefined &&
      (typeof message !== "string" || message.trim().length > 1000)
    ) {
      res.status(400).json({
        success: false,
        message: "Message must be no longer than 1000 characters",
      });
      return;
    }

    const service = await getServicesCollection().findOne({
      _id: new ObjectId(serviceId),
      status: "active",
      approvalStatus: "approved",
    });

    if (!service) {
      res.status(404).json({
        success: false,
        message: "This service is not available for booking",
      });
      return;
    }

    if (service.vendorId.equals(customerId)) {
      res.status(403).json({
        success: false,
        message: "You cannot book your own service",
      });
      return;
    }

    const [customer, vendor] = await Promise.all([
      getDatabaseUser(customerId),
      getDatabaseUser(service.vendorId),
    ]);

    if (!customer || customer.isBlocked) {
      res.status(403).json({
        success: false,
        message: "Your account is not available for booking",
      });
      return;
    }

    if (!vendor || vendor.isBlocked || vendor.role !== "vendor") {
      res.status(409).json({
        success: false,
        message: "This service provider is not currently available",
      });
      return;
    }

    const now = new Date();

    const booking = {
      customerId,
      vendorId: service.vendorId,
      serviceId: new ObjectId(serviceId),
      serviceName: service.serviceName,
      serviceCategory: service.category,
      servicePrice: service.price,
      customerName: customer.name || "Customer",
      customerEmail: customer.email || "",
      vendorName: vendor.name || "Vendor",
      eventDate,
      eventLocation: eventLocation.trim(),
      message: typeof message === "string" ? message.trim() : "",
      status: "pending" as const,
      activeKey: true,
      createdAt: now,
      updatedAt: now,
      respondedAt: null,
      cancelledAt: null,
    };

    try {
      const result = await getBookingsCollection().insertOne(booking);

      res.status(201).json({
        success: true,
        message: "Booking request submitted successfully",
        data: {
          _id: result.insertedId,
          ...booking,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({
          success: false,
          message:
            "An active booking already exists for this service and event date",
        });
        return;
      }

      throw error;
    }
  } catch (error) {
    next(error);
  }
};

export const getMyBookings: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const customerId = getAuthenticatedId(req);

    if (!customerId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const bookings = await getBookingsCollection()
      .find({ customerId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelBooking: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const customerId = getAuthenticatedId(req);
    const bookingId = getRouteId(req);

    if (!customerId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!bookingId) {
      res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
      return;
    }

    const result = await getBookingsCollection().updateOne(
      {
        _id: bookingId,
        customerId,
        status: "pending",
      },
      {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
          cancelledAt: new Date(),
        },
        $unset: {
          activeKey: "",
        },
      }
    );

    if (result.modifiedCount === 0) {
      const existing = await getBookingsCollection().findOne({
        _id: bookingId,
        customerId,
      });

      res.status(existing ? 409 : 404).json({
        success: false,
        message: existing
          ? "Only pending bookings can be cancelled"
          : "Booking not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getVendorBookings: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const vendorId = getAuthenticatedId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const bookings = await getBookingsCollection()
      .find({ vendorId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    next(error);
  }
};

export const updateBookingStatus: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const vendorId = getAuthenticatedId(req);
    const bookingId = getRouteId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!bookingId) {
      res.status(400).json({
        success: false,
        message: "Invalid booking ID",
      });
      return;
    }

    if (
      !isPlainObject(req.body) ||
      (req.body.status !== "accepted" &&
        req.body.status !== "rejected")
    ) {
      res.status(400).json({
        success: false,
        message: "Status must be accepted or rejected",
      });
      return;
    }

    const status = req.body.status;
    const now = new Date();

    const result = await getBookingsCollection().updateOne(
      {
        _id: bookingId,
        vendorId,
        status: "pending",
      },
      {
        $set: {
          status,
          updatedAt: now,
          respondedAt: now,
        },
        ...(status === "rejected"
          ? { $unset: { activeKey: "" } }
          : {}),
      }
    );

    if (result.modifiedCount === 0) {
      const existing = await getBookingsCollection().findOne({
        _id: bookingId,
        vendorId,
      });

      res.status(existing ? 409 : 404).json({
        success: false,
        message: existing
          ? "Only pending bookings can be accepted or rejected"
          : "Booking not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Booking ${status} successfully`,
    });
  } catch (error) {
    next(error);
  }
};
