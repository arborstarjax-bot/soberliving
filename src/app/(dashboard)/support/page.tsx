import { requireAuth } from "@/lib/auth";
import { SupportForm } from "./support-form";

export default async function SupportPage() {
  await requireAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-sm text-muted-foreground">
          Found a bug or need help? Send it here — it goes straight to the
          operator.
        </p>
      </div>
      <SupportForm />
    </div>
  );
}
