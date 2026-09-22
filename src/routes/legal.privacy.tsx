import { createFileRoute, Link } from "@tanstack/react-router";
import {
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_NOTICE_SECTIONS,
  PRIVACY_NOTICE_TITLE,
} from "@/content/privacy-notice";

const DESCRIPTION =
  "How TalVault collects, uses, stores and shares personal information, as required by section 18 of POPIA.";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — TalVault" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Privacy Notice — TalVault" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyNoticePage,
});

function PrivacyNoticePage() {
  return (
    <div className="tvp-legal-page">
      <article className="tvp-legal-doc-page">
        <header className="tvp-legal-head">
          <h1>{PRIVACY_NOTICE_TITLE}</h1>
          <p className="tvp-legal-date">{PRIVACY_NOTICE_EFFECTIVE_DATE}</p>
        </header>

        <nav className="tvp-legal-toc" aria-label="Sections">
          <ol>
            {PRIVACY_NOTICE_SECTIONS.map((s) => (
              <li key={s.number}>
                <a href={`#section-${s.number}`}>
                  {s.number}. {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {PRIVACY_NOTICE_SECTIONS.map((s) => (
          <section key={s.number} id={`section-${s.number}`} className="tvp-legal-section">
            <h2>
              <span className="tvp-legal-num">{s.number}.</span> {s.heading}
            </h2>
            {s.blocks.map((b, i) =>
              b.kind === "ul" ? (
                <ul key={i}>
                  {b.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              ) : (
                <p key={i}>{b.text}</p>
              ),
            )}
          </section>
        ))}

        <footer className="tvp-legal-foot">
          <Link to="/">Back to TalVault</Link>
        </footer>
      </article>
    </div>
  );
}
