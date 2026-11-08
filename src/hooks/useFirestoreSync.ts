"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reusable hook for Firestore realtime subscriptions.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useFirestoreSync({
 *     subscribe: (onData) => unsubscribeFn,
 *     deps: [requestId],
 *   });
 *
 * The subscribe function is called whenever `deps` change.
 * It should return an unsubscribe function.
 */
export default function useFirestoreSync<Data = unknown>({
  subscribe,
  deps = [],
}: {
  subscribe: (onData: (data: Data) => void) => () => void;
  deps?: React.DependencyList;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setError(null);

    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribe((snapshotData) => {
        if (!mountedRef.current) return;
        setData(snapshotData);
        setLoading(false);
        setError(null);
      });
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
      }
    }

    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [...deps]);

  return { data, loading, error };
}
