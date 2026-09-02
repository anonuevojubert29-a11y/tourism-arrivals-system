import { z } from "zod";

const requiredText = (field, max) => z.string({ error: `${field} is required.` })
  .trim()
  .min(1, `${field} is required.`)
  .max(max, `${field} must contain at most ${max} characters.`);

const optionalText = (max) => z.string()
  .trim()
  .max(max, `Must contain at most ${max} characters.`)
  .optional();

const email = z.string({ error: "Email is required." })
  .trim()
  .max(255, "Email must contain at most 255 characters.")
  .email("Enter a valid email address.");

const password = z.string({ error: "Password is required." })
  .min(8, "Password must contain at least 8 characters.")
  .max(128, "Password must contain at most 128 characters.");

const id = z.string({ error: "ID is required." })
  .trim()
  .min(1, "ID is required.")
  .max(64, "ID is too long.")
  .regex(/^[A-Za-z0-9_-]+$/, "ID contains invalid characters.");

const visitType = z.enum(["overnight", "daytour"], {
  error: "Visit type must be overnight or daytour.",
});

const date = z.string({ error: "Date is required." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

const hasAtLeastOneField = (value) => Object.values(value).some((item) => item !== undefined);

const accommodationPatch = z.object({
  name: requiredText("Accommodation name", 255).optional(),
  municipality: optionalText(255),
  address: optionalText(500),
  contactPerson: optionalText(255),
  contactNumber: optionalText(50),
  permitNumber: optionalText(100),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  fullyBooked: z.boolean().optional(),
}).refine(hasAtLeastOneField, "Provide at least one accommodation field to update.");

const userAccountPatch = z.object({
  name: requiredText("Name", 255).optional(),
  email: email.optional(),
  currentPassword: z.string().max(128, "Current password is too long.").optional(),
  newPassword: password.optional(),
}).refine(hasAtLeastOneField, "Provide at least one account field to update.")
  .superRefine((value, context) => {
    if ((value.email !== undefined || value.newPassword !== undefined) && !value.currentPassword) {
      context.addIssue({
        code: "custom",
        path: ["currentPassword"],
        message: "Current password is required for email or password changes.",
      });
    }
  });

const visitorCount = z.number({ error: "Visitor count must be a number." })
  .int("Visitor count must be a whole number.")
  .min(0, "Visitor count cannot be negative.")
  .max(1_000_000, "Visitor count is too large.");

const foreignEntry = z.object({
  id: z.string().max(64).optional(),
  country: requiredText("Country", 100),
  male: visitorCount.default(0),
  female: visitorCount.default(0),
});

const arrivalBody = z.object({
  maleLocal: visitorCount.default(0),
  femaleLocal: visitorCount.default(0),
  maleDomestic: visitorCount.default(0),
  femaleDomestic: visitorCount.default(0),
  foreignEntries: z.array(foreignEntry).max(100, "At most 100 foreign-country entries are allowed.").default([]),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  accommodationId: id.optional(),
  visitType: visitType.optional(),
  date: date.optional(),
});

export const schemas = {
  idParams: z.object({ id }),
  notificationIdParams: z.object({ id }),
  arrivalParams: z.object({ accommodationId: id, visitType, date }),

  accommodationPatch,
  createAdmin: z.object({
    name: requiredText("Name", 255),
    username: requiredText("Username", 100),
    email,
    password,
  }),
  userAccountPatch,
  login: z.object({
    username: requiredText("Username", 100),
    password: z.string({ error: "Password is required." }).min(1, "Password is required.").max(128),
  }),
  register: z.object({
    accName: requiredText("Accommodation name", 255),
    municipality: optionalText(255),
    address: optionalText(500),
    contactPerson: optionalText(255),
    contactNumber: optionalText(50),
    permitNumber: optionalText(100),
    username: requiredText("Username", 100),
    email,
    password,
  }),
  token: z.object({ token: requiredText("Token", 256) }),
  email: z.object({ email }),
  resetPassword: z.object({ token: requiredText("Token", 256), newPassword: password }),
  auditLogQuery: z.object({
    action: optionalText(80),
    entityType: optionalText(50),
    actorUserId: id.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }),
  arrivalQuery: z.object({
    from: date.optional(),
    to: date.optional(),
    accommodationId: z.union([id, z.literal("all")]).optional(),
    visitType: z.union([visitType, z.literal("all")]).optional(),
  }).refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "The end date must be on or after the start date.",
  }),
  arrivalBody,
};

export function validate(requestSchemas) {
  return (req, res, next) => {
    for (const [source, schema] of Object.entries(requestSchemas)) {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        return res.status(400).json({
          error: "Invalid request data.",
          details: result.error.issues.map((issue) => ({
            field: [source, ...issue.path].map(String).join("."),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      req[source] = result.data;
    }
    next();
  };
}
