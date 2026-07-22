const buttons = document.querySelectorAll("#saveContact,#saveContactQuick");

const vcard = `BEGIN:VCARD
VERSION:3.0
N:Capobianco;CJ;;;
FN:CJ Capobianco
ORG:XYZ Labs
TITLE:AI Systems Architect
TEL;TYPE=CELL:+1-617-901-6112
EMAIL;TYPE=WORK:info@blackholecapital.xyz
URL:https://blackholecapital.xyz
URL:https://xyz-labs.xyz
URL:https://github.com/blackholecapital/Audits
URL:https://git.xyz-labs.xyz/factory-admin/Audits
URL:https://www.youtube.com/@xyz-Labs-xyz
URL:https://x.com/Mktmakerxyz
NOTE:Telegram @sparkie8675309
END:VCARD`;

function saveContact(){

    const blob = new Blob([vcard],{type:"text/vcard"});
    const url = URL.createObjectURL(blob);

    const a=document.createElement("a");
    a.href=url;
    a.download="CJ-Capobianco.vcf";

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
}

buttons.forEach(btn=>btn.onclick=saveContact);

console.log("CJ Executive Page Loaded");
