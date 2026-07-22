const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const { analyzeBusinessCard } = require("../services/ollama");

router.post("/", async (req, res) => {
  console.log("================================");
  console.log("BUSINESS CARD REQUEST");
  console.log(new Date().toISOString());
  console.log("Headers:", req.headers);
  console.log("File:", req.file?.originalname);
  console.log("Size:", req.file?.size);
  console.log("================================");
    console.log("========== BUSINESS CARD REQUEST ==========");
    console.log(new Date().toISOString());
    console.log("IP:", req.ip);
    console.log("Headers:", req.headers);

    try {
        if (!req.file) {
            console.log("ERROR: No file uploaded");
            return res.status(400).json({
                ok: false,
                error: "missing image"
            });
        }

        console.log("Filename:", req.file.originalname);
        console.log("Mime:", req.file.mimetype);
        console.log("Size:", req.file.size);

        const dumpDir = "/tmp/vision-debug";
        fs.mkdirSync(dumpDir, { recursive: true });

        const dumpFile = path.join(
            dumpDir,
            `upload-${Date.now()}.jpg`
        );

        fs.writeFileSync(dumpFile, req.file.buffer);

        console.log("Saved upload:", dumpFile);

        const result = await analyzeBusinessCard(req.file.buffer);

        console.log("Vision result:", JSON.stringify(result, null, 2));

        res.json({
            ok: true,
            data: result
        });

    } catch (err) {
        console.error("Vision error:", err);

        res.status(500).json({
            ok: false,
            error: err.message
        });
    }

    console.log("===========================================");
});

module.exports = router;
