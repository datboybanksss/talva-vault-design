import { useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { X } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Tag/chip style multi-email field. Each address is validated before it can
 * become a chip; duplicates are ignored (case-insensitive).
 */
export function EmailChipsInput({
  value,
  onChange,
  placeholder = "Type an email and press Enter",
  max = 20,
  inputId,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
  inputId?: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(raw: string): boolean {
    const email = raw.trim().replace(/[,;]+$/, "").toLowerCase();
    if (!email) return true;
    if (!isValidEmail(email)) {
      setError(`"${email}" is not a valid email address`);
      return false;
    }
    if (value.some((v) => v.toLowerCase() === email)) {
      setError("That address has already been added");
      return false;
    }
    if (value.length >= max) {
      setError(`You can add up to ${max} recipients`);
      return false;
    }
    setError(null);
    onChange([...value, email]);
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " ") {
      if (!draft.trim()) return;
      e.preventDefault();
      if (add(draft)) setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/[,;\s]/.test(text)) return;
    e.preventDefault();
    const parts = text.split(/[,;\s]+/).filter(Boolean);
    let next = [...value];
    const bad: string[] = [];
    for (const p of parts) {
      const email = p.trim().toLowerCase();
      if (!isValidEmail(email)) { bad.push(email); continue; }
      if (!next.some((v) => v.toLowerCase() === email) && next.length < max) next.push(email);
    }
    onChange(next);
    setError(bad.length ? `Skipped ${bad.length} invalid address${bad.length === 1 ? "" : "es"}` : null);
  }

  return (
    <div>
      <div
        className="tvp-chip-field"
        style={{
          display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          border: "1px solid var(--line-200, #e2e0da)", borderRadius: "var(--r-sm, 6px)",
          padding: "6px 8px", background: "var(--surface, #fff)", minHeight: 40,
        }}
      >
        {value.map((email) => (
          <span
            key={email}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--tvp-teal-bg, #e6f2f3)", color: "var(--tvp-teal, #0d6d78)",
              borderRadius: 999, padding: "3px 8px", fontSize: 13, fontWeight: 600,
            }}
          >
            {email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => { onChange(value.filter((v) => v !== email)); setError(null); }}
              style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", lineHeight: 0 }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="email"
          value={draft}
          placeholder={value.length ? "Add another…" : placeholder}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => { if (draft.trim() && add(draft)) setDraft(""); }}
          style={{ flex: 1, minWidth: 180, border: 0, outline: "none", background: "transparent", padding: "4px 2px" }}
        />
      </div>
      {error ? (
        <div style={{ color: "var(--tvp-red, #b3261e)", fontSize: 12, marginTop: 4 }}>{error}</div>
      ) : (
        <div className="tvp-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Press Enter or comma to add each address. Everyone listed is sent the document.
        </div>
      )}
    </div>
  );
}
