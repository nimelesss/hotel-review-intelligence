"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/shared/lib/http";

interface AsyncState<T> {
  data?: T;
  loading: boolean;
  error?: string;
}

export function useApi<T>(url: string): AsyncState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<AsyncState<T>>({
    loading: true
  });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const data = await fetchJson<T>(url);
      setState({
        data,
        loading: false
      });
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : "Ошибка загрузки"
      });
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    ...state,
    refetch: load
  };
}
