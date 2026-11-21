"use client";

import { useState } from "react";
import { Check, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ApiRequestError, apiFetch } from "@/lib/api";
import type { Preferences } from "@/lib/types";
import { queryKey } from "@/lib/use-api";

type BoolKey = "analysisCompleted" | "remediationEvents" | "ciEvents" | "digestLowPriority";

const topics: [BoolKey, string, string][] = [
  ["analysisCompleted", "Analysis reports", "A repository scan finished, with a summary of what it found."],
  ["remediationEvents", "Remediation events", "A fix PR was opened or merged, or a fix was verified."],
  ["ciEvents", "CI results", "CI passed or failed on a remediation PR."],
];

const levels: { value: Preferences["minSeverity"]; label: string; hint: string }[] = [
  { value: "critical", label: "Critical", hint: "Only critical findings are emailed." },
  { value: "high", label: "High+", hint: "High and critical findings are emailed." },
  { value: "medium", label: "Medium+", hint: "Medium, high and critical findings are emailed." },
  { value: "low", label: "Everything", hint: "Every finding, including low severity, is emailed." },
];

function Row({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p id={`${id}-l`} className="text-sm font-medium">{title}</p>
        <p id={`${id}-d`} className="text-xs text-muted-foreground text-pretty">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function PreferencesForm({ initial, email }: { initial: Preferences; email?: string }) {
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(initial);
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = (Object.keys(prefs) as (keyof Preferences)[]).some((k) => prefs[k] !== baseline[k]);
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => { setPrefs((p) => ({ ...p, [k]: v })); setSaved(false); };
  const off = !prefs.emailEnabled;

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await apiFetch("/notifications/preferences", { method: "PATCH", body: JSON.stringify(prefs) });
      client.setQueryData(queryKey("/notifications/preferences"), { preferences: prefs });
      setBaseline(prefs);
      setSaved(true);
    } catch (e) { setError(e instanceof ApiRequestError ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Row id="master" title="Email notifications" hint={email ? `Sent to ${email}. Everything is always available in the in-app feed.` : "Everything is always available in the in-app feed."}>
        <Switch checked={prefs.emailEnabled} onChange={(v) => set("emailEnabled", v)} aria-labelledby="master-l" aria-describedby="master-d" />
      </Row>

      <fieldset disabled={off} className="divide-y border-t disabled:opacity-50 [&>*]:px-0">
        <div className="py-3">
          <p className="mb-2 text-sm font-medium" id="sev-l">Minimum severity for email alerts</p>
          <div role="radiogroup" aria-labelledby="sev-l" className="inline-flex rounded-lg border bg-muted/50 p-0.5">
            {levels.map((l) => (
              <button key={l.value} type="button" role="radio" aria-checked={prefs.minSeverity === l.value} onClick={() => set("minSeverity", l.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${prefs.minSeverity === l.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{levels.find((l) => l.value === prefs.minSeverity)?.hint}</p>
        </div>
        {topics.map(([key, title, hint]) => (
          <Row key={key} id={key} title={title} hint={hint}>
            <Switch checked={prefs[key]} onChange={(v) => set(key, v)} aria-labelledby={`${key}-l`} aria-describedby={`${key}-d`} />
          </Row>
        ))}
        <Row id="digest" title="Keep low-priority items in-app" hint="Low and informational items are not emailed one by one.">
          <Switch checked={prefs.digestLowPriority} onChange={(v) => set("digestLowPriority", v)} aria-labelledby="digest-l" aria-describedby="digest-d" />
        </Row>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={saving || !dirty}>{saving ? <Spinner data-icon="inline-start" /> : <Mail data-icon="inline-start" />}{saving ? "Saving…" : "Save changes"}</Button>
        <Button type="button" variant="ghost" disabled={saving || !dirty} onClick={() => { setPrefs(baseline); setError(null); }}>Discard</Button>
        {dirty && !saving && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        {saved && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-600" role="status"><Check className="size-4" />Saved</span>}
        {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
