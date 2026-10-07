import { Tooltip, TooltipProps } from "@heroui/react";
import React, { ReactNode } from "react";
import { cn } from "#/utils/utils";

export interface StyledTooltipProps {
  children: ReactNode;
  content: string | ReactNode;
  tooltipClassName?: React.HTMLAttributes<HTMLDivElement>["className"];
  placement?: TooltipProps["placement"];
  showArrow?: boolean;
  closeDelay?: number;
  offset?: number;
  shouldFlip?: boolean;
}

function getTooltipTriggerChild(children: ReactNode) {
  if (React.Children.count(children) === 1 && React.isValidElement(children)) {
    return children;
  }
  return <span className="inline-flex">{children}</span>;
}

export function StyledTooltip({
  children,
  content,
  tooltipClassName,
  placement = "right",
  showArrow = false,
  closeDelay = 100,
  shouldFlip,
  offset = 7,
}: StyledTooltipProps) {
  const disableAnimation = import.meta.env.MODE === "test";

  return (
    <Tooltip
      content={content}
      closeDelay={closeDelay}
      placement={placement}
      offset={offset}
      shouldFlip={shouldFlip}
      className={cn("bg-[#ffffff] text-[#111827]", tooltipClassName)}
      showArrow={showArrow}
      disableAnimation={disableAnimation}
      classNames={{
        content: cn(
          "z-[9999] rounded-md px-2 py-1 text-xs font-medium shadow-md",
          // Literal colours: the theme remaps `bg-white`/`text-black` to dark
          // tokens, which made tooltips black text on a near-black box.
          "!bg-[#ffffff] !text-[#111827] border border-[#e5e7eb]",
          tooltipClassName,
        ),
      }}
    >
      {getTooltipTriggerChild(children)}
    </Tooltip>
  );
}
