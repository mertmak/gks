import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';
import { socket } from '../api/socket';

const EMPTY_PARAMS = {};
const EMPTY_EVENTS = [];

// Used for complete lists; submitted params survive live refresh and reconnect.
export function useLiveList(endpoint, events = EMPTY_EVENTS, initialParams = EMPTY_PARAMS) {
  const [params, setParams] = useState(initialParams);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  const refresh = useCallback(() => {
    setState({ rows: [], loading: true, error: '' });
    setRevision(value => value + 1);
  }, []);
  const search = useCallback(filters => {
    setParams({ ...filters });
    refresh();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const options = { params, signal: controller.signal };
    const request = typeof endpoint === 'function' ? endpoint(options) : api.get(endpoint, options);
    request
      .then(response => {
        if (!controller.signal.aborted) setState({ rows: response.data, loading: false, error: '' });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ rows: [], loading: false, error: error.response?.data?.message || 'Liste yüklenemedi. Lütfen tekrar deneyin.' });
      });
    return () => controller.abort();
  }, [endpoint, params, revision]);

  useEffect(() => {
    const subscribed = [...new Set([...events, 'connect'])];
    subscribed.forEach(event => socket.on(event, refresh));
    return () => subscribed.forEach(event => socket.off(event, refresh));
  }, [events, refresh]);

  return { ...state, refresh, search };
}
