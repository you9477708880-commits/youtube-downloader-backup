export const DEFAULT_PAGE_SIZE = 50;

export function paginateList(items, requestedPage = 0, pageSize = DEFAULT_PAGE_SIZE) {
  const size = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pageCount - 1, Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0));
  const offset = page * size;
  return { items: items.slice(offset, offset + size), page, pageCount, total: items.length, start: items.length ? offset + 1 : 0, end: Math.min(items.length, offset + size) };
}

export function renderListPagination(pagination) {
  if (pagination.pageCount <= 1) return "";
  return `<nav aria-label="交易明細分頁" class="mb-2">
    <div class="text-xs text-gray" aria-live="polite">共 ${pagination.total} 筆｜顯示 ${pagination.start}–${pagination.end} 筆｜第 ${pagination.page + 1} / ${pagination.pageCount} 頁</div>
    <div class="flex-row gap-2 mt-1">
      <button type="button" class="sbtn outline compact" data-list-page="previous" ${pagination.page === 0 ? "disabled" : ""}>上一頁</button>
      <button type="button" class="sbtn outline compact" data-list-page="next" ${pagination.page + 1 === pagination.pageCount ? "disabled" : ""}>下一頁</button>
    </div>
  </nav>`;
}

export function focusListPageControl(container, direction) {
  const preferred = container.querySelector(`[data-list-page="${direction}"]`);
  const target = preferred?.disabled ? container.querySelector("[data-list-page]:not(:disabled)") : preferred;
  target?.focus({ preventScroll: true });
}
