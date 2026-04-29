import { test, expect } from "@playwright/test";

test("owner invites a member, member accepts, lands signed in", async ({ page, context }) => {
  await page.goto("/login");
  await page.fill("[name=email]", "owner@test.com");
  await page.fill("[name=password]", "test1234");
  await page.click("button:has-text('Sign in')");
  await expect(page).toHaveURL(/\/contacts/);

  await page.goto("/team");
  await page.fill("[name=email]", `invitee-${Date.now()}@test.com`);
  await page.click("text=Generate invitation link");
  const link = await page.locator("code").first().innerText();
  expect(link).toMatch(/\/invite\//);

  const newPage = await context.newPage();
  await newPage.goto(link);
  await newPage.fill("[name=displayName]", "New Hire");
  await newPage.fill("[name=password]", "newhire12");
  await newPage.fill("[name=confirm]", "newhire12");
  await newPage.click("button:has-text('Create account')");
  await expect(newPage).toHaveURL(/\/contacts/);
});
