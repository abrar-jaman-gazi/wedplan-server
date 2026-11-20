
import type { Collection, Document } from "mongodb";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";

export const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface BookingDocument extends Document {
  _id?: ObjectId;
  customerId: ObjectId;
  vendorId: ObjectId;
  serviceId: ObjectId;
  serviceName: string;
  serviceCategory: string;
  servicePrice: number;
  customerName: string;
  customerEmail: string;
  vendorName: string;
  eventDate: string;
  eventLocation: string;
  message: string;
  status: BookingStatus;
  activeKey?: boolean;
  createdAt: Date;
  updatedAt: Date;
  respondedAt: Date | null;
  cancelledAt: Date | null;
}

export const getBookingsCollection =
  (): Collection<BookingDocument> => {
    return getDatabase().collection<BookingDocument>("bookings");
  };

export const ensureBookingIndexes = async (): Promise<void> => {
  const collection = getBookingsCollection();

  await collection.createIndex(
    { customerId: 1, createdAt: -1 },
    { name: "booking_customer_created" }
  );

  await collection.createIndex(
    { vendorId: 1, status: 1, createdAt: -1 },
    { name: "booking_vendor_status_created" }
  );

  await collection.createIndex(
    { serviceId: 1, eventDate: 1 },
    {
      unique: true,
      partialFilterExpression: { activeKey: true },
      name: "unique_active_service_event_date",
    }
  );
};
