"use client";
import * as React from "react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DM.Content>>(
  ({ className, sideOffset = 6, ...p }, ref) => (
    <DM.Portal>
      <DM.Content ref={ref} sideOffset={sideOffset} align="end"
        className={cn("z-50 min-w-[12rem] rounded-xl border border-border bg-surface p-1 shadow-soft", className)} {...p} />
    </DM.Portal>
  ),
);
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DM.Item>>(
  ({ className, ...p }, ref) => (
    <DM.Item ref={ref} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none data-[highlighted]:bg-surface-2/70", className)} {...p} />
  ),
);
DropdownMenuItem.displayName = "DropdownMenuItem";
