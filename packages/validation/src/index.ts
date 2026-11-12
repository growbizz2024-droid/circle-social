import { z } from "zod";
import {
  AVATARS,
  PROFILE_THEMES,
  ONBOARDING_GENDERS,
  ONBOARDING_VIBES,
  ONBOARDING_BACKGROUNDS,
  ONBOARDING_STEPS,
  INTERESTS,
} from "@circle/constants";
import { AVATAR_OPTIONS } from "@circle/avatar-engine";
export const avatarConfigSchema = z
  .object({
    head: z.enum(AVATAR_OPTIONS.head.map((x) => x.id)),
    body: z.enum(AVATAR_OPTIONS.body.map((x) => x.id)),
    skinTone: z.enum(AVATAR_OPTIONS.skinTone.map((x) => x.id)),
    hair: z.enum(AVATAR_OPTIONS.hair.map((x) => x.id)),
    hairColor: z.enum(AVATAR_OPTIONS.hairColor.map((x) => x.id)),
    outfit: z.enum(AVATAR_OPTIONS.outfit.map((x) => x.id)),
    accessory: z.enum(AVATAR_OPTIONS.accessory.map((x) => x.id)),
    background: z.enum(AVATAR_OPTIONS.background.map((x) => x.id)),
    style: z.enum(AVATAR_OPTIONS.style.map((x) => x.id)),
  })
  .strict();
export const avatarSpecSchema = z
  .object({
    version: z.literal(1),
    seed: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    config: avatarConfigSchema,
  })
  .strict();
export const avatarUpdateSchema = avatarSpecSchema
  .extend({ revision: z.number().int().min(0).max(2147483646) })
  .strict();
export const avatarRevisionSchema = z
  .object({ revision: z.number().int().min(0).max(2147483646) })
  .strict();
export const handleSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9_]+$/);
export const communitySchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(1).max(100),
    description: z.string().max(500).optional(),
  })
  .strict();
export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.uuid().optional(),
  })
  .strict();
