
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";
import {
  getStripeClient,
  isStripeConfigured,
} from "../config/stripe.js";
import { subscriptionConfig } from "../config/subscription.js";
import { getTransactionsCollection } from "../models/transaction.model.js";

const getVendorId = (req: Request): ObjectId | null => {
  if (!req.auth?.userId || !ObjectId.isValid(req.auth.userId)) {
    return null;
  }

  return new ObjectId(req.auth.userId);
};

const getPaginationValue = (
  value: unknown,
  fallback: number,
  maximum: number
): number => {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
};

export const createCheckoutSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.auth?.userId || req.auth.role !== "vendor") {
      res.status(403).json({
        success: false,
        message: "Only authenticated vendors can subscribe",
      });
      return;
    }

    if (!isStripeConfigured()) {
      res.status(503).json({
        success: false,
        message: "Payment service is not configured yet",
      });
      return;
    }

    const vendorId = getVendorId(req);

    if (!vendorId) {
      res.status(401).json({
        success: false,
        message: "Invalid vendor account",
      });
      return;
    }

    const database = getDatabase();

    const vendor = await database.collection("users").findOne<{
      name?: string;
      email?: string;
      role?: string;
      isBlocked?: boolean;
      subscriptionPlan?: string;
      subscriptionExpiresAt?: Date | null;
      subscriptionPaymentStatus?: string;
      stripeSubscriptionId?: string | null;
    }>({
      _id: vendorId,
    });

    if (!vendor || vendor.role !== "vendor" || vendor.isBlocked) {
      res.status(403).json({
        success: false,
        message: "Vendor account is unavailable",
      });
      return;
    }

    const now = new Date();
    const expiry =
      vendor.subscriptionExpiresAt instanceof Date
        ? vendor.subscriptionExpiresAt
        : null;

    const paymentStatus = vendor.subscriptionPaymentStatus || "active";

    const hasActivePremium =
      vendor.subscriptionPlan === "premium" &&
      expiry !== null &&
      expiry > now &&
      !["past_due", "cancelled", "failed"].includes(paymentStatus);

    if (hasActivePremium) {
      res.status(409).json({
        success: false,
        message: "Your account already has an active Premium subscription",
      });
      return;
    }

    if (
      vendor.stripeSubscriptionId &&
      !["cancelled", "failed"].includes(paymentStatus)
    ) {
      res.status(409).json({
        success: false,
        message:
          "An existing Stripe subscription requires attention. Please contact support before creating another subscription.",
      });
      return;
    }

    if (!vendor.email) {
      res.status(400).json({
        success: false,
        message: "Vendor email address is required",
      });
      return;
    }

    const stripe = getStripeClient();
    const plan = subscriptionConfig.premium;
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: vendor.email,
      line_items: [
        {
          price_data: {
            currency: plan.currency,
            product_data: {
              name: plan.name,
              description: "WedPlan Premium monthly subscription",
            },
            unit_amount: Math.round(plan.amount * 100),
            recurring: {
              interval: plan.interval,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        vendorId: req.auth.userId,
        plan: "premium",
      },
      subscription_data: {
        metadata: {
          vendorId: req.auth.userId,
          plan: "premium",
        },
      },
      success_url: `${clientUrl}/vendor/dashboard?payment=success`,
      cancel_url: `${clientUrl}/vendor/dashboard?payment=cancelled`,
    });

    if (!session.url) {
      res.status(502).json({
        success: false,
        message: "Stripe did not return a Checkout URL",
      });
      return;
    }

    await getTransactionsCollection().insertOne({
      vendorId,
      plan: "premium",
      type: "initial",
      amount: plan.amount,
      currency: plan.currency.toUpperCase(),
      stripeSessionId: session.id,
      stripeSubscriptionId: null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      paidAt: null,
    });

    res.status(201).json({
      success: true,
      message: "Checkout session created successfully",
      data: {
        checkoutUrl: session.url,
        sessionId: session.id,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getVendorSubscription: RequestHandler = async (
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

    const vendor = await getDatabase()
      .collection("users")
      .findOne<{
        subscriptionPlan?: string;
        subscriptionExpiresAt?: Date | null;
        subscriptionPaymentStatus?: string;
        stripeSubscriptionId?: string | null;
        isBlocked?: boolean;
      }>(
        { _id: vendorId },
        {
          projection: {
            subscriptionPlan: 1,
            subscriptionExpiresAt: 1,
            subscriptionPaymentStatus: 1,
            stripeSubscriptionId: 1,
            isBlocked: 1,
          },
        }
      );

    if (!vendor || vendor.isBlocked) {
      res.status(403).json({
        success: false,
        message: "Vendor account is unavailable",
      });
      return;
    }

    const now = new Date();

    const storedPlan =
      vendor.subscriptionPlan === "premium" ? "premium" : "free";

    const expiresAt =
      vendor.subscriptionExpiresAt instanceof Date
        ? vendor.subscriptionExpiresAt
        : null;

    const paymentStatus =
      vendor.subscriptionPaymentStatus || "active";

    const isPremiumActive =
      storedPlan === "premium" &&
      expiresAt !== null &&
      expiresAt > now &&
      !["past_due", "cancelled", "failed"].includes(paymentStatus);

    let subscriptionStatus: string;

    if (paymentStatus === "past_due") {
      subscriptionStatus = "past_due";
    } else if (paymentStatus === "cancelled") {
      subscriptionStatus = "cancelled";
    } else if (storedPlan === "premium" && expiresAt && expiresAt <= now) {
      subscriptionStatus = "expired";
    } else if (isPremiumActive) {
      subscriptionStatus = "active";
    } else {
      subscriptionStatus = "free";
    }

    res.status(200).json({
      success: true,
      data: {
        plan: isPremiumActive ? "premium" : "free",
        storedPlan,
        status: subscriptionStatus,
        paymentStatus,
        isPremiumActive,
        expiresAt,
        premium: {
          name: subscriptionConfig.premium.name,
          amount: subscriptionConfig.premium.amount,
          currency: subscriptionConfig.premium.currency.toUpperCase(),
          interval: subscriptionConfig.premium.interval,
          features: subscriptionConfig.premium.features,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getVendorTransactions: RequestHandler = async (
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

    const page = getPaginationValue(req.query.page, 1, 1000000);
    const limit = getPaginationValue(req.query.limit, 10, 50);
    const skip = (page - 1) * limit;

    const collection = getTransactionsCollection();

    const [transactions, total] = await Promise.all([
      collection
        .find(
          { vendorId },
          {
            projection: {
              vendorId: 0,
              stripeSessionId: 0,
              stripeInvoiceId: 0,
              stripeSubscriptionId: 0,
            },
          }
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments({ vendorId }),
    ]);

    res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};
