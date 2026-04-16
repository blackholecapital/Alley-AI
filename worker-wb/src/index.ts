/**
 * ALI-ai Worker — Cloudflare Worker entrypoint
 *
 * Deployment root: /worker-wb
 * Ref: S5A.2 — Cloudflare Worker runtime patch
 *
 * This Worker exposes the chassis runtime over HTTP.
 * Routes:
 *   GET  /           → health / welcome
 *   GET  /health     → structured health check
 *   POST /api/proof  → run proof adapters (placeholder)
 *   *    *           → 404
 */

export interface Env {
  // Secrets injected via .dev.vars (local) or Cloudflare dashboard (prod).
  // Add bindings here as the runtime grows.
  // Example:
  //   CHASSIS_KV: KVNamespace;
  //   CHASSIS_DB: D1Database;
  ENVIRONMENT?: string;
}

// ── request router ──────────────────────────────────────────────────

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // --- health / root ------------------------------------------------
  if (pathname === "/" || pathname === "/health") {
    return Response.json({
      status: "ok",
      worker: "ali-ai-worker-wb",
      environment: env.ENVIRONMENT ?? "development",
      timestamp: new Date().toISOString(),
    });
  }

  // --- proof API placeholder ----------------------------------------
  if (pathname === "/api/proof" && request.method === "POST") {
    return handleProofRequest(request, env);
  }

  // --- 404 fallthrough ----------------------------------------------
  return Response.json(
    { error: "not_found", path: pathname },
    { status: 404 },
  );
}

// ── proof handler (placeholder) ─────────────────────────────────────

async function handleProofRequest(
  _request: Request,
  env: Env,
): Promise<Response> {
  // Placeholder — wire proof-chassis adapters here once packages are
  // bundled into the Worker. For now, return a structured demo response
  // so the endpoint shape is exercisable.
  return Response.json({
    proof_kind: "proof.aggregate",
    consumption_point: "consume.shell_operator",
    passed: true,
    results: [],
    environment: env.ENVIRONMENT ?? "development",
    note: "placeholder — proof adapters not yet wired",
  });
}

// ── Worker fetch handler ────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
