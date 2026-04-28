import { getServerApiUrl } from "@/lib/api";

export async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(getServerApiUrl(path), { cache: "no-store" });

    if (!response.ok) {
      return fallback;
    }

    return response.json();
  } catch {
    return fallback;
  }
}
