import { useFonts } from "expo-font";
import { View, ActivityIndicator } from "react-native";
import { brand } from "@circle/design-tokens";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ThemeSurface from "../theme/surface";
export default function Layout() {
  const [loaded, error] = useFonts({
    Chillax: require("../../../../assets/brand/fonts/Chillax-Semibold.otf"),
    Inter: require("../../../../assets/brand/fonts/InterVariable.ttf"),
  });
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: brand.black,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={brand.orange} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <ThemeSurface>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </ThemeSurface>
    </SafeAreaProvider>
  );
}
