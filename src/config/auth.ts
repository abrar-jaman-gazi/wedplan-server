
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import type { User } from "better-auth";
import type { GenericEndpointContext } from "@better-auth/core";
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

advanced: {
  defaultCookieAttributes: {
    sameSite: "none",
    secure: true,
    httpOnly: true,
  },
},

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
    minPasswordLength: 8,
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
        before: async (
          user: User & Record<string, unknown>,
          ctx: GenericEndpointContext | null
        ) => {
          let requestedRole = user.role;
          let requestedBusinessName = user.businessName;

          if (ctx?.path === "/callback/:id") {
            const oauthState = await getOAuthState<{
              role?: string;
              businessName?: string;
            }>();

            requestedRole = oauthState?.role ?? "customer";
            requestedBusinessName = oauthState?.businessName;
          }

          if (
            requestedRole !== "customer" &&
            requestedRole !== "vendor"
          ) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Only customer and vendor registration is allowed.",
            });
          }

          if (
            requestedRole === "vendor" &&
            (typeof requestedBusinessName !== "string" ||
              requestedBusinessName.trim().length < 2)
          ) {
            throw new APIError("BAD_REQUEST", {
              message:
                "A valid business name is required for vendor registration.",
            });
          }

          return {
            data: {
              ...user,
              role: requestedRole,
              businessName:
                requestedRole === "vendor" &&
                typeof requestedBusinessName === "string"
                  ? requestedBusinessName.trim()
                  : undefined,
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
              message:
                "Protected account fields cannot be changed through profile updates.",
            });
          }

          return {
            data: user,
          };
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }

      const password = ctx.body?.password;

      if (typeof password !== "string" || password.length < 8 || password.length > 128) {
        throw new APIError("BAD_REQUEST", {
          message: "Password must contain between 8 and 128 characters.",
        });
      }

      if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
        throw new APIError("BAD_REQUEST", {
          message: "Password must include at least one uppercase and one lowercase letter.",
        });
      }
    }),
  },

  plugins: [jwt()],
});
