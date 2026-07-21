import { handleAutomationDemoSms } from "../integrations/lead-automation/automation-demo";

export async function demoBusinessCardRoute(
  request: Request,
  env: any
): Promise<Response> {
  return handleAutomationDemoSms(request, env);
}
