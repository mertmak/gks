import { useEffect, useMemo } from 'react';
import { createLatestRequest } from '../utils/latestRequest';

export function useLatestRequest() {
  const request = useMemo(() => createLatestRequest(), []);
  useEffect(() => () => request.cancel(), [request]);
  return request;
}
