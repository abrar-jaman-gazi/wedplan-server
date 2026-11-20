
import {
  isServiceCategory,
  type CreateServiceInput,
  type UpdateServiceInput,
} from "../models/service.model.js";

export interface ServiceValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: Record<string, string>;
}

const EDITABLE_FIELDS = [
  "serviceName",
  "category",
  "description",
  "price",
  "location",
  "images",
] as const;

const isPlainObject = (
  value: unknown
): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
};

const validateServiceFields = (
  input: Record<string, unknown>,
  requireAll: boolean
): ServiceValidationResult<UpdateServiceInput> => {
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  const unknownFields = Object.keys(input).filter(
    (key) => !EDITABLE_FIELDS.includes(
      key as (typeof EDITABLE_FIELDS)[number]
    )
  );

  if (unknownFields.length > 0) {
    for (const field of unknownFields) {
      errors[field] = "This field cannot be submitted.";
    }
  }

  const hasField = (field: string): boolean => {
    return Object.prototype.hasOwnProperty.call(input, field);
  };

  if (requireAll || hasField("serviceName")) {
    const value = input.serviceName;

    if (typeof value !== "string") {
      errors.serviceName = "Service name is required.";
    } else {
      const normalized = value.trim();

      if (normalized.length < 3 || normalized.length > 100) {
        errors.serviceName =
          "Service name must contain 3 to 100 characters.";
      } else {
        data.serviceName = normalized;
      }
    }
  }

  if (requireAll || hasField("category")) {
    const value = input.category;

    if (!isServiceCategory(value)) {
      errors.category = "Select a valid service category.";
    } else {
      data.category = value;
    }
  }

  if (requireAll || hasField("description")) {
    const value = input.description;

    if (typeof value !== "string") {
      errors.description = "Description is required.";
    } else {
      const normalized = value.trim();

      if (normalized.length < 20 || normalized.length > 2000) {
        errors.description =
          "Description must contain 20 to 2000 characters.";
      } else {
        data.description = normalized;
      }
    }
  }

  if (requireAll || hasField("price")) {
    const value = input.price;

    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      errors.price = "Price must be a valid non-negative number.";
    } else {
      data.price = value;
    }
  }

  if (requireAll || hasField("location")) {
    const value = input.location;

    if (typeof value !== "string") {
      errors.location = "Location is required.";
    } else {
      const normalized = value.trim();

      if (normalized.length < 2 || normalized.length > 150) {
        errors.location =
          "Location must contain 2 to 150 characters.";
      } else {
        data.location = normalized;
      }
    }
  }

  if (requireAll || hasField("images")) {
    const value = input.images;

    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > 8
    ) {
      errors.images = "Provide between 1 and 8 image URLs.";
    } else {
      const validImages: string[] = [];

      value.forEach((image, index) => {
        if (typeof image !== "string" || image.length > 2048) {
          errors.images =
            `Image ${index + 1} must be a valid HTTP or HTTPS URL.`;
          return;
        }

        try {
          const parsedUrl = new URL(image.trim());

          if (
            parsedUrl.protocol !== "https:" &&
            parsedUrl.protocol !== "http:"
          ) {
            errors.images =
              `Image ${index + 1} must use HTTP or HTTPS.`;
            return;
          }

          validImages.push(parsedUrl.toString());
        } catch {
          errors.images =
            `Image ${index + 1} must be a valid URL.`;
        }
      });

      if (!errors.images && validImages.length === value.length) {
        data.images = validImages;
      }
    }
  }

  if (!requireAll && Object.keys(input).length === 0) {
    errors.body = "Provide at least one field to update.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    data: data as UpdateServiceInput,
    errors: {},
  };
};

export const validateCreateServiceInput = (
  input: unknown
): ServiceValidationResult<CreateServiceInput> => {
  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: {
        body: "Request body must be a valid JSON object.",
      },
    };
  }

  const result = validateServiceFields(input, true);

  return {
    ...result,
    data: result.data as CreateServiceInput | undefined,
  };
};

export const validateUpdateServiceInput = (
  input: unknown
): ServiceValidationResult<UpdateServiceInput> => {
  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: {
        body: "Request body must be a valid JSON object.",
      },
    };
  }

  return validateServiceFields(input, false);
};
