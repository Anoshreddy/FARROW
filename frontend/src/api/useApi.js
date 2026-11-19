import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async fetcher on mount (and whenever deps change), tracking
// loading / error / data so pages don't each hand-roll the same logic.
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });

    fetcherRef.current()
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'success', data, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', data: null, error: err });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload };
}
