-- CreateEnum
CREATE TYPE "OnboardingGender" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "OnboardingVibe" AS ENUM ('BOLD', 'CALM', 'DARK');

-- CreateTable
CREATE TABLE "user_onboarding" (
    "userId" UUID NOT NULL,
    "gender" "OnboardingGender",
    "vibe" "OnboardingVibe" NOT NULL,
    "backgroundId" VARCHAR(24) NOT NULL,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_onboarding_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_onboarding" ADD CONSTRAINT "user_onboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
