import { forwardRef } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

const Tip = forwardRef(function Tip({ content, children, side = "top" }, ref) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger ref={ref} asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-[80] max-w-64 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
        >
          {content}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});

export default Tip;