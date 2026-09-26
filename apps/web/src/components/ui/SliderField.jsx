import * as Slider from "@radix-ui/react-slider";

export default function SliderField({
  value,
  onValueChange,
  min,
  max,
  step,
  className = "",
  disabled = false,
}) {
  return (
    <Slider.Root
      value={Array.isArray(value) ? value : [value]}
      onValueChange={(v) => onValueChange?.(v[0])}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={`relative flex h-5 w-full touch-none select-none items-center ${className}`}
    >
      <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
        <Slider.Range className="absolute h-full bg-primary" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  );
}