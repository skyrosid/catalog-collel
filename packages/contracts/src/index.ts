import { z } from 'zod';

export const roleSchema = z.enum(['admin', 'user']);
export const idSchema = z.uuid();
export const loginSchema = z.strictObject({
  login: z.string().trim().toLowerCase().min(3).max(254),
  password: z.string().min(1).max(128),
});
export const newPasswordSchema = z.string().min(15).max(128);
export const setupInputSchema = loginSchema.extend({ password: newPasswordSchema });
export const setupStatusSchema = z.strictObject({ required: z.boolean() });
export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(128),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword);
export const membershipSchema = z.strictObject({
  collelId: idSchema,
  name: z.string(),
  role: roleSchema,
});
export const sessionSchema = z
  .strictObject({
    user: z.strictObject({
      id: idSchema,
      displayName: z.string(),
      platformRole: z.enum(['member', 'super_admin']),
      mustChangePassword: z.boolean(),
    }),
    memberships: z.array(membershipSchema),
  })
  .refine((value) => value.user.platformRole === 'super_admin' || value.memberships.length > 0);
export const tokenResponseSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  session: sessionSchema,
});
export const activationResponseSchema = tokenResponseSchema.extend({
  activationToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const collelSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
});
export const createCollelSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export const updateCollelSchema = createCollelSchema.extend({ active: z.boolean() });
export const updateCollelRequestSchema = z.strictObject({
  id: idSchema,
  input: updateCollelSchema,
});
export const collelDirectoryEntrySchema = updateCollelSchema.extend({
  id: idSchema,
  admin: z.strictObject({ login: z.string(), displayName: z.string() }),
  access: z.strictObject({ login: z.string() }).nullable(),
});
export const directoryQuerySchema = z.strictObject({
  search: z.string().trim().max(100).default(''),
  page: z.number().int().min(0).max(100_000).default(0),
});
export const collelDirectorySchema = z.strictObject({
  items: z.array(collelDirectoryEntrySchema),
  total: z.number().int().nonnegative(),
});
export const generatedCredentialsSchema = z.strictObject({
  login: z.string(),
  password: z.string(),
});
export const createdCollelSchema = z.strictObject({
  collel: collelDirectoryEntrySchema,
  credentials: z.strictObject({
    catalog: generatedCredentialsSchema,
    admin: generatedCredentialsSchema,
  }),
});
export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UNAVAILABLE',
  'INTERNAL_ERROR',
  'SETUP_COMPLETE',
  'CONFLICT',
  'PASSWORD_CHANGE_REQUIRED',
  'DEVICE_STORAGE_UNAVAILABLE',
]);
export const errorSchema = z.strictObject({
  code: errorCodeSchema,
  requestId: z.string().optional(),
});
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Role = z.infer<typeof roleSchema>;
export type Collel = z.infer<typeof collelSchema>;
export type SetupInput = z.infer<typeof setupInputSchema>;
export type SetupStatus = z.infer<typeof setupStatusSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateCollelInput = z.infer<typeof createCollelSchema>;
export type UpdateCollelInput = z.infer<typeof updateCollelSchema>;
export type CollelDirectoryEntry = z.infer<typeof collelDirectoryEntrySchema>;
export type CollelDirectory = z.infer<typeof collelDirectorySchema>;
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export type GeneratedCredentials = z.infer<typeof generatedCredentialsSchema>;
export type CreatedCollel = z.infer<typeof createdCollelSchema>;
export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };

// Only these capabilities cross the isolated Electron bridge. Tokens never do.
export interface DesktopApi {
  login(input: LoginInput): Promise<Result<Session>>;
  activate(input: LoginInput): Promise<Result<Session>>;
  deactivate(): Promise<Result<null>>;
  logout(): Promise<Result<null>>;
  session(): Promise<Result<Session | null>>;
  collel(id: string): Promise<Result<Collel>>;
  setupStatus(): Promise<Result<SetupStatus>>;
  setup(input: SetupInput): Promise<Result<Session>>;
  platformLogin(input: LoginInput): Promise<Result<Session>>;
  changePassword(input: ChangePasswordInput): Promise<Result<Session>>;
  listCollels(query: DirectoryQuery): Promise<Result<CollelDirectory>>;
  createCollel(input: CreateCollelInput): Promise<Result<CreatedCollel>>;
  updateCollel(id: string, input: UpdateCollelInput): Promise<Result<CollelDirectoryEntry>>;
  resetCollelAdmin(id: string): Promise<Result<GeneratedCredentials>>;
  resetCollelAccess(id: string): Promise<Result<GeneratedCredentials>>;
}
