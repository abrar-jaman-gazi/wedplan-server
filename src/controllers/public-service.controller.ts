
import type { RequestHandler } from "express";
import type { Document } from "mongodb";

import { getServicesCollection } from "../models/service.model.js";

const getQueryString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const getPositiveInteger = (
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

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const getPublicServices: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    const page = getPositiveInteger(req.query.page, 1, 1000000);
    const limit = getPositiveInteger(req.query.limit, 12, 50);
    const skip = (page - 1) * limit;

    const search = getQueryString(req.query.search);
    const category = getQueryString(req.query.category);
    const location = getQueryString(req.query.location);
    const requestedSort = getQueryString(req.query.sort);

    const now = new Date();

    const pipeline: Document[] = [
      {
        $match: {
          status: "active",
          approvalStatus: "approved",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendor",
        },
      },
      {
        $unwind: "$vendor",
      },
      {
        $match: {
          "vendor.isBlocked": { $ne: true },
        },
      },
      {
        $addFields: {
          _premiumSubscriptionValid: {
            $and: [
              { $eq: ["$vendor.subscriptionPlan", "premium"] },
              {
                $gt: [
                  "$vendor.subscriptionExpiresAt",
                  now,
                ],
              },
              {
                $not: [
                  {
                    $in: [
                      {
                        $ifNull: [
                          "$vendor.subscriptionPaymentStatus",
                          "active",
                        ],
                      },
                      ["past_due", "cancelled", "failed"],
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $setWindowFields: {
          partitionBy: "$vendorId",
          sortBy: {
            updatedAt: -1,
          },
          output: {
            _vendorServiceRank: {
              $documentNumber: {},
            },
          },
        },
      },
      {
        $match: {
          $or: [
            { _premiumSubscriptionValid: true },
            { _vendorServiceRank: { $lte: 3 } },
          ],
        },
      },
    ];

    if (category) {
      pipeline.push({
        $match: {
          category,
        },
      });
    }

    if (location) {
      pipeline.push({
        $match: {
          location: {
            $regex: escapeRegex(location),
            $options: "i",
          },
        },
      });
    }

    if (search) {
      const searchRegex = {
        $regex: escapeRegex(search),
        $options: "i",
      };

      pipeline.push({
        $match: {
          $or: [
            { serviceName: searchRegex },
            { description: searchRegex },
            { category: searchRegex },
            { location: searchRegex },
            { "vendor.name": searchRegex },
            { "vendor.businessName": searchRegex },
          ],
        },
      });
    }

    let sortStage: Document;

    if (requestedSort === "price-asc") {
      sortStage = {
        $sort: {
          price: 1,
          updatedAt: -1,
          _id: -1,
        },
      };
    } else if (requestedSort === "price-desc") {
      sortStage = {
        $sort: {
          price: -1,
          updatedAt: -1,
          _id: -1,
        },
      };
    } else {
      sortStage = {
        $sort: {
          updatedAt: -1,
          createdAt: -1,
          _id: -1,
        },
      };
    }

    pipeline.push(
      sortStage,
      {
        $facet: {
          metadata: [
            {
              $count: "total",
            },
          ],
          data: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
            {
              $project: {
                _id: 1,
                vendorId: 1,
                serviceName: 1,
                category: 1,
                description: 1,
                price: 1,
                location: 1,
                images: 1,
                status: 1,
                approvalStatus: 1,
                createdAt: 1,
                updatedAt: 1,
                approvedAt: 1,
                vendor: {
                  _id: "$vendor._id",
                  name: "$vendor.name",
                  businessName: "$vendor.businessName",
                },
              },
            },
          ],
        },
      }
    );

    const [result] = await getServicesCollection()
      .aggregate<{
        metadata: { total: number }[];
        data: Document[];
      }>(pipeline)
      .toArray();

    const total = result?.metadata[0]?.total ?? 0;
    const services = result?.data ?? [];

    res.status(200).json({
      success: true,
      count: services.length,
      data: services,
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
