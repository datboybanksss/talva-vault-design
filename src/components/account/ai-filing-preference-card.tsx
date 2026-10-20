/**
 * "Organise documents with AI" — the per-user switch for filing suggestions.
 * Stored on the caller's own profile; when off, the filing review popup opens
 * in manual mode with nothing pre-filled and nothing labelled as a suggestion.
 */

import { useId } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { getAiFilingPreference, setAiFilingPreference } from "@/lib/ai-filing.functions";
import { Switch } from "@/components/ui/switch";
import { syncAiFilingPreference } from "@/lib/ai-filing-cache";
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

  const switchId = useId();
  const enabled = pref.data?.aiEnabled === true;

  const save = useMutation({
    mutationFn: (next: boolean) => setFn({ data: { ai_filing_enabled: next } }),
    onSuccess: async (_r, next) => {
      await syncAiFilingPreference(qc, next);
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
      <div className="tvp-list-item tvp-ai-preference">
        <Switch id={switchId} checked={enabled}
          disabled={!pref.data || save.isPending}
          onCheckedChange={(next) => save.mutate(next)} />
        <div>
          <label htmlFor={switchId}><strong>Organise documents with AI</strong></label>
          <div className="tvp-muted tvp-preference-copy">
            {enabled
              ? "When you upload a document, TalVault's AI reads it and suggests a folder and expiry date for you to check."
              : "Your documents are not sent for AI analysis. You choose the folder and expiry yourself."}
          </div>
          <div className="tvp-muted tvp-preference-meta">
            You can change this at any time. Documents you've already filed keep their saved details.
          </div>
        </div>
        <span className={`tvp-status tvp-${enabled ? "green" : "neutral"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </div>
    </div>
  );
}

export default AiFilingPreferenceCard;
