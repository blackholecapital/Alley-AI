export async function visionBusinessCardRoute(
  request: Request,
  env: any
): Promise<Response> {

  const form = await request.formData();

  const image = form.get("image") as Blob | null;

  if (!image) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "missing image"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const proxyForm = new FormData();
  proxyForm.append("image", image, "business-card.jpg");

  const response = await fetch(
    "http://127.0.0.1:8081/vision/business-card",
    {
      method: "POST",
      body: proxyForm
    }
  );

  return new Response(await response.text(), {
    status: response.status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
