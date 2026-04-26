function getPagination(query, defaults = {}) {
  const defaultPageSize = defaults.defaultPageSize || 10;
  const maxPageSize = defaults.maxPageSize || 100;

  const requestedPage = Number.parseInt(query.page, 10);
  const requestedPageSize = Number.parseInt(query.pageSize, 10);

  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, maxPageSize)
    : defaultPageSize;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

module.exports = { getPagination };
