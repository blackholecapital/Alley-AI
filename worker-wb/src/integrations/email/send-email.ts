export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailResult {
  id?: string;
  [key: string]: unknown;
}

export async function sendEmail(
  env: EmailEnv,
  message: EmailMessage
): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  if (!env.EMAIL_FROM) {
    throw new Error("Missing EMAIL_FROM");
  }

  const payload: Record<string, unknown> = {
    from: env.EMAIL_FROM,
    to: [message.to],
    subject: message.subject,
    html: message.html
  };

  if (message.text) {
    payload.text = message.text;
  }

  if (message.replyTo) {
    payload.reply_to = message.replyTo;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Resend email failed: ${response.status} ${responseText}`
    );
  }

  try {
    return JSON.parse(responseText) as EmailResult;
  } catch {
    return { raw: responseText };
  }
}
