const express = require("express");
const multer = require("multer");

const app = express();
console.log("***** RUNNING ~/Alley-AI/vision-api/server.js *****");
console.log("cwd:", process.cwd());
console.log("__dirname:", __dirname);

const upload = multer({
    storage:multer.memoryStorage()
});

app.use(
    "/health",
    require("./routes/health")
);

app.use(
    "/vision/business-card",
    upload.single("image"),
    require("./routes/business-card")
);

app.listen(8081,"0.0.0.0",()=>{
    console.log("Vision API listening on :8081");
});
