import { z } from 'zod';
const encoded = z
  .string()
  .min(1)
  .max(60000)
  .regex(/^[A-Za-z0-9_-]+$/);
const base = {
  id: encoded.max(2048),
  rawId: encoded.max(2048),
  type: z.literal('public-key'),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  authenticatorAttachment: z.string().optional(),
};
export const registrationCredentialSchema = z
  .object({
    ...base,
    response: z
      .object({
        clientDataJSON: encoded,
        attestationObject: encoded,
        transports: z.array(z.string()).optional(),
      })
      .passthrough(),
  })
  .passthrough();
export const authenticationCredentialSchema = z
  .object({
    ...base,
    response: z
      .object({
        clientDataJSON: encoded,
        authenticatorData: encoded,
        signature: encoded,
        userHandle: encoded.max(2048).nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();
