import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toContain("hunter2");
    expect(await verifyPassword(hash, "hunter2")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("produces argon2id hashes", async () => {
    const hash = await hashPassword("x");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });
});
