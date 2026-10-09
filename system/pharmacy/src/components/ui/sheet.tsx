import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = ({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<"div"> & { open?: boolean; onOpenChange?: (open: boolean) => void }) => {
  return <div data-state={open ? "open" : "closed"} {...props} />;
};
Sheet.displayName = "Sheet";

const SheetTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => <button ref={ref} className={cn("", className)} {...props} />
);
SheetTrigger.displayName = "SheetTrigger";

export { Sheet, SheetTrigger };