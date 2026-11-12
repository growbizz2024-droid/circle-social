"use client";
import Image from "next/image";
import { avatarDataUri } from "@circle/avatar-engine";
import type { AvatarSpec } from "@circle/shared-types";
export default function Avatar({
  avatar,
  seed,
  size = 48,
  label = "Profile avatar",
  className = "",
}: {
  avatar?: AvatarSpec | null;
  seed?: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <Image
      unoptimized
      className={`circle-avatar ${className}`}
      src={avatarDataUri(avatar, seed)}
      alt={label}
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  );
}
