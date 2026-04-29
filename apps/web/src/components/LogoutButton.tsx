"use client";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="rounded border px-3 py-1"
    >
      Sign out
    </button>
  );
}
