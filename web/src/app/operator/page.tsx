import { OperatorDashboard } from "@/components/operator/OperatorDashboard";
import { OperatorLogin } from "@/components/operator/OperatorLogin";
import {
  getOperatorPasswordHint,
  isOperatorAuthenticated,
} from "@/lib/operator-auth";
import { listSubmissions } from "@/lib/submissions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel operatora — Rada Pism",
  robots: { index: false, follow: false },
};

export default async function OperatorPage() {
  const authed = await isOperatorAuthenticated();

  if (!authed) {
    return <OperatorLogin passwordHint={getOperatorPasswordHint()} />;
  }

  const submissions = await listSubmissions();
  return <OperatorDashboard submissions={submissions} />;
}
