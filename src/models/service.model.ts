
import type { Collection, Document } from "mongodb";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";

export const SERVICE_CATEGORIES = [
  "Photography & Videography",
  "Wedding Venues",
  "Decoration & Florist",
  "Catering Services",
  "Makeup & Styling",
  "Wedding Fashion",
] as const;

export type ServiceCategory =
  (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type ServiceApprovalStatus =
  (typeof SERVICE_APPROVAL_STATUSES)[number];

export const SERVICE_AVAILABILITY_STATUSES = [
  "active",
  "inactive",
] as const;

export type ServiceAvailabilityStatus =
  (typeof SERVICE_AVAILABILITY_STATUSES)[number];

export interface ServiceDocument extends Document {
  _id?: ObjectId;
  vendorId: ObjectId;
  serviceName: string;
  category: ServiceCategory;
  description: string;
  price: number;
  location: string;
  images: string[];
  status: ServiceAvailabilityStatus;
  approvalStatus: ServiceApprovalStatus;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
}

export interface CreateServiceInput {
  serviceName: string;
  category: ServiceCategory;
  description: string;
  price: number;
  location: string;
  images: string[];
}

export type UpdateServiceInput = Partial<CreateServiceInput>;

export const getServicesCollection =
  (): Collection<ServiceDocument> => {
    return getDatabase().collection<ServiceDocument>("services");
  };

export const isServiceCategory = (
  value: unknown
): value is ServiceCategory => {
  return (
    typeof value === "string" &&
    SERVICE_CATEGORIES.includes(value as ServiceCategory)
  );
};

export const isServiceApprovalStatus = (
  value: unknown
): value is ServiceApprovalStatus => {
  return (
    typeof value === "string" &&
    SERVICE_APPROVAL_STATUSES.includes(
      value as ServiceApprovalStatus
    )
  );
};

export const isServiceAvailabilityStatus = (
  value: unknown
): value is ServiceAvailabilityStatus => {
  return (
    typeof value === "string" &&
    SERVICE_AVAILABILITY_STATUSES.includes(
      value as ServiceAvailabilityStatus
    )
  );
};
