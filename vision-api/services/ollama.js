const { BUSINESS_CARD_PROMPT } = require("./prompts");
const { parseResponse } = require("./parser");

async function analyzeBusinessCard(buffer){

    const image = buffer.toString("base64");

    const response = await fetch("http://127.0.0.1:11434/api/generate",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            model:"llava:13b",
            prompt:BUSINESS_CARD_PROMPT,
            images:[image],
            stream:false
        })
    });

    if(!response.ok){
        throw new Error("Ollama request failed");
    }

    const json = await response.json();

console.log("\n========== OLLAMA RAW ==========");
console.dir(json,{depth:null});
console.log("========== OLLAMA RESPONSE ==========");
console.log(json.response);
console.log("====================================\n");

return {
    raw: json.response
};
}

module.exports = {
    analyzeBusinessCard
};
