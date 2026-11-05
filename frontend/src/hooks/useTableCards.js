// Every list in this app is an HTML table. On a phone a table is the wrong
// shape: eight columns in 375px either overflow sideways or squeeze each
// figure into a two-character column.
//
// Rather than rewrite 34 tables into a card component — and have the two
// drift apart — the table stays the single source of truth and CSS restacks
// each row into a card on narrow screens (see `.app-table` in index.css).
// A stacked cell on its own is a naked value, so this hook copies the column
// heading onto each cell as `data-label`, which the CSS prints beside it.
//
// It runs once on mount and then on DOM changes: the lists are fetched, so
// the rows do not exist yet when the page first mounts.
import { useEffect } from "react";

const SKIP = "table-plain";

export function labelTableCells(root = document) {
  const tables = root.querySelectorAll
    ? root.querySelectorAll(`table.app-table:not(.${SKIP})`)
    : [];
  tables.forEach((table) => {
    // Only the first header row — a grouped header would label every cell
    // with the group name.
    const headRow = table.querySelector("thead tr");
    if (!headRow) return;
    const heads = Array.from(headRow.children).map((th) =>
      (th.textContent || "").trim().replace(/\s+/g, " ")
    );
    if (!heads.some(Boolean)) return;
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const cells = Array.from(tr.children);
      // A single cell spanning the table is an empty state or a total line,
      // not a field; labelling it would read "Date: No invoices yet".
      if (cells.length === 1 && cells[0].colSpan > 1) {
        tr.setAttribute("data-row-span", "1");
        return;
      }
      cells.forEach((cell, i) => {
        if (cell.colSpan > 1) return;
        const head = heads[i];
        if (!head) {
          // An unlabelled column is almost always the actions column.
          if (!cell.hasAttribute("data-label")) cell.setAttribute("data-label", "");
          return;
        }
        if (cell.getAttribute("data-label") !== head) cell.setAttribute("data-label", head);
      });
    });
  });
}

export default function useTableCards() {
  useEffect(() => {
    let queued = false;
    const run = () => {
      queued = false;
      labelTableCells(document);
    };
    run();
    // childList only: setAttribute does not fire it, so labelling cannot
    // retrigger the observer.
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(run);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
}
