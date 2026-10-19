/**
 * "Organise documents with AI" — the per-user switch for filing suggestions.
 * Stored on the caller's own profile; when off, the filing review popup opens
 * in manual mode with nothing pre-filled and nothing labelled as a suggestion.
 */

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { getAiFilingPreference, setAiFilingPreference } from "@/lib/ai-filing.functions";
import { SectionHeader } from "@/components/account/section-header";

export function AiFilingPreferenceCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAiFilingPreference);
  const setFn = useServerFn(setAiFilingPreference);

  const pref = useQuery({
    queryKey: ["ai-filing-preference"],
    queryFn: () => getFn(),
    staleTime: 60_000,
  });

  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    if (pref.data) setEnabled(pref.data.aiEnabled !== false);
  }, [pref.data]);

  const save = useMutation({
    mutationFn: (next: boolean) => setFn({ data: { ai_filing_enabled: next } }),
    onSuccess: (_r, next) => {
      setEnabled(next);
      qc.invalidateQueries({ queryKey: ["ai-filing-preference"] });
      qc.removeQueries({ queryKey: ["filing-analysis"] });
      toast.success(next ? "Filing suggestions switched on." : "Filing suggestions switched off.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save this preference."),
  });

  return (
    <div className="tvp-card">
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        tone="purple"
        title="Preferences"
        subtitle="How TalVault helps you file newly uploaded documents."
      />
      <label
        className="tvp-doc-card"
        style={{ cursor: "pointer", marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={pref.isLoading || save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        <div>
          <strong>Organise documents with AI</strong>
          <div className="tvp-muted" style={{ fontSize: 12, marginTop: 2 }}>
            {enabled
              ? "When you upload a document, TalVault's AI reads it and suggests a folder and expiry date for you to check."
              : "Your documents are not sent for AI analysis. You choose the folder and expiry yourself."}
          </div>
          <div className="tvp-muted" style={{ fontSize: 11, marginTop: 4 }}>
            You can change this at any time. Documents you've already filed keep their saved details.
          </div>
        </div>
        <span className={`tvp-status tvp-${enabled ? "green" : "neutral"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </label>
    </div>
  );
}

export default AiFilingPreferenceCard;
