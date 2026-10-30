import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Fails on any WCAG 2.1 A / AA violation axe finds in the page as it is now (one theme). */
export async function expectAccessible(page: Page): Promise<void> {
  // A sheet or menu still fading in reads as low contrast.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.timeline !== document.timeline ||
          animation.effect?.getComputedTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(
    violations.flatMap(({ id, nodes }) =>
      nodes.map((node) => `${id}: ${node.target} ${node.any[0]?.message ?? ""}`),
    ),
  ).toEqual([]);
}
