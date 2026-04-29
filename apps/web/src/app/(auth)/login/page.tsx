"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

type LoginState = { error: string } | null;

export default function LoginPage() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    async (_prev, fd) => (await loginAction(fd)) ?? null,
    null
  );

  return (
    <main className="mx-auto mt-20 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Sign in to InfluenceFlow</h1>
      <form action={formAction} className="space-y-4">
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className="w-full rounded border p-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className="w-full rounded border p-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="w-full rounded bg-black px-4 py-2 text-white">
          Sign in
        </button>
      </form>
    </main>
  );
}
