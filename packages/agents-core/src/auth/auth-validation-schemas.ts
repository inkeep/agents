import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import * as authSchema from './auth-schema';

export const UserSelectSchema = createSelectSchema(authSchema.user);
export const UserInsertSchema = createInsertSchema(authSchema.user);

export const SessionSelectSchema = createSelectSchema(authSchema.session);
export const SessionInsertSchema = createInsertSchema(authSchema.session);

export const AccountSelectSchema = createSelectSchema(authSchema.account);
export const AccountInsertSchema = createInsertSchema(authSchema.account);

export const OrganizationSelectSchema = createSelectSchema(authSchema.organization);
export const OrganizationInsertSchema = createInsertSchema(authSchema.organization);

export const MemberSelectSchema = createSelectSchema(authSchema.member);
export const MemberInsertSchema = createInsertSchema(authSchema.member);

export const InvitationSelectSchema = createSelectSchema(authSchema.invitation);
export const InvitationInsertSchema = createInsertSchema(authSchema.invitation);

export const VerificationSelectSchema = createSelectSchema(authSchema.verification);
export const VerificationInsertSchema = createInsertSchema(authSchema.verification);

export const UserOrganizationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  organizationId: z.string(),
  role: z.string(),
  createdAt: z
    .union([z.string(), z.date()])
    .transform((val) => (val instanceof Date ? val.toISOString() : val)),
  organizationName: z.string().nullable(),
  organizationSlug: z.string().nullable(),
});

export const UserOrganizationsResponseSchema = z.array(UserOrganizationSchema);

export const AddUserToOrganizationRequestSchema = z.object({
  organizationId: z.string(),
  role: z.string().default('member'),
});

export const AddUserToOrganizationResponseSchema = z.object({
  organizationId: z.string(),
  role: z.string(),
  createdAt: z.string(),
});

export type User = z.infer<typeof UserSelectSchema>;
export type UserInsert = z.infer<typeof UserInsertSchema>;

export type Session = z.infer<typeof SessionSelectSchema>;
export type SessionInsert = z.infer<typeof SessionInsertSchema>;

export type Account = z.infer<typeof AccountSelectSchema>;
export type AccountInsert = z.infer<typeof AccountInsertSchema>;

export type Organization = z.infer<typeof OrganizationSelectSchema>;
export type OrganizationInsert = z.infer<typeof OrganizationInsertSchema>;

export type Member = z.infer<typeof MemberSelectSchema>;
export type MemberInsert = z.infer<typeof MemberInsertSchema>;

export type Invitation = z.infer<typeof InvitationSelectSchema>;
export type InvitationInsert = z.infer<typeof InvitationInsertSchema>;

export type Verification = z.infer<typeof VerificationSelectSchema>;
export type VerificationInsert = z.infer<typeof VerificationInsertSchema>;

export type UserOrganization = z.infer<typeof UserOrganizationSchema>;
export type UserOrganizationsResponse = z.infer<typeof UserOrganizationsResponseSchema>;
export type AddUserToOrganizationRequest = z.infer<typeof AddUserToOrganizationRequestSchema>;
export type AddUserToOrganizationResponse = z.infer<typeof AddUserToOrganizationResponseSchema>;
