export async function demoLeadsRoute(env: any): Promise<Response> {
  if (!env.DEMO_LEADS) {
    return new Response(JSON.stringify({ ok: false, error: "DEMO_LEADS KV binding is required" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const listed = await env.DEMO_LEADS.list({ prefix: "lead:" });
  const leads = (
    await Promise.all(
      listed.keys.map(async ({ name }: { name: string }) => {
        const value = await env.DEMO_LEADS.get(name, "json");
        return value;
      }),
    )
  ).filter(Boolean);

  leads.sort((a: any, b: any) =>
    String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")),
  );

  return new Response(JSON.stringify({ ok: true, items: leads }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
