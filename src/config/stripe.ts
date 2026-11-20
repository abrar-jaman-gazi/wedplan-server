
import Stripe from "stripe";

import { env } from "./env.js";

let stripeClient: Stripe | null = null;

export const getStripeClient = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured. Payment processing is unavailable.");
  }

  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

export const isStripeConfigured = (): boolean => {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_WEBHOOK_SECRET
  );
};
