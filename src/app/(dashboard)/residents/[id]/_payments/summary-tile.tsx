import { Card, CardContent } from "@/components/ui/card";

export function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "default" | "danger";
}) {
  return (
    <Card
      className={tone === "danger" ? "border-destructive/50 bg-destructive/5" : ""}
    >
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
