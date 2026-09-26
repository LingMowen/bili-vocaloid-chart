import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import Tip from "./Tip.jsx";

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-lg",
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose?.()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-[61] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-5 shadow-xl outline-none ${maxWidth}`}
        >
          {title && (
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="text-base font-bold">{title}</Dialog.Title>
              <Dialog.Close asChild>
                <Tip content={t("nav.close")}>
                  <span className="flex rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                    <X className="h-5 w-5" />
                  </span>
                </Tip>
              </Dialog.Close>
            </div>
          )}
          {description && (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
