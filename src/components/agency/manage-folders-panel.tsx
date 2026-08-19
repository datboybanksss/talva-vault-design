import { useMemo, useState } from "react";
import { useMutation, useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Sparkles, CalendarClock, ToggleLeft } from "lucide-react";
import { toast } from "sonner";
import {
  listAgencyFolderSettings,
  upsertAgencyFolderSetting,
  resetAgencyFolderSettings,
} from "@/lib/agency.functions";
import { FOLDER_CATEGORIES, VALIDITY_RULE_PRESETS } from "@/lib/folder-taxonomy";
import { RowActionsMenu } from "@/components/shared/row-actions-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Setting = {
  id: string;
  folder_name: string;
  applied_by_default: boolean;
  ai_filing_allowed: boolean;
  default_validity_rule: string;
  can_untick_during_onboarding: boolean;
};

export const manageFoldersQO = queryOptions({
  queryKey: ["agency", "folder-settings"],
  queryFn: () =>
    listAgencyFolderSettings() as Promise<{ role: string; agencyId: string; settings: Setting[] }>,
});

/** Platform baseline merged with this agency's stored overrides. */
type Resolved = {
  name: string;
  appliedByDefault: boolean;
  aiFilingAllowed: boolean;
  validityRule: string;
  canUntick: boolean;
  recommended: boolean;
  /** True when this agency has moved the tick away from our recommendation. */
  customised: boolean;
};

function YesNo({ value }: { value: boolean }) {
  return (
    <span className={`tvp-pill ${value ? "tvp-pill-green" : "tvp-pill-muted"}`}>
      {value ? "Yes" : "No"}
    </span>
  );
}

