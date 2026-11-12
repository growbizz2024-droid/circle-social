-- CreateEnum
CREATE TYPE "ProfileTheme" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "ProfileAccent" AS ENUM ('INDIGO', 'TEAL', 'ROSE', 'AMBER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarId" VARCHAR(24) NOT NULL DEFAULT 'otter',
ADD COLUMN     "bio" VARCHAR(280),
ADD COLUMN     "displayName" VARCHAR(50),
ADD COLUMN     "onboardingCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "profileAccent" "ProfileAccent" NOT NULL DEFAULT 'INDIGO',
ADD COLUMN     "profileTheme" "ProfileTheme" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "profileVersion" INTEGER NOT NULL DEFAULT 0;
