import { sendEmail } from "../email/send-email";
import { sendSms } from "../sms/send-sms";
import { branding, welcomeEmail } from "../../templates/ace-host";

export async function handleAutomationDemoSms(request: Request, env: any) {
  const body: Record<string, unknown> =
    (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const lead = {
    leadId: typeof body["leadId"] === "string" && body["leadId"] ? body["leadId"] : `XYZ-${Date.now()}`,
    owner: typeof body["owner"] === "string" && body["owner"] ? body["owner"] : "cj",
    name: typeof body["name"] === "string" && body["name"] ? body["name"] : "Demo Lead",
    company: typeof body["company"] === "string" && body["company"] ? body["company"] : "Unknown Company",
    email: typeof body["email"] === "string" ? body["email"] : "",
    phone: typeof body["phone"] === "string" ? body["phone"] : "",
    interest: typeof body["interest"] === "string" && body["interest"] ? body["interest"] : "AI Automation",
    source: typeof body["source"] === "string" && body["source"] ? body["source"] : "Website Demo"
  };

  const notifyTo = env.NOTIFY_CJ;

  await sendSms(
    env,
    notifyTo,
`${branding.company}

New AI Automation Lead

Name: ${lead.name}
Company: ${lead.company}
Email: ${lead.email}
Phone: ${lead.phone}

Interest: ${lead.interest}
`
  );

  if (lead.email) {
    await sendEmail(env, {
      to: lead.email,
      subject: `Thanks for contacting ${branding.company}`,
      html: welcomeEmail(lead),
      text: `Thanks for contacting ${branding.company}.`
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      leadId: lead.leadId
    }),
    {
      headers: {
        "content-type": "application/json"
      }
    }
  );
}
