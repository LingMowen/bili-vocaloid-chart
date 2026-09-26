import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export function useApiQuery(key, path, options = {}) {
  return useQuery({
    queryKey: key,
    queryFn: () => api(path, { silent: true }),
    ...options,
  });
}

export function useApiQueryWithParams(key, path, params, options = {}) {
  return useQuery({
    queryKey: key,
    queryFn: () => {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v != null && v !== ""),
      ).toString();
      return api(qs ? `${path}?${qs}` : path, { silent: true });
    },
    ...options,
  });
}
