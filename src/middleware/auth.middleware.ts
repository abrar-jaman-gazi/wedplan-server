
import type { RequestHandler } from "express";
import { ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "../config/env.js";
import { getDatabase } from "../config/database.js";
import { isUserRole } from "../utils/roles.js";

const jwks = createRemoteJWKSet(
  new URL(`${env.BETTER_AUTH_URL}/api/auth/jwks`)
);

export const authenticate: RequestHandler = async (
  req,
  res,
  next
) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  const token = authorization.slice(7);

  let userId: string;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    });

    if (
      typeof payload.sub !== "string" ||
      !/^[0-9a-fA-F]{24}$/.test(payload.sub)
    ) {
      res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
      return;
    }

    userId = payload.sub;
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token",
    });
    return;
  }

  try {
    const user = await getDatabase()
      .collection("users")
      .findOne<{
        role?: string;
        isBlocked?: boolean;
      }>(
        { _id: new ObjectId(userId) },
        {
          projection: {
            role: 1,
            isBlocked: 1,
          },
        }
      );

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User account not found",
      });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({
        success: false,
        message: "Your account has been blocked",
      });
      return;
    }

    if (!isUserRole(user.role)) {
      res.status(403).json({
        success: false,
        message: "Invalid user permissions",
      });
      return;
    }

    req.auth = {
      userId,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};
