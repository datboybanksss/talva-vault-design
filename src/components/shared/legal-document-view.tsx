import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { reachedDocumentEnd } from "@/lib/terms-gate-core";

/** Render the stored body directly: never replace it with a summary or normalise its hash input. */
export function LegalDocumentView({
  body,
  maxHeight = 260,
  onReachedEnd,
}: {
  body: string;
  maxHeight?: number;
  onReachedEnd?: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (!element || !onReachedEnd) return;
    const check = () => {
      if (reachedDocumentEnd(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        onReachedEnd();
      }
    };
    check();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [body, onReachedEnd]);

  return (
    <div
      ref={panel}
      className="tvp-legal-document"
      data-max-height={maxHeight}
      tabIndex={0}
      role="region"
      aria-label="Terms & Conditions document"
      onScroll={(event) => {
        const element = event.currentTarget;
        if (reachedDocumentEnd(element.scrollTop, element.clientHeight, element.scrollHeight)) {
          onReachedEnd?.();
        }
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkBreaks]} skipHtml>{body}</ReactMarkdown>
    </div>
  );
}