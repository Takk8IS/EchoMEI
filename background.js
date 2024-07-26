// background.js

let cnpjsToProcess = [];
let currentIndex = 0;
let results = [];
let csvContent = "DASN SIMEI,\n,\n";
let txtContent = "";
let csvMinimalContent = "CNPJ,RAZÃO SOCIAL,2023,2022,2021,2020,2019\n";
let currentTab = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startExtraction") {
        cnpjsToProcess = request.cnpjs;
        currentIndex = 0;
        results = [];
        csvContent = "DASN SIMEI,\n,\n";
        txtContent =
            "===============================================================================\n";
        txtContent += "DASN SIMEI\n";
        txtContent +=
            "===============================================================================\n\n";
        csvMinimalContent = "CNPJ,RAZÃO SOCIAL,2023,2022,2021,2020,2019\n";
        processNextCNPJ();
    } else if (request.action === "getResults") {
        sendResponse({ results: results });
    }
    return true;
});

async function processNextCNPJ() {
    if (currentIndex < cnpjsToProcess.length) {
        const cnpj = cnpjsToProcess[currentIndex];
        try {
            if (!currentTab) {
                const tabs = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                if (tabs.length === 0) {
                    throw new Error("No active tab found");
                }
                currentTab = tabs[0];
            }

            if (
                !currentTab.url ||
                !currentTab.url.includes(
                    "receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/Identificacao",
                )
            ) {
                await chrome.tabs.update(currentTab.id, {
                    url: "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/Identificacao",
                });
                await waitForPageLoad(currentTab.id);
            }

            await executeScriptInTab(currentTab.id, cnpj);
        } catch (error) {
            console.error(`Error processing CNPJ ${cnpj}:`, error);
            handleError(cnpj, `Erro: ${error.message}`);
        }
        currentIndex++;
        processNextCNPJ();
    } else {
        chrome.storage.local.set({ extractionResults: results }, function () {
            console.log("Extraction complete. Results stored.");
        });
        saveCSVFile();
        saveTXTFile();
        saveCSVMinimalFile();
        savePDFFile();

        if (currentTab) {
            await chrome.tabs.update(currentTab.id, {
                url: "https://www.linkedin.com/in/hellodav/",
            });
        }
    }
}

function waitForPageLoad(tabId) {
    return new Promise((resolve) => {
        const listener = function (tabId, changeInfo) {
            if (changeInfo.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function executeScriptInTab(tabId, cnpj) {
    try {
        await ensurePageReady(tabId);

        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: submitCNPJAndCollectData,
            args: [cnpj],
        });

        if (result && result.result) {
            results.push(result.result);

            await waitForPageLoad(tabId);

            const [currentUrl] = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                function: () => window.location.href,
            });

            if (
                currentUrl.result ===
                "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/"
            ) {
                const [copyResult] = await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    function: disableCSSAndCopyText,
                });
                if (copyResult && copyResult.result) {
                    csvContent += copyResult.result.csv;
                    txtContent += copyResult.result.txt;
                    csvMinimalContent += copyResult.result.csvMinimal;
                    if (currentIndex < cnpjsToProcess.length - 1) {
                        txtContent +=
                            "-------------------------------------------------------------------------------\n";
                    }
                }
            } else {
                console.error(
                    "URL incorreta após submeter CNPJ:",
                    currentUrl.result,
                );
            }
        }
    } catch (error) {
        console.error(`Error executing script for CNPJ ${cnpj}:`, error);
        handleError(cnpj, `Erro ao executar script: ${error.message}`);
    }
}

async function ensurePageReady(tabId) {
    return new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
            {
                target: { tabId: tabId },
                function: () => document.readyState === "complete",
            },
            (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (results[0].result) {
                    resolve();
                } else {
                    setTimeout(
                        () =>
                            ensurePageReady(tabId).then(resolve).catch(reject),
                        100,
                    );
                }
            },
        );
    });
}

function submitCNPJAndCollectData(cnpj) {
    return new Promise((resolve) => {
        const cnpjInput = document.querySelector("#identificacao-cnpj");
        if (cnpjInput) {
            cnpjInput.value = cnpj;
            const inputEvent = new Event("input", { bubbles: true });
            cnpjInput.dispatchEvent(inputEvent);

            const continueButton = document.querySelector(
                "#identificacao-continuar",
            );
            if (continueButton) {
                continueButton.click();

                const checkForResults = setInterval(() => {
                    const razaoSocial =
                        document
                            .querySelector("div.row div.col-12 p")
                            ?.textContent.trim() || "Não encontrado";
                    const anoCalendarioElements = document.querySelectorAll(
                        "#iniciar-ano-calendario .br-item",
                    );
                    if (
                        anoCalendarioElements.length > 0 ||
                        razaoSocial !== "Não encontrado"
                    ) {
                        clearInterval(checkForResults);
                        const anoCalendario = Array.from(
                            anoCalendarioElements,
                        ).map((el) => ({
                            ano: el.querySelector("input")?.value || "N/A",
                            descricao:
                                el.querySelector("label")?.textContent.trim() ||
                                "N/A",
                            status:
                                el
                                    .querySelector(".br-tag")
                                    ?.textContent.trim() || "N/A",
                        }));
                        resolve({
                            cnpj: cnpj,
                            razaoSocial: razaoSocial,
                            anoCalendario: anoCalendario,
                        });
                    }
                }, 500);

                setTimeout(() => {
                    clearInterval(checkForResults);
                    resolve({
                        cnpj: cnpj,
                        razaoSocial: "Tempo limite excedido ao buscar dados",
                        anoCalendario: [],
                    });
                }, 10000);
            } else {
                resolve({
                    cnpj: cnpj,
                    razaoSocial: "Erro: Botão 'Continuar' não encontrado",
                    anoCalendario: [],
                });
            }
        } else {
            resolve({
                cnpj: cnpj,
                razaoSocial: "Erro: Campo de CNPJ não encontrado",
                anoCalendario: [],
            });
        }
    });
}

