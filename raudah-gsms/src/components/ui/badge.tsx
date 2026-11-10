import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-2 text-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/15 text-[#8a6500] dark:text-warning",
} as const;

/** Always pair colour with text/icon – never colour alone. */
export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}
