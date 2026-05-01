"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TONE_VALUES } from "@/server/briefs";

export type BriefFormValues = {
  name: string;
  productDescription: string;
  audienceOverlap: string;
  whyWorkWithUs: string;
  keyProductBenefits: string;
  desiredFormat: string;
  senderRole: string;
  acceptsBarter: boolean;
  barterOffer: string;
  acceptsPaid: boolean;
  paidBudgetRange: string;
  toneOfVoice: (typeof TONE_VALUES)[number];
  letterLanguage: string;
  forbiddenPhrases: string;
  noPriceFirstEmail: boolean;
  landingUrl: string;
  promoCode: string;
};

const EMPTY: BriefFormValues = {
  name: "",
  productDescription: "",
  audienceOverlap: "",
  whyWorkWithUs: "",
  keyProductBenefits: "",
  desiredFormat: "",
  senderRole: "",
  acceptsBarter: true,
  barterOffer: "",
  acceptsPaid: false,
  paidBudgetRange: "",
  toneOfVoice: "friendly",
  letterLanguage: "auto",
  forbiddenPhrases: "",
  noPriceFirstEmail: true,
  landingUrl: "",
  promoCode: "",
};

export function BriefForm({
  initial,
  briefId,
  canEdit = true,
  canArchive = false,
  initiallyArchived = false,
}: {
  initial?: Partial<BriefFormValues>;
  briefId?: string;
  canEdit?: boolean;
  canArchive?: boolean;
  initiallyArchived?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BriefFormValues>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof BriefFormValues>(
    key: K,
    value: BriefFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const payload = {
      name: values.name,
      productDescription: values.productDescription,
      audienceOverlap: values.audienceOverlap,
      whyWorkWithUs: values.whyWorkWithUs,
      keyProductBenefits: values.keyProductBenefits,
      desiredFormat: values.desiredFormat,
      senderRole: values.senderRole,
      acceptsBarter: values.acceptsBarter,
      barterOffer: values.barterOffer.trim() || null,
      acceptsPaid: values.acceptsPaid,
      paidBudgetRange: values.paidBudgetRange.trim() || null,
      toneOfVoice: values.toneOfVoice,
      letterLanguage: values.letterLanguage.trim() || "auto",
      forbiddenPhrases: values.forbiddenPhrases
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      noPriceFirstEmail: values.noPriceFirstEmail,
      landingUrl: values.landingUrl.trim() || null,
      promoCode: values.promoCode.trim() || null,
    };

    const url = briefId ? `/api/briefs/${briefId}` : "/api/briefs";
    const method = briefId ? "PATCH" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
        setSubmitting(false);
        return;
      }
      router.push("/briefs");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  async function onArchive() {
    if (!briefId) return;
    if (!confirm("Archive this brief? It will be hidden from the active list.")) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/briefs/${briefId}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to archive");
        setSubmitting(false);
        return;
      }
      router.push("/briefs");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  const disabled = !canEdit || submitting;

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {error && (
        <div className="rounded bg-red-100 p-2 text-sm text-red-800">{error}</div>
      )}

      <Section title="Identity">
        <Field label="Name *">
          <input
            className="input"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            required
            disabled={disabled}
          />
        </Field>
        <Field label="Sender role *">
          <input
            className="input"
            value={values.senderRole}
            onChange={(e) => update("senderRole", e.target.value)}
            placeholder="e.g. Partnership Lead"
            required
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Product">
        <Field label="Product description *">
          <textarea
            className="input"
            rows={3}
            value={values.productDescription}
            onChange={(e) => update("productDescription", e.target.value)}
            required
            disabled={disabled}
          />
        </Field>
        <Field label="Audience overlap *">
          <textarea
            className="input"
            rows={3}
            value={values.audienceOverlap}
            onChange={(e) => update("audienceOverlap", e.target.value)}
            required
            disabled={disabled}
          />
        </Field>
        <Field label="Why work with us *">
          <textarea
            className="input"
            rows={3}
            value={values.whyWorkWithUs}
            onChange={(e) => update("whyWorkWithUs", e.target.value)}
            required
            disabled={disabled}
          />
        </Field>
        <Field label="Key product benefits *">
          <textarea
            className="input"
            rows={3}
            value={values.keyProductBenefits}
            onChange={(e) => update("keyProductBenefits", e.target.value)}
            required
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Partnership">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.acceptsBarter}
            onChange={(e) => update("acceptsBarter", e.target.checked)}
            disabled={disabled}
          />
          Accepts barter
        </label>
        {values.acceptsBarter && (
          <Field label="Barter offer">
            <textarea
              className="input"
              rows={2}
              value={values.barterOffer}
              onChange={(e) => update("barterOffer", e.target.value)}
              disabled={disabled}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.acceptsPaid}
            onChange={(e) => update("acceptsPaid", e.target.checked)}
            disabled={disabled}
          />
          Accepts paid
        </label>
        {values.acceptsPaid && (
          <Field label="Paid budget range">
            <input
              className="input"
              value={values.paidBudgetRange}
              onChange={(e) => update("paidBudgetRange", e.target.value)}
              placeholder="e.g. $500–$1500"
              disabled={disabled}
            />
          </Field>
        )}
        <Field label="Desired format *">
          <textarea
            className="input"
            rows={2}
            value={values.desiredFormat}
            onChange={(e) => update("desiredFormat", e.target.value)}
            required
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Style">
        <Field label="Tone of voice">
          <select
            className="input"
            value={values.toneOfVoice}
            onChange={(e) =>
              update("toneOfVoice", e.target.value as BriefFormValues["toneOfVoice"])
            }
            disabled={disabled}
          >
            {TONE_VALUES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Letter language">
          <input
            className="input"
            value={values.letterLanguage}
            onChange={(e) => update("letterLanguage", e.target.value)}
            placeholder="auto, en, ru, ..."
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Constraints">
        <Field label="Forbidden phrases (one per line)">
          <textarea
            className="input"
            rows={3}
            value={values.forbiddenPhrases}
            onChange={(e) => update("forbiddenPhrases", e.target.value)}
            disabled={disabled}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.noPriceFirstEmail}
            onChange={(e) => update("noPriceFirstEmail", e.target.checked)}
            disabled={disabled}
          />
          No specific prices in the first email
        </label>
      </Section>

      <Section title="Optional">
        <Field label="Landing URL">
          <input
            className="input"
            type="url"
            value={values.landingUrl}
            onChange={(e) => update("landingUrl", e.target.value)}
            placeholder="https://example.com"
            disabled={disabled}
          />
        </Field>
        <Field label="Promo code">
          <input
            className="input"
            value={values.promoCode}
            onChange={(e) => update("promoCode", e.target.value)}
            disabled={disabled}
          />
        </Field>
      </Section>

      <div className="flex gap-2">
        {canEdit && (
          <button
            type="submit"
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Saving…" : briefId ? "Save changes" : "Create brief"}
          </button>
        )}
        {canArchive && briefId && !initiallyArchived && (
          <button
            type="button"
            onClick={onArchive}
            className="rounded border border-red-500 px-4 py-2 text-sm text-red-600 disabled:opacity-50"
            disabled={submitting}
          >
            Archive
          </button>
        )}
        {!canEdit && (
          <p className="text-sm text-gray-500">
            Only the creator or an admin can edit this brief.
          </p>
        )}
      </div>

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
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
