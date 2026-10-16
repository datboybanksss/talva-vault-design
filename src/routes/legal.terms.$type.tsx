import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getCurrentLegalDocument, type LegalDocType } from "@/lib/legal.functions";
import { LegalDocumentView } from "@/components/shared/legal-document-view";
import { formatTermsVersion } from "@/lib/terms-version";

const DESCRIPTION = "Read the full, current TalVault Terms & Conditions.";

export const Route = createFileRoute("/legal/terms/$type")({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (params.type !== "talent" && params.type !== "agency") throw notFound();
  },
  head: ({ params }) => {
    const title = `${params.type === "agency" ? "Agency" : "Talent"} Terms & Conditions — TalVault`;
    return {
      meta: [
        { title },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: title },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: TermsPage,
});

function TermsPage() {
  const { type } = Route.useParams();
  const q = useQuery({
    queryKey: ["legal-doc", type],
    queryFn: () => getCurrentLegalDocument({ data: { doc_type: type as LegalDocType } }),
    staleTime: Infinity,
  });
  const doc = q.data ?? null;
  return (
    <div className="tvp-legal-page">
      <article className="tvp-legal-doc-page">
        <header className="tvp-legal-head">
          <h1>TalVault Terms &amp; Conditions</h1>
          {doc && <p className="tvp-legal-date">{formatTermsVersion(doc.version)}</p>}
        </header>
        {doc ? (
          <LegalDocumentView body={doc.body} />
        ) : (
          <p>{q.isLoading ? "Loading the Terms & Conditions…" : "We couldn't load the Terms & Conditions just now. Please try again."}</p>
        )}
        <footer className="tvp-legal-foot">
          <Link to="/">Back to TalVault</Link>
        </footer>
      </article>
    </div>
  );
}
