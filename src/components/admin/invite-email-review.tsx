import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import {
  missingMergeFields,
  renderAdminInvite,
  standardInviteWording,
  wordingIssues,
  type AdminInviteKind,
  type AdminInviteMerge,
  type AdminInviteWording,
} from "@/lib/invitation-email";

/**
 * Review email step. Renders the real email HTML from the same function the
 * server sends with (renderAdminInvite), at real email width, in one centred
 * column. Subject, greeting and message are edited in place; everything else
 * is locked. `value` null means the standard wording.
 */
export function InviteEmailReview({
  kind,
  merge,
  value,
  onChange,
  onFix,
}: {
  kind: AdminInviteKind;
  merge: AdminInviteMerge;
  value: AdminInviteWording | null;
  onChange: (w: AdminInviteWording | null) => void;
  onFix: (field: string) => void;
}) {
  const standard = useMemo(() => standardInviteWording(kind, merge), [kind, merge]);
  const effective = value ?? standard;
  const mergeIssues = missingMergeFields(kind, merge);
  const textIssues = mergeIssues.length ? [] : wordingIssues(effective);

  // The iframe is only re-rendered on reset or when the invitation's data
  // changes, so typing inside it never loses the cursor.
  const [seed, setSeed] = useState(0);
  const latest = useRef({ effective, onChange });
  latest.current = { effective, onChange };
  const html = useMemo(
    () => renderAdminInvite(kind, merge, latest.current.effective, { editable: true }).html,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, merge, seed],
  );
  const text = useMemo(
    () => renderAdminInvite(kind, merge, effective).text,
    [kind, merge, effective],
  );

  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);
  const [showText, setShowText] = useState(false);

  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (doc) setHeight(Math.max(400, doc.documentElement.scrollHeight));
  };

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    measure();
    doc
      .querySelectorAll("a")
      .forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
    const bind = (field: "greeting" | "message") => {
      const el = doc.querySelector<HTMLElement>(`[data-tv-field="${field}"]`);
      if (!el) return;
      el.setAttribute("role", "textbox");
      el.setAttribute("aria-label", field === "greeting" ? "Greeting" : "Message");
      if (field === "message") el.setAttribute("aria-multiline", "true");
      el.addEventListener("paste", (e) => {
        e.preventDefault();
        const t = e.clipboardData?.getData("text/plain") ?? "";
        doc.execCommand("insertText", false, t);
      });
      el.addEventListener("input", () => {
        const raw = el.innerText
          .replace(/\r/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const { effective: cur, onChange: set } = latest.current;
        set({ ...cur, [field]: raw });
        measure();
      });
    };
    bind("greeting");
    bind("message");
  };

  const setSubject = (subject: string) => {
    onChange({ ...effective, subject });
    const h = frame.current?.contentDocument?.querySelector('[data-tv-field="subject-heading"]');
    if (h) h.textContent = subject;
  };

  useEffect(() => {
    if (value === null) setSeed((s) => s + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === null]);

  return (
    <div className="tvp-email-review">
      {(mergeIssues.length > 0 || textIssues.length > 0) && (
        <ul className="tvp-review-issues" role="alert">
          {mergeIssues.map((i) => (
            <li key={i.field}>
              {i.message}{" "}
              {i.fix === "account" ? (
                <Link to="/admin/my-account" className="tvp-link">
                  Add your name in My account
                </Link>
              ) : (
                <button type="button" className="tvp-link" onClick={() => onFix(i.field)}>
                  Fix in details
                </button>
              )}
            </li>
          ))}
          {textIssues.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      {mergeIssues.length === 0 && (
        <>
          <div className="tvp-email-meta">
            <div className="tvp-email-meta-row">
              <span className="tvp-email-meta-label">To</span>
              <span>{merge.recipientEmail}</span>
            </div>
            <label className="tvp-email-meta-row">
              <span className="tvp-email-meta-label">Subject</span>
              <input
                className="tvp-email-subject"
                value={effective.subject}
                maxLength={200}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <div className="tvp-email-tools">
              <span className="tvp-muted">
                Click the subject, greeting or message to edit. The button, link, expiry and
                security wording can't be changed. Edits apply to this invitation only.
              </span>
              <button
                type="button"
                className="tvp-secondary"
                disabled={value === null}
                onClick={() => onChange(null)}
              >
                <RotateCcw className="h-4 w-4" />
                Reset to standard wording
              </button>
            </div>
          </div>

          <iframe
            ref={frame}
            title="Invitation email preview"
            className="tvp-email-frame"
            sandbox="allow-same-origin"
            srcDoc={html}
            onLoad={onLoad}
            style={{ height }}
          />

          <button type="button" className="tvp-link" onClick={() => setShowText((v) => !v)}>
            {showText ? "Hide plain-text version" : "Show plain-text version"}
          </button>
          {showText && <pre className="tvp-email-text">{text}</pre>}
        </>
      )}
    </div>
  );
}

/** Read-only view of an email exactly as it was sent. */
export function SentEmailView({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);
  const [showText, setShowText] = useState(false);
  return (
    <div className="tvp-email-review">
      <div className="tvp-email-meta">
        <div className="tvp-email-meta-row">
          <span className="tvp-email-meta-label">To</span>
          <span>{to}</span>
        </div>
        <div className="tvp-email-meta-row">
          <span className="tvp-email-meta-label">Subject</span>
          <span>{subject}</span>
        </div>
      </div>
      <iframe
        ref={frame}
        title="Sent invitation email"
        className="tvp-email-frame"
        sandbox="allow-same-origin"
        srcDoc={html}
        style={{ height }}
        onLoad={() => {
          const doc = frame.current?.contentDocument;
          if (!doc) return;
          setHeight(Math.max(400, doc.documentElement.scrollHeight));
          doc
            .querySelectorAll("a")
            .forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
        }}
      />
      {text && (
        <>
          <button type="button" className="tvp-link" onClick={() => setShowText((v) => !v)}>
            {showText ? "Hide plain-text version" : "Show plain-text version"}
          </button>
          {showText && <pre className="tvp-email-text">{text}</pre>}
        </>
      )}
    </div>
  );
}
