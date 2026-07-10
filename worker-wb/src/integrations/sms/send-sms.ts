export interface SmsEnv {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SMS_FROM?: string;
}

export interface SmsResult {
  sid?: string;
  status?: string;
  [key: string]: unknown;
}

export async function sendSms(
  env: SmsEnv,
  to: string,
  body: string
): Promise<SmsResult> {
  if (!env.TWILIO_ACCOUNT_SID) {
    throw new Error("Missing TWILIO_ACCOUNT_SID");
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    throw new Error("Missing TWILIO_AUTH_TOKEN");
  }

  if (!env.TWILIO_SMS_FROM) {
    throw new Error("Missing TWILIO_SMS_FROM");
  }

  if (!to) {
    throw new Error("Missing destination phone number");
  }

  const url =
    `https://api.twilio.com/2010-04-01/Accounts/` +
    `${env.TWILIO_ACCOUNT_SID}/Messages.json`;

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("From", env.TWILIO_SMS_FROM);
  form.set("Body", body);

  const auth = btoa(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Twilio SMS failed: ${response.status} ${responseText}`
    );
  }

  try {
    return JSON.parse(responseText) as SmsResult;
  } catch {
    return { raw: responseText };
  }
}
