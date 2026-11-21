
import type { Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import { ObjectId } from "mongodb";

import { env } from "../config/env.js";
import { getStripeClient } from "../config/stripe.js";
import { getDatabase, getMongoClient } from "../config/database.js";
import { subscriptionConfig } from "../config/subscription.js";
import { getTransactionsCollection } from "../models/transaction.model.js";

type InvoiceSubscriptionReference = {
  parent?: {
    subscription_details?: {
      subscription?: string | { id: string } | null;
    } | null;
  } | null;
};

const getInvoiceSubscriptionId = (
  invoice: Stripe.Invoice
): string | null => {
  const invoiceData = invoice as unknown as InvoiceSubscriptionReference;
  const subscription = invoiceData.parent?.subscription_details?.subscription;

  if (typeof subscription === "string") {
    return subscription;
  }

  return subscription?.id ?? null;
};

const isValidVendorId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);

export const handleStripeWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let event: Stripe.Event;

  try {
    const signature = req.headers["stripe-signature"];

    if (
      typeof signature !== "string" ||
      !env.STRIPE_WEBHOOK_SECRET
    ) {
      res.status(400).json({
        success: false,
        message: "Stripe webhook signature or configuration is missing",
      });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({
        success: false,
        message: "Invalid webhook request body",
      });
      return;
    }

    event = getStripeClient().webhooks.constructEvent(
      req.body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    res.status(400).json({
      success: false,
      message: "Invalid Stripe webhook signature",
    });
    return;
  }

  try {
    const stripe = getStripeClient();

    let verifiedSubscription: Stripe.Subscription | null = null;
    let checkoutSession: Stripe.Checkout.Session | null = null;
    let invoice: Stripe.Invoice | null = null;

    if (event.type === "checkout.session.completed") {
      checkoutSession = event.data.object as Stripe.Checkout.Session;

      const subscriptionId =
        typeof checkoutSession.subscription === "string"
          ? checkoutSession.subscription
          : checkoutSession.subscription?.id;

      if (
        checkoutSession.mode === "subscription" &&
        checkoutSession.payment_status === "paid" &&
        subscriptionId
      ) {
        verifiedSubscription =
          await stripe.subscriptions.retrieve(subscriptionId);
      }
    }

    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed"
    ) {
      invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);

      if (subscriptionId) {
        verifiedSubscription =
          await stripe.subscriptions.retrieve(subscriptionId);
      }
    }

    const database = getDatabase();
    const mongoClient = getMongoClient();
    const transactions = getTransactionsCollection();
    const processedEvents = database.collection("processed_stripe_events");
    const mongoSession = mongoClient.startSession();

    try {
      await mongoSession.withTransaction(async () => {
        await processedEvents.insertOne(
          {
            eventId: event.id,
            eventType: event.type,
            processedAt: new Date(),
          },
          { session: mongoSession }
        );

        if (event.type === "checkout.session.completed") {
          if (!checkoutSession || !verifiedSubscription) {
            return;
          }

          const subscriptionId = verifiedSubscription.id;
          const vendorId = checkoutSession.metadata?.vendorId;
          const plan = subscriptionConfig.premium;
          const expectedAmount = Math.round(plan.amount * 100);

          if (
            checkoutSession.mode !== "subscription" ||
            checkoutSession.payment_status !== "paid" ||
            !isValidVendorId(vendorId) ||
            verifiedSubscription.status !== "active" ||
            verifiedSubscription.metadata.vendorId !== vendorId ||
            verifiedSubscription.metadata.plan !== "premium"
          ) {
            throw new Error(
              "Stripe Checkout subscription could not be verified"
            );
          }

          if (
            checkoutSession.currency?.toLowerCase() !== plan.currency ||
            checkoutSession.amount_total !== expectedAmount
          ) {
            throw new Error(
              "Stripe Checkout amount or currency does not match the configured Premium plan"
            );
          }

          const periodEnd =
            verifiedSubscription.items.data[0]?.current_period_end;

          if (!periodEnd) {
            throw new Error(
              "Stripe subscription billing period could not be verified"
            );
          }

          const vendorObjectId = new ObjectId(vendorId);

          const transaction = await transactions.findOne(
            {
              stripeSessionId: checkoutSession.id,
              vendorId: vendorObjectId,
              plan: "premium",
            },
            { session: mongoSession }
          );

          if (!transaction) {
            throw new Error(
              "Matching transaction not found for Stripe Checkout Session"
            );
          }

          if (transaction.status === "paid") {
            return;
          }

          if (transaction.status !== "pending") {
            return;
          }

          const activationResult = await database
            .collection("users")
            .updateOne(
              {
                _id: vendorObjectId,
                role: "vendor",
                isBlocked: { $ne: true },
              },
              {
                $set: {
                  subscriptionPlan: "premium",
                  subscriptionExpiresAt: new Date(periodEnd * 1000),
                  stripeSubscriptionId: subscriptionId,
                  subscriptionPaymentStatus: "active",
                },
              },
              { session: mongoSession }
            );

          if (activationResult.matchedCount !== 1) {
            throw new Error(
              "Vendor account could not be found or is unavailable"
            );
          }

          const transactionResult = await transactions.updateOne(
            {
              _id: transaction._id,
              status: "pending",
            },
            {
              $set: {
                status: "paid",
                stripeSubscriptionId: subscriptionId,
                paidAt: new Date(),
                updatedAt: new Date(),
              },
            },
            { session: mongoSession }
          );

          if (transactionResult.modifiedCount !== 1) {
            throw new Error(
              "Transaction could not be updated after payment verification"
            );
          }
        }

        if (event.type === "checkout.session.expired") {
          const expiredSession =
            event.data.object as Stripe.Checkout.Session;

          await transactions.updateOne(
            {
              stripeSessionId: expiredSession.id,
              status: "pending",
            },
            {
              $set: {
                status: "expired",
                updatedAt: new Date(),
              },
            },
            { session: mongoSession }
          );
        }

        if (
          event.type === "invoice.paid" &&
          invoice &&
          verifiedSubscription
        ) {
          const subscription = verifiedSubscription;
          const vendorId = subscription.metadata.vendorId;
          const periodEnd =
            subscription.items.data[0]?.current_period_end;

          if (
            invoice.billing_reason === "subscription_cycle" &&
            isValidVendorId(vendorId) &&
            subscription.metadata.plan === "premium" &&
            subscription.status === "active" &&
            periodEnd &&
            invoice.currency.toLowerCase() ===
              subscriptionConfig.premium.currency &&
            invoice.amount_paid === Math.round(subscriptionConfig.premium.amount * 100)
          ) {
            const vendorObjectId = new ObjectId(vendorId);
            const now = new Date();

            const vendor = await database.collection("users").findOne(
              {
                _id: vendorObjectId,
                role: "vendor",
                subscriptionPlan: "premium",
                stripeSubscriptionId: subscription.id,
                isBlocked: { $ne: true },
              },
              {
                session: mongoSession,
                projection: { _id: 1 },
              }
            );

            if (vendor) {
              await transactions.updateOne(
                {
                  stripeInvoiceId: invoice.id,
                },
                {
                  $set: {
                    vendorId: vendorObjectId,
                    plan: "premium",
                    type: "renewal",
                    amount: invoice.amount_paid / 100,
                    currency: invoice.currency.toUpperCase(),
                    stripeSubscriptionId: subscription.id,
                    status: "paid",
                    paidAt: new Date(invoice.status_transitions.paid_at
                      ? invoice.status_transitions.paid_at * 1000
                      : now.getTime()),
                    updatedAt: now,
                  },
                  $setOnInsert: {
                    stripeInvoiceId: invoice.id,
                    createdAt: now,
                  },
                },
                {
                  upsert: true,
                  session: mongoSession,
                }
              );

              await database.collection("users").updateOne(
                {
                  _id: vendorObjectId,
                  role: "vendor",
                  stripeSubscriptionId: subscription.id,
                },
                {
                  $set: {
                    subscriptionExpiresAt: new Date(periodEnd * 1000),
                    subscriptionPaymentStatus: "active",
                  },
                },
                { session: mongoSession }
              );
            }
          }
        }

        if (
          event.type === "invoice.payment_failed" &&
          invoice &&
          verifiedSubscription
        ) {
          const subscription = verifiedSubscription;
          const vendorId = subscription.metadata.vendorId;

          if (
            invoice.billing_reason === "subscription_cycle" &&
            isValidVendorId(vendorId) &&
            subscription.metadata.plan === "premium" &&
            invoice.currency.toLowerCase() ===
              subscriptionConfig.premium.currency
          ) {
            const vendorObjectId = new ObjectId(vendorId);
            const now = new Date();

            const vendor = await database.collection("users").findOne(
              {
                _id: vendorObjectId,
                role: "vendor",
                subscriptionPlan: "premium",
                stripeSubscriptionId: subscription.id,
              },
              {
                session: mongoSession,
                projection: { _id: 1 },
              }
            );

            if (vendor) {
              await transactions.updateOne(
                {
                  stripeInvoiceId: invoice.id,
                },
                {
                  $set: {
                    vendorId: vendorObjectId,
                    plan: "premium",
                    type: "renewal",
                    amount: invoice.amount_due / 100,
                    currency: invoice.currency.toUpperCase(),
                    stripeSubscriptionId: subscription.id,
                    status: "failed",
                    paidAt: null,
                    updatedAt: now,
                  },
                  $setOnInsert: {
                    stripeInvoiceId: invoice.id,
                    createdAt: now,
                  },
                },
                {
                  upsert: true,
                  session: mongoSession,
                }
              );

              await database.collection("users").updateOne(
                {
                  _id: vendorObjectId,
                  role: "vendor",
                  stripeSubscriptionId: subscription.id,
                },
                {
                  $set: {
                    subscriptionPaymentStatus: "past_due",
                  },
                },
                { session: mongoSession }
              );
            }
          }
        }

        if (event.type === "customer.subscription.deleted") {
          const subscription =
            event.data.object as Stripe.Subscription;

          const vendorId = subscription.metadata?.vendorId;

          if (isValidVendorId(vendorId)) {
            await database.collection("users").updateOne(
              {
                _id: new ObjectId(vendorId),
                role: "vendor",
                subscriptionPlan: "premium",
                stripeSubscriptionId: subscription.id,
              },
              {
                $set: {
                  subscriptionPlan: "free",
                  subscriptionExpiresAt: null,
                  subscriptionPaymentStatus: "cancelled",
                },
                $unset: {
                  stripeSubscriptionId: "",
                },
              },
              { session: mongoSession }
            );
          }
        }
      });

      res.status(200).json({
        received: true,
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(200).json({
          received: true,
          message: "Webhook event was already processed",
        });
        return;
      }

      throw error;
    } finally {
      await mongoSession.endSession();
    }
  } catch (error) {
    next(error);
  }
};