export function ManageFoldersPanel() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(manageFoldersQO);
  const isOwner = data.role === "owner";

  const upsertFn = useServerFn(upsertAgencyFolderSetting);
  const resetFn = useServerFn(resetAgencyFolderSettings);

  const [ruleEditor, setRuleEditor] = useState<Resolved | null>(null);
  const [ruleDraft, setRuleDraft] = useState("");

  const rows: Resolved[] = useMemo(() => {
    const byName = new Map(data.settings.map((s) => [s.folder_name, s]));
    return FOLDER_CATEGORIES.map((base) => {
      const o = byName.get(base.name);
      const appliedByDefault = o?.applied_by_default ?? base.recommended;
      return {
        name: base.name,
        appliedByDefault,
        aiFilingAllowed: o?.ai_filing_allowed ?? base.aiFilingAllowed,
        validityRule: o?.default_validity_rule ?? base.defaultValidityRule,
        canUntick: o?.can_untick_during_onboarding ?? base.canUntickDuringOnboarding,
        recommended: base.recommended,
        customised: appliedByDefault !== base.recommended,
      };
    });
  }, [data.settings]);

  const save = useMutation({
    mutationFn: (input: Parameters<typeof upsertAgencyFolderSetting>[0] extends never ? never : any) =>
      upsertFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agency", "folder-settings"] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not save that change"),
  });

  const reset = useMutation({
    mutationFn: () => resetFn({ data: undefined as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agency", "folder-settings"] });
      toast.success("Folder selection reset to recommended");
    },
    onError: (e: any) => toast.error(e?.message ?? "Reset failed"),
  });

  function toggleDefault(row: Resolved) {
    if (!isOwner) return;
    save.mutate({ folder_name: row.name, applied_by_default: !row.appliedByDefault });
  }

  return (
    <div className="tvp-card" style={{ padding: 24 }}>
      <div className="tvp-row-between" style={{ alignItems: "flex-start", gap: 16 }}>
        <div>
          <h2 className="tvp-h2">Default Folder Selection</h2>
          <p className="tvp-muted" style={{ maxWidth: 640, marginTop: 4 }}>
            Tick the folders that should be pre-selected for every new Talent profile. These can
            still be unticked during individual Talent onboarding.
          </p>
        </div>
        <button
          type="button"
          className="tvp-linkbtn"
          disabled={!isOwner || reset.isPending}
          onClick={() => reset.mutate()}
          title={isOwner ? undefined : "Only the agency owner can change folder defaults"}
        >
          <RotateCcw size={14} /> Reset to recommended folders
        </button>
      </div>

      <div className="tvp-folder-grid" style={{ marginTop: 20 }}>
        {rows.map((row) => (
          <label
            key={row.name}
            className={`tvp-folder-card${row.customised ? " tvp-folder-card--custom" : ""}`}
          >
            <input
              type="checkbox"
              checked={row.appliedByDefault}
              disabled={!isOwner || save.isPending}
              onChange={() => toggleDefault(row)}
            />
            <span>
              <span className="tvp-folder-card__name">{row.name}</span>
              <span className="tvp-folder-card__meta">
                {row.customised
                  ? "Custom default folder"
                  : row.recommended
                    ? "Recommended default"
                    : "Optional default"}
              </span>
            </span>
          </label>
        ))}
      </div>

      <hr className="tvp-divider" style={{ margin: "28px 0 20px" }} />

      <h2 className="tvp-h2">Folder Rules</h2>
      <div className="tvp-table-wrap" style={{ marginTop: 12 }}>
        <table className="tvp-table">
          <thead>
            <tr>
              <th>Folder</th>
              <th>Applied By Default?</th>
              <th>AI Filing Allowed?</th>
              <th>Default Validity Rule</th>
              <th>Can Untick During Onboarding?</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                <td><YesNo value={row.appliedByDefault} /></td>
                <td><YesNo value={row.aiFilingAllowed} /></td>
                <td className="tvp-muted">{row.validityRule}</td>
                <td><YesNo value={row.canUntick} /></td>
                <td>
                  <RowActionsMenu
                    actions={[
                      isOwner && {
                        key: "ai",
                        label: row.aiFilingAllowed ? "Disallow AI filing" : "Allow AI filing",
                        icon: Sparkles,
                        onSelect: () =>
                          save.mutate({
                            folder_name: row.name,
                            ai_filing_allowed: !row.aiFilingAllowed,
                          }),
                      },
                      isOwner && {
                        key: "rule",
                        label: "Edit rule",
                        icon: CalendarClock,
                        onSelect: () => {
                          setRuleEditor(row);
                          setRuleDraft(row.validityRule);
                        },
                      },
                      isOwner && {
                        key: "untick",
                        label: row.canUntick
                          ? "Lock during onboarding"
                          : "Allow unticking during onboarding",
                        icon: ToggleLeft,
                        onSelect: () =>
                          save.mutate({
                            folder_name: row.name,
                            can_untick_during_onboarding: !row.canUntick,
                          }),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!ruleEditor} onOpenChange={(o) => !o && setRuleEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Default validity rule</DialogTitle>
            <DialogDescription>
              Applies to new documents filed into {ruleEditor?.name}.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "grid", gap: 8 }}>
            <select
              className="tvp-input"
              value={VALIDITY_RULE_PRESETS.includes(ruleDraft) ? ruleDraft : "__custom"}
              onChange={(e) => {
                if (e.target.value !== "__custom") setRuleDraft(e.target.value);
                else setRuleDraft("");
              }}
            >
              {VALIDITY_RULE_PRESETS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="__custom">Custom…</option>
            </select>
            <input
              className="tvp-input"
              value={ruleDraft}
              placeholder="e.g. 3 years"
              onChange={(e) => setRuleDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <button type="button" className="tvp-btn-ghost" onClick={() => setRuleEditor(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="tvp-btn"
              disabled={!ruleDraft.trim()}
              onClick={() => {
                save.mutate(
                  { folder_name: ruleEditor!.name, default_validity_rule: ruleDraft.trim() },
                  { onSuccess: () => { toast.success("Validity rule updated"); setRuleEditor(null); } },
                );
              }}
            >
              Save rule
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
