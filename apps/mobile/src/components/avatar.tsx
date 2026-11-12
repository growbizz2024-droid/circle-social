import { View } from "../theme/primitives";
import { SvgXml } from "react-native-svg";
import { renderAvatarSvg } from "@circle/avatar-engine";
import type { AvatarSpec } from "@circle/shared-types";
export default function Avatar({
  avatar,
  seed,
  size = 48,
  label = "Profile avatar",
}: {
  avatar?: AvatarSpec | null;
  seed?: string;
  size?: number;
  label?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <SvgXml xml={renderAvatarSvg(avatar, seed)} width={size} height={size} />
    </View>
  );
}
