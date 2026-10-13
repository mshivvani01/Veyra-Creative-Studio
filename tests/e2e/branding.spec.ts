import { expect, test, type Page } from "@playwright/test";

const TAGLINE = "Your hands. Your imagination. Your canvas.";

async function imagesLoaded(page: Page, selector: string) {
  return page.$$eval(selector, (imgs) =>
    (imgs as HTMLImageElement[]).map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })),
  );
}

test.describe("Veyra branding", () => {
  test("document title, description and favicon", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Veyra — Your Hands. Your Imagination. Your Canvas.");
    const desc = await page.getAttribute('meta[name="description"]', "content");
    expect(desc).toContain("gesture-powered creative studio");
    const icon = await page.getAttribute('link[rel="icon"]', "href");
    expect(icon).toBe("/favicon.svg");
    for (const path of ["/favicon.svg", "/veyra-logo.svg", "/veyra-mark.svg"]) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"]).toContain("svg");
      expect(await res.text()).toContain("<svg");
    }
  });

  test("loader and How to Play show the Veyra logo and exact tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#loading-screen .brand-tagline")).toHaveText(TAGLINE);
    await expect(page.locator("#btn-start")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#onboarding-modal .brand-tagline")).toHaveText(TAGLINE);
    await expect(page.locator(".onboarding-logo")).toHaveAttribute("alt", "Veyra");
    expect(await imagesLoaded(page, ".onboarding-logo")).toEqual([{ src: "/veyra-logo.svg", ok: true }]);
  });

  test("studio shows the brand badge and no Air Draw / designer credit anywhere", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-start").click({ timeout: 60_000 });
    const logos = await imagesLoaded(page, "#brand-badge img");
    expect(logos.find((l) => l.src === "/veyra-logo.svg")?.ok).toBe(true);
    await expect(page.locator("#brand-badge .brand-badge-logo")).toBeVisible();

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/air\s*draw/i);
    expect(text).not.toMatch(/designed by|inspired by|built by|designs\.bhupesh/i);
    await expect(page.locator("#creator-handle")).toHaveCount(0);
  });

  test("uses the light ivory theme (no dark page background)", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-start").click({ timeout: 60_000 });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(247, 243, 238)");
    const toolbarBg = await page.evaluate(() => getComputedStyle(document.querySelector("#toolbar")!).backgroundColor);
    expect(toolbarBg).toBe("rgba(255, 255, 255, 0.9)");
  });

  test("mobile shows the compact mark and no horizontal overflow @mobile", async ({ page }) => {
    await page.goto("/");
    await page.locator("#btn-start").click({ timeout: 60_000 });
    await expect(page.locator("#brand-badge .brand-badge-mark")).toBeVisible();
    await expect(page.locator("#brand-badge .brand-badge-logo")).toBeHidden();
    const vp = page.viewportSize()!;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
    // The top bar fits on screen (the creator credit that used to sit beside it is gone).
    const bar = (await page.locator("#top-bar").boundingBox())!;
    expect(bar.x + bar.width).toBeLessThanOrEqual(vp.width);
    await expect(page.locator("#creator-handle")).toHaveCount(0);
  });
});
