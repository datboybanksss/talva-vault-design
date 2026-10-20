import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogPortal } from "@/components/ui/dialog";

/** Token-based document modal with Radix focus containment and focus restoration. */
export function DocumentModal({ children, title, onClose, busy = false, className = "" }: {
  children: ReactNode; title: string; onClose: () => void; busy?: boolean; className?: string;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogPortal>
        <DialogPrimitive.Overlay className="tvp-document-overlay" />
        <DialogPrimitive.Content className={`tvp-document-modal ${className}`} aria-describedby={undefined}
          onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
          onInteractOutside={(e) => { if (busy) e.preventDefault(); }}>
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
