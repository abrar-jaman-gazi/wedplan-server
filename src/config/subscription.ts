
const premiumPrice = Number(
  process.env.PREMIUM_PRICE_AMOUNT || 999
);

const premiumCurrency = (
  process.env.PREMIUM_PRICE_CURRENCY || "bdt"
).toLowerCase();

const billingInterval =
  process.env.PREMIUM_BILLING_INTERVAL || "month";

if (!Number.isSafeInteger(premiumPrice) || premiumPrice <= 0) {
  throw new Error("PREMIUM_PRICE_AMOUNT must be a positive whole number");
}

if (!/^[a-z]{3}$/.test(premiumCurrency)) {
  throw new Error("PREMIUM_PRICE_CURRENCY must be a three-letter currency code");
}

if (billingInterval !== "month") {
  throw new Error("PREMIUM_BILLING_INTERVAL must be month");
}

export const subscriptionConfig = {
  premium: {
    name: "WedPlan Premium",
    amount: premiumPrice,
    currency: premiumCurrency,
    interval: "month" as const,
    features: [
      "Unlimited active wedding services",
      "Premium vendor badge",
      "Enhanced vendor visibility",
    ],
  },
};
