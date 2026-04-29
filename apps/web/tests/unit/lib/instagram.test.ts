import { describe, it, expect } from "vitest";
import { normalizeInstagram } from "@/lib/instagram";

describe("normalizeInstagram", () => {
  const cases: [string, { handle: string; url: string } | null][] = [
    ["@johndoe", { handle: "johndoe", url: "https://instagram.com/johndoe" }],
    ["JohnDoe", { handle: "johndoe", url: "https://instagram.com/johndoe" }],
    ["instagram.com/JohnDoe", { handle: "johndoe", url: "https://instagram.com/johndoe" }],
    ["https://instagram.com/JohnDoe/", { handle: "johndoe", url: "https://instagram.com/johndoe" }],
    ["https://www.instagram.com/JohnDoe?hl=en", { handle: "johndoe", url: "https://instagram.com/johndoe" }],
    ["  @johndoe  ", { handle: "johndoe", url: "https://instagram.com/johndoe" }],
    ["", null],
    ["   ", null],
    ["not a handle 😀", null],
  ];

  for (const [input, expected] of cases) {
    it(`normalizes "${input}"`, () => {
      expect(normalizeInstagram(input)).toEqual(expected);
    });
  }
});
