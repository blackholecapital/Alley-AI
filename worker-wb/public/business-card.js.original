const picker=document.getElementById("cardImage");
const btn=document.getElementById("scanBtn");
const img=document.getElementById("preview");

btn.onclick=()=>picker.click();

picker.onchange=async()=>{

const file=picker.files[0];
if(!file)return;

img.src=URL.createObjectURL(file);
img.style.display="block";

const fd=new FormData();
fd.append("image",file);

const r=await fetch("/vision/business-card",{
method:"POST",
body:fd
});

const data=await r.json();

Object.keys(data).forEach(k=>{
const el=document.getElementById(k);
if(el)el.value=data[k];
});

};

document.getElementById("leadForm").onsubmit=async(e)=>{

e.preventDefault();

const payload={};

document.querySelectorAll("input").forEach(i=>{
payload[i.id]=i.value;
});

const r=await fetch("/internal/demo/business-card",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(payload)
});

alert("Lead Created");
};
