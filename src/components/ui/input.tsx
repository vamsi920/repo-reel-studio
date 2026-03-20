import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  variant?: "default" | "hero";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    const variants = {
      default: "h-10 border-0 bg-[rgba(45,52,73,0.72)] text-foreground placeholder:text-muted-foreground/78 focus:bg-[rgba(49,57,77,0.84)] focus-visible:shadow-[0_0_0_6px_rgba(180,197,255,0.12)]",
      hero: "h-10 border-0 bg-[rgba(45,52,73,0.72)] text-sm text-foreground placeholder:text-muted-foreground/72 focus:bg-[rgba(49,57,77,0.84)] focus-visible:shadow-[0_0_0_6px_rgba(180,197,255,0.12)]",
    };

    return (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-xl px-4 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          variants[variant],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
