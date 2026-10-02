// One owner for submitted filters, page changes, reconnects and in-flight requests.
export function createPagedLoader(fetchPage, onChange) {
  let query = null;
  let pending = null;
  let revision = 0;
  const run = async () => {
    if (!query) return;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const current = ++revision;
    const params = { ...query };
    onChange({ loading: true, error: '', rows: [] });
    try {
      const result = await fetchPage(params, controller.signal);
      if (current !== revision || controller.signal.aborted) return;
      onChange({ rows: result.rows, pagination: result.pagination, searched: true });
    } catch (error) {
      if (current !== revision || controller.signal.aborted) return;
      onChange({ error: error.response?.data?.message || 'Liste yüklenemedi. Lütfen tekrar deneyin.' });
    } finally {
      if (current === revision && !controller.signal.aborted) onChange({ loading: false });
    }
  };
  return {
    search: filters => { query = { ...filters, page: 1, limit: 100 }; return run(); },
    page: page => { if (query) query = { ...query, page }; return run(); },
    refresh: run,
    cancel: () => { ++revision; pending?.abort(); }
  };
}
