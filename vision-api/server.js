const express = require("express");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/vision/business-card", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: "missing image"
      });
    }

    const image = req.file.buffer.toString("base64");

    const prompt = `
Extract the information from this business card.

Return ONLY valid JSON.

{
  "name":"",
  "title":"",
  "company":"",
  "email":"",
  "phone":"",
  "website":"",
  "address":""
}
`;

    const ollama = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llava:13b",
        prompt,
        images: [image],
        stream: false
      })
    });

    if (!ollama.ok) {
      throw new Error("Ollama request failed");
    }

    const result = await ollama.json();
console.log("\n===== OLLAMA RAW RESPONSE =====");
console.log(result.response);
console.log("===== END RESPONSE =====\n");

    let text = result.response.trim();

    text = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "");

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        raw: text
      };
    }

    res.json({
      ok: true,
      data: parsed
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

app.listen(8081, "0.0.0.0", () => {
  console.log("Vision API listening on :8081");
});
