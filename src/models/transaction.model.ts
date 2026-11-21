
import type { Collection, Document } from "mongodb";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";

export const TRANSACTION_PLANS = ["premium"] as const;

export type TransactionPlan =
  (typeof TRANSACTION_PLANS)[number];

export const TRANSACTION_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
] as const;

export type TransactionStatus =
  (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_TYPES = [
  "initial",
  "renewal",
] as const;

export type TransactionType =
  (typeof TRANSACTION_TYPES)[number];

export interface StoredPaymentCard {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface TransactionDocument extends Document {
  _id?: ObjectId;
  vendorId: ObjectId;
  plan: TransactionPlan;
  type?: TransactionType;
  amount: number;
  currency: string;
  stripeSessionId?: string | null;
  stripeInvoiceId?: string | null;
  stripeSubscriptionId: string | null;
  status: TransactionStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  paymentMethod?: StoredPaymentCard | null;
}

export const getTransactionsCollection =
  (): Collection<TransactionDocument> => {
    return getDatabase().collection<TransactionDocument>(
      "transactions"
    );
  };

export const ensureTransactionIndexes = async (): Promise<void> => {
  const collection = getTransactionsCollection();

  const existingIndexes = await collection.indexes();

  const existingSessionIndex = existingIndexes.find(
    (index) => index.name === "unique_stripe_session_id"
  );

  if (
    existingSessionIndex &&
    existingSessionIndex.sparse !== true
  ) {
    await collection.dropIndex("unique_stripe_session_id");
  }

  const existingInvoiceIndex = existingIndexes.find(
    (index) => index.name === "unique_stripe_invoice_id"
  );

  if (
    existingInvoiceIndex &&
    existingInvoiceIndex.sparse !== true
  ) {
    await collection.dropIndex("unique_stripe_invoice_id");
  }

  await Promise.all([
    collection.createIndex(
      { stripeSessionId: 1 },
      {
        unique: true,
        sparse: true,
        name: "unique_stripe_session_id",
      }
    ),
    collection.createIndex(
      { stripeInvoiceId: 1 },
      {
        unique: true,
        sparse: true,
        name: "unique_stripe_invoice_id",
      }
    ),
    collection.createIndex(
      { vendorId: 1, createdAt: -1 },
      { name: "vendor_transactions_by_date" }
    ),
    collection.createIndex(
      { status: 1, createdAt: -1 },
      { name: "transaction_status_by_date" }
    ),
  ]);
};
