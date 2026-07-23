function pagination(query, defaultLimit = 30, maxLimit = 100) {
  const requested = Number(query.limit || defaultLimit);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), maxLimit) : defaultLimit;
  const rawCursor = Number(query.cursor || 0);
  const cursor = Number.isSafeInteger(rawCursor) && rawCursor > 0 ? rawCursor : null;
  return { cursor, limit };
}

function page(items, limit) {
  return {
    items,
    nextCursor: items.length === limit ? items[items.length - 1].id : null
  };
}

module.exports = { pagination, page };
