
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";

import { getMongoClient } from "./database.js";
import { env } from "./env.js";

const additionalFields = {
  role: {
    type: "string" as const,
    required: true,
    defaultValue: "customer",
    input: true,
  },
  isBlocked: {
    type: "boolean" as const,
    required: true,
    defaultValue: false,
    input: false,
  },
  businessName: {
    type: "string" as const,
    required: false,
    input: true,
  },
  subscriptionPlan: {
    type: "string" as const,
    required: true,
    defaultValue: "free",
    input: false,
  },
  subscriptionExpiresAt: {
    type: "date" as const,
    required: false,
    input: false,
  },
  stripeSubscriptionId: {
    type: "string" as const,
    required: false,
    input: false,
  },
};

export const auth = betterAuth({
  appName: "WedPlan",

  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CLIENT_URL],

  database: mongodbAdapter(
    getMongoClient().db(env.MONGODB_DATABASE),
    {
      client: getMongoClient(),
    }
  ),

  user: {
    modelName: "users",
    additionalFields,
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const requestedRole = user.role;

          if (
            requestedRole !== "customer" &&
            requestedRole !== "vendor"
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "Only customer and vendor registration is allowed.",
            });
          }

          return {
            data: {
              ...user,
              role: requestedRole,
              isBlocked: false,
              subscriptionPlan: "free",
              subscriptionExpiresAt: null,
              stripeSubscriptionId: null,
            },
          };
        },
      },

      update: {
        before: async (user) => {
          if (
            user.role !== undefined ||
            user.stripeSubscriptionId !== undefined ||
            user.subscriptionPlan !== undefined ||
            user.subscriptionExpiresAt !== undefined ||
            user.isBlocked !== undefined
          ) {
            throw new APIError("FORBIDDEN", {
              message: "Protected account fields cannot be changed through profile updates.",
            });
          }

          return {
            data: user,
          };
        },
      },
    },
  },

  plugins: [jwt()],
});
