import * as Checkbox from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

export default function CheckboxField({ checked, onCheckedChange, label, id, className = "" }) {
  return (
    <label htmlFor={id} className={`inline-flex cursor-pointer items-center gap-2 text-sm ${className}`}>
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-primary-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary"
      >
        <Checkbox.Indicator>
          <Check className="h-3 w-3" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      {label && <span className="select-none">{label}</span>}
    </label>
  );
}