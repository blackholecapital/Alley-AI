function parseResponse(text){

    text = text
        .replace(/^```json/i,"")
        .replace(/^```/,"")
        .replace(/```$/,"")
        .trim();

    try{
        return JSON.parse(text);
    }catch{

        return {
            raw:text
        };

    }

}

module.exports = {
    parseResponse
};
