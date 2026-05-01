import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "@/lib/encryption";

const VALID_KEY = "a".repeat(64); // 32 bytes as 64 hex chars

beforeEach(() => {
  process.env.ENCRYPTION_KEY = VALID_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe("encryption", () => {
  it("round-trips a string", () => {
    const plaintext = "super-secret-smtp-password";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const c1 = encrypt("same");
    const c2 = encrypt("same");
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe("same");
    expect(decrypt(c2)).toBe("same");
  });

  it("round-trips unicode and special chars", () => {
    const plaintext = "pässwörd!@#$%^&*()日本語";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY is not set");
    expect(() => decrypt("dGVzdA==")).toThrow("ENCRYPTION_KEY is not set");
  });

  it("throws when ENCRYPTION_KEY is wrong length", () => {
    process.env.ENCRYPTION_KEY = "aabbcc"; // too short
    expect(() => encrypt("x")).toThrow("32 bytes");
  });

  it("throws on tampered ciphertext (auth tag failure)", () => {
    const ciphertext = encrypt("hello");
    const buf = Buffer.from(ciphertext, "base64");
    // flip a byte in the ciphertext portion (after iv[12] + tag[16])
    buf[30] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on tampered IV", () => {
    const ciphertext = encrypt("hello");
    const buf = Buffer.from(ciphertext, "base64");
    buf[5] ^= 0xff; // flip a byte inside IV (0..11)
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const ciphertext = encrypt("hello");
    const buf = Buffer.from(ciphertext, "base64");
    buf[20] ^= 0xff; // flip a byte inside tag (12..27)
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });

  it("throws on ciphertext that is too short", () => {
    const short = Buffer.from("tooshort").toString("base64");
    expect(() => decrypt(short)).toThrow("too short");
  });

  it("throws when fed garbage input", () => {
    // 28 bytes of zeros — passes length check but auth tag is invalid
    const garbage = Buffer.alloc(28).toString("base64");
    expect(() => decrypt(garbage)).toThrow();
  });
});
