import { createFileRoute } from "@tanstack/react-router";
import { AuthGateError, requireSignedIn } from "@/components/auth/AuthGate";
import Layout from "@/components/Layout";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  ssr: false,
  beforeLoad: async (options) => {
    const result=await requireSignedIn(options);
    if(result.user.role!=="admin")throw new Error("Эта студия доступна только владельцу");
    return result;
  },
  errorComponent: AuthGateError,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
