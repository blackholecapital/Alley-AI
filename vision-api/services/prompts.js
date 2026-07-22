const BUSINESS_CARD_PROMPT = `
Extract every field from this business card.

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

module.exports = {
    BUSINESS_CARD_PROMPT
};