function disableCSSAndCopyText() {
    document.querySelector("head").innerHTML = "";

    const cnpjElement = document.querySelector(
        "div.row div.col-12 div.col-12 p",
    );
    const cnpj = cnpjElement ? cnpjElement.textContent.trim() : "";

    const razaoSocialElement = document.querySelector(
        "div.row div.col-12:nth-of-type(2) div.col-12 p",
    );
    const razaoSocial = razaoSocialElement
        ? razaoSocialElement.textContent.trim()
        : "";

    const anoCalendarioElements = document.querySelectorAll(
        "#iniciar-ano-calendario .br-item",
    );
    const anoCalendario = Array.from(anoCalendarioElements).map((el) => {
        const ano = el.querySelector("input")?.value || "";
        const label = el.querySelector("label")?.textContent.trim() || "";
        const status = el.querySelector(".br-tag")?.textContent.trim() || "";
        return { ano, label, status };
    });

    let csvRows = [];
    csvRows.push(`DASN_SIMEI_CNPJ,${cnpj}`);
    csvRows.push(`DASN_SIMEI_RAZAO_SOCIAL,${razaoSocial}`);

    let txtContent = "";
    txtContent += `DASN_SIMEI_CNPJ="${cnpj}"\n`;
    txtContent += `DASN_SIMEI_RAZAO_SOCIAL="${razaoSocial}"\n`;

    let csvMinimalRow = `${cnpj},"${razaoSocial}",`;

    const years = ["2023", "2022", "2021", "2020", "2019"];
    const statusMap = {};

    anoCalendario.forEach(({ ano, label, status }) => {
        const fullStatus = status
            ? `${ano} - ${status}`.trim()
            : `${ano} - ${label}`.trim();
        csvRows.push(`DASN_SIMEI_CALENDARIO,${fullStatus}`);
        txtContent += `DASN_SIMEI_CALENDARIO="${fullStatus}"\n`;
        statusMap[ano] = status || label;
    });

    csvMinimalRow += years.map((year) => statusMap[year] || "N/A").join(",");

    csvRows.push(",");

    return {
        csv: csvRows.join("\n") + "\n",
        txt: txtContent,
        csvMinimal: csvMinimalRow + "\n",
    };
}

function handleError(cnpj, errorMessage) {
    results.push({
        cnpj: cnpj,
        razaoSocial: errorMessage,
        anoCalendario: [],
    });
}

function saveCSVFile() {
    csvContent +=
        "Support the project with USDT (TRC-20): TGpiWetnYK2VQpxNGPR27D9vfM6Mei5vNA,\n";

    const dataUrl =
        "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
    chrome.downloads.download(
        {
            url: dataUrl,
            filename: "EchoMEI.csv",
            conflictAction: "overwrite",
            saveAs: false,
        },
        (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Error saving CSV file:",
                    chrome.runtime.lastError,
                );
            } else {
                console.log("CSV file saved successfully");
            }
        },
    );
}

function saveTXTFile() {
    txtContent +=
        "-------------------------------------------------------------------------------\n";
    txtContent +=
        "Support the project with USDT (TRC-20): TGpiWetnYK2VQpxNGPR27D9vfM6Mei5vNA\n";

    const dataUrl =
        "data:text/plain;charset=utf-8," + encodeURIComponent(txtContent);
    chrome.downloads.download(
        {
            url: dataUrl,
            filename: "EchoMEI.txt",
            conflictAction: "overwrite",
            saveAs: false,
        },
        (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Error saving TXT file:",
                    chrome.runtime.lastError,
                );
            } else {
                console.log("TXT file saved successfully");
            }
        },
    );
}

function saveCSVMinimalFile() {
    const dataUrl =
        "data:text/csv;charset=utf-8," + encodeURIComponent(csvMinimalContent);
    chrome.downloads.download(
        {
            url: dataUrl,
            filename: "EchoMEI-min.csv",
            conflictAction: "overwrite",
            saveAs: false,
        },
        (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "Error saving CSV Minimal file:",
                    chrome.runtime.lastError,
                );
            } else {
                console.log("CSV Minimal file saved successfully");
            }
        },
    );
}

