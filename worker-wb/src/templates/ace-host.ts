export const branding = {
  company: "Ace Host",
  assistant: "Alley AI",
  poweredBy: "XYZ Labs"
};

export function welcomeEmail(lead: {
  name: string;
  leadId: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome</title>
</head>
<body style="font-family:Arial,sans-serif">
  <h2>Thanks for contacting ${branding.company}</h2>

  <p>Hi ${lead.name},</p>

  <p>
    Thanks for requesting information about our AI automation services.
  </p>

  <p>
    ${branding.assistant} has received your request and someone from our team
    will reach out shortly.
  </p>

  <p><strong>Lead ID:</strong> ${lead.leadId}</p>

  <hr>

  <p>
    ${branding.company}<br>
    Powered by ${branding.poweredBy}
  </p>
</body>
</html>
`;
}
