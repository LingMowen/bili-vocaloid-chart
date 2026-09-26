import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

function SelectItem({ value, children }) {
  return (
    <Select.Item
      value={value}
      className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-foreground"
    >
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator>
        <Check className="h-4 w-4" />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

export default function SelectField({
  value,
  onValueChange,
  placeholder,
  className = "",
  triggerClassName = "",
  children,
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className={`inline-flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-ring data-[placeholder]:text-muted-foreground ${triggerClassName}`}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="z-[70] rounded-lg border bg-popover p-1 shadow-lg"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="min-w-[var(--radix-select-trigger-width)]">{children}</Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export { SelectItem };