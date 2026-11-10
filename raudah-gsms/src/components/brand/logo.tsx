import Image from "next/image";
import { cn } from "@/lib/utils";

/** Raudah logo (1186×604). In dark mode it sits on a white rounded badge so the blue wordmark stays legible. */
export function Logo({ height = 32, className, priority }: { height?: number; className?: string; priority?: boolean }) {
  const width = Math.round((height * 1186) / 604);
  return (
    <span className={cn("inline-flex items-center dark:rounded-lg dark:bg-white dark:px-2 dark:py-1", className)}>
      <Image src="/brand/logo.png" alt="Raudah Travels & Tours Ltd" width={width} height={height} priority={priority} style={{ height, width: "auto" }} />
    </span>
  );
}
