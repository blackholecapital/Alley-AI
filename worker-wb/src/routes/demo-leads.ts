import type { AppEnv } from "../types/env";

export async function demoLeadsRoute(env: AppEnv): Promise<Response> {
  if (!env.DEMO_LEADS) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "DEMO_LEADS KV binding is required",
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  }

  const listed = await env.DEMO_LEADS.list({ prefix: "lead:" });

  const leads = (
    await Promise.all(
      listed.keys.map(({ name }) =>
        env.DEMO_LEADS!.get<Record<string, unknown>>(name, "json")
      )
    )
  ).filter((lead): lead is Record<string, unknown> => Boolean(lead));

  leads.sort((a, b) =>
    String(b.timestamp || "").localeCompare(String(a.timestamp || ""))
  );

  return new Response(JSON.stringify({ ok: true, items: leads }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
