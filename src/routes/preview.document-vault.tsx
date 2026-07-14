import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  VaultPage,
  docsQO,
  talentLinksQO,
  meQO,
} from "@/routes/agency.document-vault";

const qc = new QueryClient();

qc.setQueryData(docsQO.queryKey, [
  {
    id: "doc-1",
    name: "Passport.pdf",
    folder: "ID Documents",
    status: "filed",
    validityExpiresAt: new Date(Date.now() + 18 * 86400000).toISOString(),
    storagePath: "agency-1/talent-1/uuid-passport.pdf",
    talentLinkId: "talent-1",
    talentName: "Jane Doe",
    uploadedBy: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "doc-2",
    name: "Contract.pdf",
    folder: "Contracts",
    status: "needs_review",
    validityExpiresAt: null,
    storagePath: "agency-1/talent-1/uuid-contract.pdf",
    talentLinkId: "talent-1",
    talentName: "Jane Doe",
    uploadedBy: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]);

qc.setQueryData(talentLinksQO.queryKey, [
  { id: "talent-1", displayName: "Jane Doe" },
]);

qc.setQueryData(meQO.queryKey, { agency: { id: "agency-1" } });

export const Route = createFileRoute("/preview/document-vault")({
  component: () => (
    <QueryClientProvider client={qc}>
      <VaultPage />
    </QueryClientProvider>
  ),
});
