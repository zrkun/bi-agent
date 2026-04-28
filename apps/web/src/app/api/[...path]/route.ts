import { getServerApiUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

function getProxyHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);

  for (const header of hopByHopHeaders) {
    headers.delete(header);
  }

  return headers;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const upstreamUrl = new URL(getServerApiUrl(path.join("/")));
  const requestUrl = new URL(request.url);

  upstreamUrl.search = requestUrl.search;

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: getProxyHeaders(request),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: "half",
    cache: "no-store",
  } as RequestInit & { duplex: "half" });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
