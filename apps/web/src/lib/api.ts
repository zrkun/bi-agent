const apiUrl = process.env.API_URL || "http://localhost:8000";

export const clientApiPath = "/api";

export function getServerApiUrl(path: string): string {
  return `${apiUrl}/api${path.startsWith("/") ? path : `/${path}`}`;
}

export function getClientApiPath(path: string): string {
  return `${clientApiPath}${path.startsWith("/") ? path : `/${path}`}`;
}
