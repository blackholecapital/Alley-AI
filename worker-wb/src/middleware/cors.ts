export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function preflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export function withResponseHeaders(
  response: Response,
  correlationId: string
): Response {
  const patched = new Response(response.body, response);

  patched.headers.set("x-correlation-id", correlationId);

  for (const [key, value] of Object.entries(corsHeaders)) {
    patched.headers.set(key, value);
  }

  return patched;
}
