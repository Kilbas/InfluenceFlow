const HANDLE_RX = /^[a-z0-9._]{1,30}$/i;

export function normalizeInstagram(input: string | null | undefined): {
  handle: string;
  url: string;
} | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;

  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  s = s.replace(/^(www\.)?instagram\.com\//i, "");
  s = s.replace(/^@/, "");
  s = s.split("?")[0];
  s = s.replace(/\/+$/, "");
  s = s.toLowerCase();

  if (!HANDLE_RX.test(s)) return null;
  return { handle: s, url: `https://instagram.com/${s}` };
}
