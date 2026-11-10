import { cn } from "@/lib/utils";

const tones = {
  error: "border-danger/40 bg-danger/10 text-danger",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/50 bg-warning/10 text-foreground",
  info: "border-primary/30 bg-primary/10 text-foreground",
};
export function Alert({ tone = "info", children, className }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string }) {
  return <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-3 py-2.5 text-sm", tones[tone], className)}>{children}</div>;
}
