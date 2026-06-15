/**
 * Erişilebilirlik (WCAG 2.1 A/AA) — axe-core ile otomatik denetim.
 * Kurulum: npm i -D @axe-core/playwright
 * Çalıştırma: npx playwright test a11y
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = ['/', '/login'];

for (const path of pages) {
  test(`a11y: ${path} WCAG 2.1 AA ihlali yok`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    // Bilgi: tüm ihlalleri logla, kritik/ciddi olanlarda fail et.
    if (results.violations.length) {
      console.log(
        `${path} ihlaller:`,
        results.violations.map((v) => `${v.id}(${v.impact})`).join(', ')
      );
    }
    expect(critical, JSON.stringify(critical.map((v) => v.id), null, 2)).toEqual([]);
  });
}