function escapePDFString(str) {
    return str
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/õ/g, "\u00F5")
        .replace(/Ã/g, "\u00C3")
        .replace(/ã/g, "\u00E3")
        .replace(/á/g, "\u00E1")
        .replace(/â/g, "\u00E2")
        .replace(/à/g, "\u00E0")
        .replace(/é/g, "\u00E9")
        .replace(/ê/g, "\u00EA")
        .replace(/í/g, "\u00ED")
        .replace(/ó/g, "\u00F3")
        .replace(/ô/g, "\u00F4")
        .replace(/ú/g, "\u00FA")
        .replace(/ç/g, "\u00E7")
        .replace(/ñ/g, "\u00F1")
        .replace(/ü/g, "\u00FC")
        .replace(/Á/g, "\u00C1")
        .replace(/Â/g, "\u00C2")
        .replace(/À/g, "\u00C0")
        .replace(/É/g, "\u00C9")
        .replace(/Ê/g, "\u00CA")
        .replace(/Í/g, "\u00CD")
        .replace(/Ó/g, "\u00D3")
        .replace(/Ô/g, "\u00D4")
        .replace(/Õ/g, "\u00D5")
        .replace(/Ú/g, "\u00DA")
        .replace(/Ç/g, "\u00C7")
        .replace(/Ñ/g, "\u00D1")
        .replace(/Ü/g, "\u00DC")
        .replace(/ˆ/g, "\u02C6")
        .replace(/£/g, "\u00A3")
        .replace(/€/g, "\u20AC")
        .replace(/¥/g, "\u00A5")
        .replace(/¢/g, "\u00A2")
        .replace(/º/g, "\u00BA")
        .replace(/ª/g, "\u00AA")
        .replace(/~/g, "\\~")
        .replace(/!/g, "\\!")
        .replace(/@/g, "\\@")
        .replace(/#/g, "\\#")
        .replace(/\$/g, "\\$")
        .replace(/%/g, "\\%")
        .replace(/\^/g, "\\^")
        .replace(/&/g, "\\&")
        .replace(/\*/g, "\\*")
        .replace(/-/g, "\\-")
        .replace(/_/g, "\\_")
        .replace(/=/g, "\\=")
        .replace(/;/g, "\\;")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/</g, "\\<")
        .replace(/>/g, "\\>")
        .replace(/\?/g, "\\?")
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/\|/g, "\\|")
        .replace(/`/g, "\\`")
        .replace(/[\u2018\u2019\u201A\u201B\u2039\u203A]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
        .replace(/[\u2026]/g, "...")
        .replace(/[\u2013]/g, "-")
        .replace(/[\u2014]/g, "--")
        .replace(/[\u00A0]/g, " ")
        .replace(/[\u2022]/g, "\\u2022")
        .replace(/[\u2122]/g, "\\u2122")
        .replace(/[\u00AE]/g, "\\u00AE")
        .replace(/[\u00A9]/g, "\\u00A9");
}

function generatePDF(content) {
    const pdfHeader =
        "%PDF-1.7\n" +
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<" +
        "/Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>" +
        ">>>>/Contents 4 0 R>>endobj\n";

    let yPosition = 800;
    let contentLines = "";
    content.split("\n").forEach((line) => {
        if (line.trim() !== "") {
            contentLines += `BT /F1 10 Tf 50 ${yPosition} Td (${escapePDFString(line)}) Tj ET\n`;
            yPosition -= 12;
        }
    });

    const contentStream =
        "4 0 obj\n<</Length " +
        contentLines.length +
        ">>\nstream\n" +
        contentLines +
        "endstream\nendobj\n";

    const pdfFooter =
        "xref\n0 5\n0000000000 65535 f \n0000000018 00000 n \n" +
        "0000000077 00000 n \n0000000178 00000 n \n0000000457 00000 n \n" +
        "trailer\n<<\n/Size 5\n/Root 1 0 R\n>>\nstartxref\n565\n%%EOF";

    return pdfHeader + contentStream + pdfFooter;
}

function savePDFFile() {
    const pdfContent = generatePDF(txtContent);
    const blob = new Blob([pdfContent], { type: "application/pdf" });
    const reader = new FileReader();
    reader.onloadend = function () {
        const base64data = reader.result;
        chrome.downloads.download(
            {
                url: base64data,
                filename: "EchoMEI.pdf",
                conflictAction: "overwrite",
                saveAs: false,
            },
            (downloadId) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "Error saving PDF file:",
                        chrome.runtime.lastError,
                    );
                } else {
                    console.log("PDF file saved successfully");
                }
            },
        );
    };
    reader.readAsDataURL(blob);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "showNotification") {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "images/icon72.png",
            title: "EchoMEI",
            message: request.message,
        });
    }
});
