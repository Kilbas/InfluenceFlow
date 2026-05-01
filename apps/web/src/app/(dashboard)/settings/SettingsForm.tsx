"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LETTER_MODELS, SUMMARIZE_MODELS } from "@/server/workspace-settings";

type Initial = {
  letterModel: string;
  summarizeModel: string;
  trackingEnabled: boolean;
  rateLimitPerMember: number;
  calibrationThreshold: number;
  defaultBriefId: string | null;
};

export function SettingsForm({
  initial,
  canEdit,
  briefs,
}: {
  initial: Initial;
  canEdit: boolean;
  briefs: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState<Initial>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function up<K extends keyof Initial>(k: K, val: Initial[K]) {
    setV((s) => ({ ...s, [k]: val }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/workspace/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        letterModel: v.letterModel,
        summarizeModel: v.summarizeModel,
        trackingEnabled: v.trackingEnabled,
        rateLimitPerMember: v.rateLimitPerMember,
        calibrationThreshold: v.calibrationThreshold,
        defaultBriefId: v.defaultBriefId,
      }),
    });
    const json = await res.json();
    if (!res.ok) setErr(json.error ?? "Failed");
    else {
      setMsg("Saved");
      router.refresh();
    }
    setSubmitting(false);
  }

  const disabled = !canEdit || submitting;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {!canEdit && (
        <p className="rounded bg-amber-100 p-2 text-sm text-amber-900">
          Read-only: only admin or owner can change workspace settings.
        </p>
      )}

      <Field label="Letter model">
        <select
          className="input"
          value={v.letterModel}
          onChange={(e) => up("letterModel", e.target.value)}
          disabled={disabled}
        >
          {LETTER_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Summarize model">
        <select
          className="input"
          value={v.summarizeModel}
          onChange={(e) => up("summarizeModel", e.target.value)}
          disabled={disabled}
        >
          {SUMMARIZE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Daily rate limit per member">
        <input
          className="input"
          type="number"
          min={1}
          max={10000}
          value={v.rateLimitPerMember}
          onChange={(e) => up("rateLimitPerMember", Number(e.target.value))}
          disabled={disabled}
        />
      </Field>

      <Field label="Calibration threshold">
        <input
          className="input"
          type="number"
          min={0}
          max={10000}
          value={v.calibrationThreshold}
          onChange={(e) => up("calibrationThreshold", Number(e.target.value))}
          disabled={disabled}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={v.trackingEnabled}
          onChange={(e) => up("trackingEnabled", e.target.checked)}
          disabled={disabled}
        />
        Enable open-tracking pixel
      </label>

      <Field label="Default brief">
        <select
          className="input"
          value={v.defaultBriefId ?? ""}
          onChange={(e) =>
            up("defaultBriefId", e.target.value === "" ? null : e.target.value)
          }
          disabled={disabled}
        >
          <option value="">— none —</option>
          {briefs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>

      {canEdit && (
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <style>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          padding: 6px 8px;
          font-size: 14px;
        }
        .input:disabled { background: #f3f4f6; }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-gray-700">{label}</div>
      {children}
    </label>
  );
}
