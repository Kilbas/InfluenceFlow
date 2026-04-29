import { test, expect } from "@playwright/test";

test("owner can sign in and reach import page", async ({ page }) => {
  await page.goto("/login");
  await page.fill("[name=email]", "owner@test.com");
  await page.fill("[name=password]", "test1234");
  await page.click("button:has-text('Sign in')");
  await expect(page).toHaveURL(/\/contacts/);

  await page.goto("/contacts/import");
  await expect(page.getByText("Download template.xlsx")).toBeVisible();
});
