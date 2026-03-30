import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email()
});

export const profileSchema = z.object({
  fullName: z.string().min(2),
  preferredName: z.string().min(1),
  phone: z.string().min(8),
  mailingAddress: z.string().min(10),
  yearsOfExperience: z.coerce.number().int().min(0).max(60),
  certifications: z.string().optional(),
  languagePairIds: z.array(z.string().min(1)).min(1),
  privacyAccepted: z.boolean()
});

export const agreementSchema = z.object({
  signatureName: z.string().min(2),
  consentGiven: z.literal(true)
});

export const timesheetItemSchema = z.object({
  projectId: z.string().min(1),
  languagePairId: z.string().min(1),
  hours: z.coerce.number().positive().max(24),
  note: z.string().max(2000).optional().or(z.literal(""))
});

export const submitTimesheetSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  mode: z.enum(["draft", "submit"]).default("submit"),
  items: z.array(timesheetItemSchema).min(1)
});

export const reviewTimesheetSchema = z.object({
  timesheetId: z.string().min(1),
  action: z.enum(["approve", "reject", "reopen"]),
  comment: z.string().max(2000).optional()
});
