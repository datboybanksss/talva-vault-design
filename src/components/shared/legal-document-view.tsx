import { useMemo } from "react";

/**
 * Renders the legal copy stored in public.legal_documents. The body is stored
 * as light Markdown (## headings, - bullets, blank-line paragraphs, **bold**).
 * Deliberately dependency-free so it can render on the public invite pages.
 */
export function LegalDocumentView({
  body,
  maxHeight = 260,
}: {
  body: string;
  maxHeight?: number;
}) {
  const blocks = useMemo(() => parseBlocks(body), [body]);

  return (
    <div
      className="tv-legal-doc"
      tabIndex={0}
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        maxHeight,
        overflowY: "auto",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--muted-fg)",
        background: "var(--surface-soft)",
      }}
    >
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h3
            key={i}
            style={{
              fontSize: 13,
              fontWeight: 650,
              color: "var(--fg)",
              margin: i === 0 ? "0 0 6px" : "14px 0 6px",
            }}
          >
            {inline(b.text)}
          </h3>
        ) : b.kind === "list" ? (
          <ul key={i} style={{ margin: "0 0 8px", paddingLeft: 18, listStyle: "disc" }}>
            {b.items.map((it, j) => (
              <li key={j} style={{ marginBottom: 3 }}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} style={{ margin: "0 0 8px" }}>{inline(b.text)}</p>
        ),
      )}
    </div>
  );
}

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

function parseBlocks(body: string): Block[] {
  const out: Block[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push({ kind: "list", items: list });
      list = [];
    }
  };

  for (const raw of (body ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^#{1,6}\s+/.test(line)) {
      flush();
      out.push({ kind: "heading", text: line.replace(/^#{1,6}\s+/, "") });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    const prev = out[out.length - 1];
    if (prev && prev.kind === "paragraph") prev.text += " " + line;
    else out.push({ kind: "paragraph", text: line });
  }
  flush();
  return out;
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} style={{ color: "var(--fg)" }}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
