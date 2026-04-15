import { z } from "zod";

const rateTypeEnum = z.enum(["STANDARD", "SUNDAY", "OVERTIME", "PUBLIC_HOLIDAY"]);

const tfnField = z.string().regex(/^\d{9}$/, "TFN must be exactly 9 digits");
const bsbField = z.string().regex(/^\d{6}$/, "BSB must be exactly 6 digits");

const timePattern = /^\d{2}:\d{2}$/;
const timeField = z.string().regex(timePattern, "Use HH:mm format");

export const inviteSchema = z.object({
  email: z.string().email()
});

export const profileSchema = z.object({
  fullName: z.string().min(2),
  preferredName: z.string().min(1),
  phone: z.string().min(8),
  mailingAddress: z.string().min(10),
  city: z.string().min(1),
  tfn: tfnField,
  bsb: bsbField,
  yearsOfExperience: z.coerce.number().int().min(0).max(60),
  certifications: z.string().optional(),
  languagePairIds: z.array(z.string().min(1)).min(1),
  privacyAccepted: z.boolean()
});

export const agreementSchema = z.object({
  signatureName: z.string().min(2),
  consentGiven: z.literal(true)
});

export const timesheetEntrySchema = z.object({
  eventId: z.string().min(1),
  date: z.string().min(1),
  startTime: timeField,
  endTime: timeField,
  rateType: rateTypeEnum.default("STANDARD"),
  comment: z.string().max(2000).optional().or(z.literal(""))
});

export const reviewEntrySchema = z.object({
  entryId: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).optional()
});

export const editEntrySchema = z.object({
  entryId: z.string().min(1),
  eventId: z.string().min(1).optional(),
  date: z.string().optional(),
  startTime: timeField.optional(),
  endTime: timeField.optional(),
  rateType: rateTypeEnum.optional(),
  comment: z.string().max(2000).optional()
});

export const splitEntrySchema = z.object({
  entryId: z.string().min(1),
  splitTime: timeField,
  firstRateType: rateTypeEnum,
  secondRateType: rateTypeEnum
});

export const eventSchema = z.object({
  name: z.string().min(1).max(200),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  city: z.string().min(1).max(200)
});

export const rateSchema = z.object({
  rateType: rateTypeEnum,
  amount: z.coerce.number().positive().max(10000)
});

/** Shared optional fields for admin user create/update schemas. */
const userProfileFields = {
  preferredName: z.string().optional(),
  phone: z.string().optional(),
  mailingAddress: z.string().optional(),
  city: z.string().optional(),
  tfn: tfnField.optional(),
  bsb: bsbField.optional(),
  yearsOfExperience: z.coerce.number().int().min(0).max(60).optional(),
  certifications: z.string().optional(),
  languagePairIds: z.array(z.string().min(1)).optional()
};

export const userCreateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  ...userProfileFields
});

export const userUpdateSchema = z.object({
  fullName: z.string().min(2).optional(),
  ...userProfileFields
});
