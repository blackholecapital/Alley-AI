const express = require("express");
const router = express.Router();

const { analyzeBusinessCard } = require("../services/ollama");

router.post("/", async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                error: "missing image"
            });
        }

        const result = await analyzeBusinessCard(req.file.buffer);

        res.json({
            ok: true,
            data: result
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            ok: false,
            error: err.message
        });
    }
});

module.exports = router;
