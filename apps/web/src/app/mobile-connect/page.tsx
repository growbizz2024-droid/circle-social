import { Suspense } from "react";
import MobileConnect from "../../components/mobile-connect";
export default function Page() {
  return (
    <Suspense fallback={<p>Opening Circle.social…</p>}>
      <MobileConnect />
    </Suspense>
  );
}
