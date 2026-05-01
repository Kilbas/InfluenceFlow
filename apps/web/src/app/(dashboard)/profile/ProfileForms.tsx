"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SmtpView = {
  host: string;
  port: number;
  username: string;
  senderName: string;
  senderEmail: string;
  isActive: boolean;
} | null;

export function ProfileForms({
  user,
  smtp,
  calibrationThreshold,
  rateLimitPerMember,
  todayCount,
}: {
  user: {
    email: string;
    displayName: string;
    approvedLettersCount: number;
    forcePreviewMode: boolean;
  };
  smtp: SmtpView;
  calibrationThreshold: number;
  rateLimitPerMember: number;
  todayCount: number;
}) {
  return (
    <div className="space-y-8">
      <Section title="Identity">
        <DisplayNameForm initial={user.displayName} email={user.email} />
      </Section>

      <Section title="Password">
        <PasswordForm />
      </Section>

      <Section title="SMTP">
        <SmtpForm initial={smtp} />
      </Section>

      <Section title="Calibration">
        <CalibrationForm
          initial={{
            approvedLettersCount: user.approvedLettersCount,
            forcePreviewMode: user.forcePreviewMode,
          }}
          threshold={calibrationThreshold}
        />
      </Section>

      <Section title="Today's send count">
        <p className="text-sm text-gray-700">
          Sent today: <strong>{todayCount}</strong> / {rateLimitPerMember}
        </p>
      </Section>
    </div>
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

function DisplayNameForm({ initial, email }: { initial: string; email: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? "Failed");
    else {
      setMsg("Saved");
      router.refresh();
    }
    setSubmitting(false);
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <p className="text-sm text-gray-500">Email: {email}</p>
      <label className="block text-sm">
        <div className="mb-1 text-gray-700">Display name</div>
        <input
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </label>
      <button
        type="submit"
        className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? "Saving…" : "Save"}
      </button>
      {msg && <p className="text-sm">{msg}</p>}
      <FormStyles />
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNewPwd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    const res = await fetch("/api/profile/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? "Failed");
    else {
      setMsg("Password updated");
      setCurrent("");
      setNewPwd("");
    }
    setSubmitting(false);
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block text-sm">
        <div className="mb-1 text-gray-700">Current password</div>
        <input
          className="input"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm">
        <div className="mb-1 text-gray-700">New password (min 8 chars)</div>
        <input
          className="input"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPwd(e.target.value)}
          minLength={8}
          required
        />
      </label>
      <button
        type="submit"
        className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? "Saving…" : "Change password"}
      </button>
      {msg && <p className="text-sm">{msg}</p>}
      <FormStyles />
    </form>
  );
}

function SmtpForm({ initial }: { initial: SmtpView }) {
  const router = useRouter();
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(initial?.port ?? 587);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [senderName, setSenderName] = useState(initial?.senderName ?? "");
  const [senderEmail, setSenderEmail] = useState(initial?.senderEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onTest(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/profile/smtp/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        host,
        port: Number(port),
        username,
        password,
        senderName,
        senderEmail,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Failed");
    } else {
      setMsg("Connected and saved");
      setPassword("");
      router.refresh();
    }
    setSubmitting(false);
  }

  return (
    <form className="space-y-3" onSubmit={onTest}>
      <div className="text-sm">
        Status:{" "}
        {initial?.isActive ? (
          <span className="rounded bg-green-100 px-1 text-xs">✓ Connected</span>
        ) : (
          <span className="rounded bg-gray-200 px-1 text-xs">Not configured</span>
        )}
      </div>
      <Field label="Host">
        <input
          className="input"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          required
        />
      </Field>
      <Field label="Port">
        <input
          className="input"
          type="number"
          min={1}
          max={65535}
          value={port}
          onChange={(e) => setPort(Number(e.target.value))}
          required
        />
      </Field>
      <Field label="Username">
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </Field>
      <Field label="Password">
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder={initial ? "Re-enter to update" : ""}
        />
      </Field>
      <Field label="Sender name">
        <input
          className="input"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          required
        />
      </Field>
      <Field label="Sender email">
        <input
          className="input"
          type="email"
          value={senderEmail}
          onChange={(e) => setSenderEmail(e.target.value)}
          required
        />
      </Field>
      <button
        type="submit"
        className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? "Testing…" : "Test connection & save"}
      </button>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <FormStyles />
    </form>
  );
}

function CalibrationForm({
  initial,
  threshold,
}: {
  initial: { approvedLettersCount: number; forcePreviewMode: boolean };
  threshold: number;
}) {
  const router = useRouter();
  const [forcePreview, setForcePreview] = useState(initial.forcePreviewMode);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function patch(payload: object) {
    setSubmitting(true);
    setMsg(null);
    const res = await fetch("/api/profile/calibration", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? "Failed");
    else {
      setMsg("Saved");
      router.refresh();
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Approved letters:{" "}
        <strong>
          {initial.approvedLettersCount} / {threshold}
        </strong>
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={forcePreview}
          onChange={(e) => {
            setForcePreview(e.target.checked);
            patch({ forcePreviewMode: e.target.checked });
          }}
          disabled={submitting}
        />
        Force preview mode (always require manual review)
      </label>
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
        onClick={() => {
          if (confirm("Reset approved letters counter to 0?")) {
            patch({ resetCounter: true });
          }
        }}
        disabled={submitting}
      >
        Reset counter
      </button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
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

function FormStyles() {
  return (
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
  );
}
