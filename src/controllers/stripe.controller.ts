
import type { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";

import { getDatabase } from "../config/database.js";
import {
  getStripeClient,
  isStripeConfigured,
} from "../config/stripe.js";
import { subscriptionConfig } from "../config/subscription.js";
import { getTransactionsCollection } from "../models/transaction.model.js";

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

    const vendorId = new ObjectId(req.auth.userId);
    const database = getDatabase();

    const vendor = await database.collection("users").findOne<{
      name?: string;
      email?: string;
      role?: string;
      isBlocked?: boolean;
      subscriptionPlan?: string;
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

    if (vendor.subscriptionPlan === "premium") {
      res.status(409).json({
        success: false,
        message: "Your account already has a Premium subscription",
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
            unit_amount: plan.currency === "bdt"
  ? plan.amount
  : Math.round(plan.amount * 100),
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
      amount: plan.amount,
      currency: plan.currency.toUpperCase(),
      stripeSessionId: session.id,
      stripeSubscriptionId: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
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
