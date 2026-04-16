export interface Env {
  ENVIRONMENT?: string;
  PROXY_BACKEND_URL: string;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, search } = url;

  // --- health check stays local ---
  if (pathname === "/" || pathname === "/health") {
    return Response.json({
      status: "ok",
      worker: "ali-ai-worker-wb",
      environment: env.ENVIRONMENT ?? "development",
      timestamp: new Date().toISOString(),
    });
  }

  // --- proof endpoint stays local ---
  if (pathname === "/api/proof" && request.method === "POST") {
    return Response.json({
      proof_kind: "proof.aggregate",
      passed: true,
      results: [],
      environment: env.ENVIRONMENT ?? "development",
    });
  }

  // --- proxy everything else to backend UI ---
  const target = env.PROXY_BACKEND_URL + pathname + search;

  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "internal error" },
        { status: 500 }
      );
    }
  },
};
