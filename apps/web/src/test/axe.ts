/**
 * Automated accessibility checks with axe-core: the same rules engine used
 * by Lighthouse and many browser extensions. It finds problems like missing
 * labels, broken ARIA, duplicate ids, and skipped heading levels.
 */
import axe from "axe-core";

/**
 * Runs axe on the page (or part of it) and returns readable violations,
 * so a failing test says what's wrong and where. [] means none found.
 */
export async function axeViolations(root: Element = document.body): Promise<string[]> {
  const results = await axe.run(root, {
    rules: {
      // jsdom can't compute colors, so contrast is checked in a real browser instead.
      "color-contrast": { enabled: false },
    },
  });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} → ${violation.nodes
        .map((node) => node.target.join(" "))
        .join(", ")}`,
  );
}
