// content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startExtraction") {
        const cnpjs = request.cnpjs;
        console.log("Iniciando extração para os seguintes CNPJs:", cnpjs);
        chrome.runtime.sendMessage({
            action: "startExtraction",
            cnpjs: cnpjs,
        });
    }
});
