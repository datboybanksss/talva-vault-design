import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  REPORTS_DEFINITIONS,
  REPORTS_DEFINITIONS_DATE,
  REPORTS_DEFINITIONS_VERSION,
  type ReportDefinitionKey,
} from "@/lib/reports-definitions";
export function ReportDefinition({ definition }: { definition: ReportDefinitionKey }) {
  const [open, setOpen] = useState(false),
    d = REPORTS_DEFINITIONS[definition];
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0"
        title={`How this is calculated: ${d.title}`}
        aria-label={`How this is calculated: ${d.title}`}
        onClick={() => setOpen(true)}
      >
        <Info />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{d.title}</DialogTitle>
            <DialogDescription>
              {REPORTS_DEFINITIONS_VERSION} · {REPORTS_DEFINITIONS_DATE}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-relaxed">{d.text}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
