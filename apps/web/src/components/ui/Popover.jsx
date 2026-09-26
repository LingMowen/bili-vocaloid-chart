import * as Popover from "@radix-ui/react-popover";
import { useTranslation } from "react-i18next";

export default function PopoverMenu({ trigger, children, side = "bottom", align = "end", className = "" }) {
  const { t } = useTranslation();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={6}
          className={`z-[62] rounded-lg border bg-popover p-1 shadow-lg outline-none ${className}`}
        >
          {children}
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
