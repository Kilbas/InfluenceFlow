"use client";
import { useState, useTransition } from "react";

export function AgentToggle({
  contactId,
  initial,
}: {
  contactId: string;
  initial: boolean;
}) {
  const [active, setActive] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle() {
    setMsg(null);
    const next = !active;
    startTransition(async () => {
      const res = await fetch(`/api/contacts/${contactId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (res.ok) {
        setActive(next);
      } else if (res.status === 409) {
        const { blockedBy } = (await res.json()) as { blockedBy: string };
        setMsg(`Already in work by ${blockedBy}`);
      } else {
        setMsg("Failed");
      }
    });
  }

  return (
    <span>
      <input type="checkbox" checked={active} disabled={pending} onChange={toggle} />
      {msg && <span className="ml-2 text-xs text-red-600">{msg}</span>}
    </span>
  );
}
