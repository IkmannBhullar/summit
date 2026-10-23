import { useEffect } from "react";

/**
 * Sets the browser tab's title, e.g. "Your stats · Summit". Screen readers
 * announce it when a page opens, so each page needs its own (WCAG 2.4.2).
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Summit`;
  }, [title]);
}
