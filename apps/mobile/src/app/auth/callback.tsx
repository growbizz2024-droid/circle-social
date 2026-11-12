import { useEffect, useState } from "react";

import {Text,View,Pressable} from "../../theme/primitives";
import { router, useLocalSearchParams } from "expo-router";
import { brand } from "@circle/design-tokens";
import { BrandMark } from "../../components/brand";
import { completeSignIn } from "../../lib/session";
export default function Callback() {
  const params = useLocalSearchParams<{ code?: string; state?: string }>();
  const [error, setError] = useState("");
  useEffect(() => {
    const callback = `circlesocial://auth/callback?code=${encodeURIComponent(params.code ?? "")}&state=${encodeURIComponent(params.state ?? "")}`;
    void completeSignIn(callback)
      .then(() => router.replace("/"))
      .catch((e) => setError((e as Error).message));
  }, [params.code, params.state]);
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: 32,
        gap: 24,
        backgroundColor: brand.black,
      }}
    >
      <BrandMark />
      <Text style={{ fontFamily: "Inter", color: brand.white, fontSize: 16 }}>
        {error || "Completing sign-in…"}
      </Text>
      <Pressable
        accessibilityRole="button"
        style={{ backgroundColor: brand.orange, borderRadius: 12, padding: 16 }}
        onPress={() => router.replace("/")}
      >
        <Text
          style={{ fontFamily: "Inter", color: brand.black, fontWeight: "600" }}
        >
          Back to Circle.social
        </Text>
      </Pressable>
    </View>
  );
}
