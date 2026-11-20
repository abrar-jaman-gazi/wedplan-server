
export const USER_ROLES = [
  "customer",
  "vendor",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const isUserRole = (role: unknown): role is UserRole => {
  return (
    typeof role === "string" &&
    USER_ROLES.includes(role as UserRole)
  );
};
