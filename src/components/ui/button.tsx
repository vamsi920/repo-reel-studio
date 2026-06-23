import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground font-semibold shadow-[0_1px_2px_rgba(10,13,20,.18),0_6px_18px_-8px_hsl(var(--primary)/0.5)] hover:bg-primary/90 hover:shadow-[0_2px_4px_rgba(10,13,20,.20),0_10px_24px_-8px_hsl(var(--primary)/0.6)] hover:-translate-y-px active:translate-y-0",
        destructive: "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20",
        outline: "bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.12] text-foreground",
        secondary: "bg-card text-foreground border border-border hover:bg-card/80",
        ghost: "hover:bg-white/[0.05] text-muted-foreground hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        glow: "bg-primary text-primary-foreground font-semibold shadow-[0_1px_2px_rgba(10,13,20,.18),0_6px_18px_-8px_hsl(var(--primary)/0.5)] hover:bg-primary/90 hover:shadow-[0_2px_4px_rgba(10,13,20,.20),0_10px_24px_-8px_hsl(var(--primary)/0.6)]",
        hero: "bg-primary text-primary-foreground font-semibold shadow-[0_1px_2px_rgba(10,13,20,.18),0_6px_18px_-8px_hsl(var(--primary)/0.5)] hover:bg-primary/90 hover:-translate-y-px transition-all duration-300",
        nav: "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3",
        lg: "h-10 px-5 text-sm",
        xl: "h-11 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
