import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[linear-gradient(135deg,rgba(180,197,255,1),rgba(97,139,255,1))] text-primary-foreground hover:brightness-[1.03]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "bg-[rgba(45,52,73,0.72)] text-foreground hover:bg-[rgba(49,57,77,0.82)]",
        secondary: "bg-[rgba(45,52,73,0.72)] text-primary hover:bg-[rgba(49,57,77,0.82)]",
        ghost: "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        glow: "bg-[linear-gradient(135deg,rgba(180,197,255,1),rgba(97,139,255,1))] text-primary-foreground glow-primary hover:glow-primary-subtle animate-pulse-glow",
        hero: "bg-[linear-gradient(135deg,rgba(180,197,255,1),rgba(97,139,255,1))] text-primary-foreground font-semibold hover:brightness-[1.03] transition-all duration-300",
        nav: "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
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
