import { useAppTheme } from "../theme/store";
import { Image, Text, View, StyleSheet } from "react-native";
import { brand } from "@circle/design-tokens";
export function BrandMark({ size = 88 }: { size?: number }) {
  return (
    <Image
      accessible={false}
      source={require("../../../../assets/brand/circle-mark.png")}
      style={{ width: size, height: size }}
    />
  );
}
export function Wordmark({ color = brand.white }: { color?: string }) {
  const theme = useAppTheme();
  color = theme?.colors.primaryText ?? color;
  return (
    <View accessibilityLabel="Circle.social" style={styles.wordmark}>
      <BrandMark size={32} />
      <Text style={[styles.name, { color }]}>
        Circle<Text style={{ color: brand.orange }}>.social</Text>
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  wordmark: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: {
    fontFamily: "Chillax",
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -1,
  },
});