export const registrationOptionsSchema = z
  .object({
    handle: handleSchema.optional(),
    avatar: avatarSpecSchema.optional(),
    intent: z.enum(["create", "add"]).optional(),
  })
  .strict();

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    );
export const profileUpdateSchema = z
  .object({
    profileVersion: z.number().int().min(0).max(2147483646),
    displayName: safeText(50).nullable().optional(),
    bio: safeText(280).nullable().optional(),
    avatarId: z.enum(AVATARS.map((a) => a.id)).optional(),
    profileTheme: z.enum(PROFILE_THEMES).optional(),
    profileAccent: z.enum(["INDIGO", "TEAL", "ROSE", "AMBER"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, {
    message: "Provide at least one profile field",
  });
export const deactivateAccountSchema = z
  .object({ confirmation: handleSchema })
  .strict();

export const onboardingPreferencesSchema = z
  .object({
    gender: z.enum(ONBOARDING_GENDERS.map((x) => x.id)).nullable(),
    vibe: z.enum(ONBOARDING_VIBES.map((x) => x.id)),
    backgroundId: z.enum(ONBOARDING_BACKGROUNDS.map((x) => x.id)),
    interests: z
      .array(z.enum(INTERESTS.map((x) => x.id)))
      .max(INTERESTS.length)
      .refine(
        (values) => new Set(values).size === values.length,
        "Choose each interest once",
      ),
  })
  .strict();
export const onboardingInputSchema = onboardingPreferencesSchema
  .extend({ profileVersion: z.number().int().min(0).max(2147483646) })
  .strict();
export const onboardingDraftSchema = onboardingPreferencesSchema
  .extend({
    version: z.literal(1),
    intent: z.enum(["create", "edit"]),
    baseVersion: z.number().int().nonnegative().optional(),
    step: z.enum(ONBOARDING_STEPS),
    handle: z.string().max(40),
    suggestions: z.array(handleSchema).min(1).max(5),
    boundUserId: z.uuid().optional(),
    communityIds: z
      .array(z.uuid())
      .max(5)
      .refine((x) => new Set(x).size === x.length)
      .optional(),
    avatar: avatarSpecSchema.optional(),
    readyToFinish: z.boolean(),
  })
  .strict();

export const completeRegistrationSchema = onboardingPreferencesSchema
  .extend({
    profileVersion: z.number().int().min(0).max(2147483646),
    communityIds: z
      .array(z.uuid())
      .max(5)
      .refine((x) => new Set(x).size === x.length),
  })
  .strict();
export const recoveryCodeSchema = z
  .object({
    code: z
      .string()
      .regex(/^CS1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/)
      .refine((value) => z.uuid().safeParse(value.split(".")[1]).success),
  })
  .strict();

export const feedQuerySchema = z
  .object({
    tab: z
      .enum(["for-you", "following", "trending", "saved", "discover"])
      .default("for-you"),
    q: z.string().trim().max(80).default(""),
    communityId: z.uuid().optional(),
    topic: z.enum(INTERESTS.map((x) => x.id)).optional(),
  })
  .strict();
export const createPostSchema = z
  .object({
    communityId: z.uuid(),
    text: safeText(500),
    attachmentIds: z
      .array(z.uuid())
      .max(3)
      .refine((x) => new Set(x).size === x.length)
      .default([]),
    mediaUrls: z
      .array(z.enum(ONBOARDING_BACKGROUNDS.map((x) => x.path)))
      .max(3)
      .default([]),
    interests: z
      .array(z.enum(INTERESTS.map((x) => x.id)))
      .max(5)
      .default([]),
  })
  .strict()
  .refine(
    (x) =>
      x.text.length > 0 || x.attachmentIds.length > 0 || x.mediaUrls.length > 0,
  );
export const postCommentSchema = z
  .object({ text: safeText(500).pipe(z.string().min(1)) })
  .strict();
export const activeStateSchema = z.object({ active: z.boolean() }).strict();

import { themeContrastIssues } from "@circle/design-tokens";
const themeHex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeConfigSchema = z
  .object({
    version: z.literal(1),
    appearance: z.enum(["dark", "light"]),
    background: z
      .object({
        type: z.enum([
          "solid",
          "linear",
          "radial",
          "pattern",
          "texture",
          "image",
        ]),
        stops: z
          .array(
            z
              .object({ color: themeHex, position: z.number().min(0).max(100) })
              .strict(),
          )
          .min(2)
          .max(5),
        angle: z.number().min(0).max(360),
        opacity: z.number().min(0).max(1),
        intensity: z.number().min(0).max(1),
        pattern: z.enum(["dots", "grid", "waves", "grain"]),
        imageId: z.uuid().nullable(),
      })
      .strict(),
    colors: z
      .object({
        primaryBackground: themeHex,
        secondaryBackground: themeHex,
        surface: themeHex,
        primaryAccent: themeHex,
        secondaryAccent: themeHex,
        primaryText: themeHex,
        secondaryText: themeHex,
        border: themeHex,
        inputBackground: themeHex,
        inputBorder: themeHex,
        navigationBackground: themeHex,
        navigationActive: themeHex,
        buttonText: themeHex,
      })
      .strict(),
    typography: z
      .object({
        family: z.enum(["inter", "system", "rounded"]),
        baseSize: z.number().min(14).max(18),
        lineHeight: z.number().min(1.35).max(1.8),
      })
      .strict(),
    effects: z
      .object({
        radius: z.number().min(4).max(28),
        shadows: z.boolean(),
        motion: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const message of themeContrastIssues(value))
      ctx.addIssue({ code: "custom", message });
    if (value.background.type === "image" && !value.background.imageId)
      ctx.addIssue({ code: "custom", message: "Choose a background image." });
  });
export const themeDraftSchema = z
  .object({
    name: safeText(60).pipe(z.string().min(1)),
    description: safeText(180),
    config: themeConfigSchema,
  })
  .strict();
export const themeUpdateSchema = themeDraftSchema
  .extend({ revision: z.number().int().min(0).max(2147483646) })
  .strict();
