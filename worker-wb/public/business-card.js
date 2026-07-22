let stream = null;

const video = document.getElementById("preview");
const canvas = document.getElementById("captureCanvas");

const startBtn = document.getElementById("startCamera");
const captureBtn = document.getElementById("capture");
const retakeBtn = document.getElementById("retake");
const createLeadBtn = document.getElementById("createLead");

const spinner = document.getElementById("spinner");
const raw = document.getElementById("raw");

const fields = [
    "name",
    "company",
    "title",
    "email",
    "phone",
    "website",
    "address"
];

function showSpinner(show) {
    spinner.classList.toggle("hidden", !show);
}

async function startCamera() {

    if (stream)
        stream.getTracks().forEach(t => t.stop());

    stream = await navigator.mediaDevices.getUserMedia({

        video: {
            facingMode: "environment"
        },

        audio: false

    });

    video.srcObject = stream;

    await video.play();

    captureBtn.disabled = false;

}

startBtn.onclick = async () => {

    try {

        await startCamera();

    } catch (err) {

        alert("Unable to access camera.");

        console.error(err);

    }

};

captureBtn.onclick = async () => {

    showSpinner(true);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    ctx.drawImage(video, 0, 0);

    canvas.toBlob(async blob => {

        try {

            const fd = new FormData();

            fd.append(
                "image",
                blob,
                "business-card.jpg"
            );

            const response = await fetch("/vision/business-card", {

                method: "POST",
                body: fd

            });

            if (!response.ok)
                throw new Error("Vision API failed");

            const data = await response.json();

            raw.textContent = JSON.stringify(data, null, 2);

            fields.forEach(id => {

                const el = document.getElementById(id);

                if (el)
                    el.value = data[id] || "";

            });

        } catch (err) {

            console.error(err);

            alert("OCR failed.");

        }

        showSpinner(false);

    }, "image/jpeg", 0.95);

};

retakeBtn.onclick = () => {

    fields.forEach(id => {

        const el = document.getElementById(id);

        if (el)
            el.value = "";

    });

    raw.textContent = "";

};

createLeadBtn.onclick = async () => {

    const payload = {};

    fields.forEach(id => {

        payload[id] =
            document.getElementById(id).value;

    });

    try {

        const r = await fetch("/internal/demo/business-card", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(payload)

        });

        if (!r.ok)
            throw new Error();

        alert("Lead Created");

    } catch (err) {

        console.error(err);

        alert("Unable to create lead.");

    }

};

window.addEventListener("beforeunload", () => {

    if (stream)
        stream.getTracks().forEach(t => t.stop());

});
