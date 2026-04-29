import { test, expect } from "@playwright/test";

test("unauthenticated user is redirected from /contacts to /login", async ({ page }) => {
  await page.goto("/contacts");
  await expect(page).toHaveURL(/\/login/);
});
