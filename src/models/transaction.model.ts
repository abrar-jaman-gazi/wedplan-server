
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
  "refunded",
] as const;

export type TransactionStatus =
  (typeof TRANSACTION_STATUSES)[number];

export interface TransactionDocument extends Document {
  _id?: ObjectId;
  vendorId: ObjectId;
  plan: TransactionPlan;
  amount: number;
  currency: string;
  stripeSessionId: string;
  stripeSubscriptionId: string | null;
  status: TransactionStatus;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
}

export const getTransactionsCollection =
  (): Collection<TransactionDocument> => {
    return getDatabase().collection<TransactionDocument>(
      "transactions"
    );
  };

export const ensureTransactionIndexes = async (): Promise<void> => {
  const collection = getTransactionsCollection();

  await Promise.all([
    collection.createIndex(
      { stripeSessionId: 1 },
      {
        unique: true,
        name: "unique_stripe_session_id",
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
