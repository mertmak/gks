export function createLatestRequest() {
  let pending;
  const cancel = () => pending?.abort();
  return {
    cancel,
    async run(request) {
      cancel();
      const controller = new AbortController();
      pending = controller;
      try {
        const value = await request(controller.signal);
        return controller.signal.aborted ? undefined : value;
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    }
  };
}
