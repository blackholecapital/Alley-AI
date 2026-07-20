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

  const items = leads.map((lead) => ({
    // Preserve everything already stored in KV
    ...lead,

    // Stable identifiers
    id: String(lead.leadId ?? lead.id ?? ""),
    leadId: String(lead.leadId ?? lead.id ?? ""),

    // DealTile compatibility
    stage: "New Lead",
    status: "New Lead",

    // Display fields
    title: String(lead.interest ?? lead.name ?? "New Lead"),
    name: String(lead.name ?? ""),
    contact_name: String(lead.name ?? ""),
    company_name: String(lead.company ?? ""),
    owner_name: String(lead.owner ?? ""),

    email: String(lead.email ?? ""),
    phone: String(lead.phone ?? ""),

    // Numeric defaults
    value: 0,
    probability: 0,

    // Flags
    is_demo_lead: true,
    lifecycle_stage: "prospect",
  }));

  return new Response(
    JSON.stringify({
      ok: true,
      items,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }
  );
}
