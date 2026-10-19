/**
 * "Analyse with AI" row action for documents still in Pending review. Offered
 * only when the signed-in person's own AI switch is on (canAnalyseWithAi). Runs
 * the analysis on request, then opens the filing popup with the result.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAiFilingPreference, startDocumentAnalysis } from "@/lib/ai-filing.functions";
import { canAnalyseWithAi } from "@/lib/document-ai-core";

export function useAnalyseWithAi(scope: "talent" | "agency") {
  const qc = useQueryClient();
  const prefFn = useServerFn(getAiFilingPreference);
  const startFn = useServerFn(startDocumentAnalysis);

  const pref = useQuery({
    queryKey: ["ai-filing-preference"],
    queryFn: () => prefFn(),
    staleTime: 60_000,
  });
  const aiEnabled = pref.data ? pref.data.aiEnabled !== false : undefined;

  const run = useMutation({
    mutationFn: async (doc: { id: string; name: string; open: () => void }) => {
      const view = await startFn({ data: { scope, document_id: doc.id } });
      return { doc, view };
    },
    onSuccess: ({ doc, view }) => {
      qc.setQueryData(["filing-analysis", scope, doc.id], view);
      doc.open();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start the analysis."),
  });

  return {
    aiEnabled,
    canAnalyse: (pendingReview: boolean | undefined) => canAnalyseWithAi(aiEnabled, pendingReview),
    analyse: run.mutate,
    isPending: run.isPending,
  };
}
