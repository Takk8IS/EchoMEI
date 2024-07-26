// popup.js

document.addEventListener("DOMContentLoaded", () => {
    const extractButton = document.getElementById("extract");
    const resultsContainer = document.getElementById("results");
    const resultsContent = document.getElementById("resultsContent");
    const copyButton = document.getElementById("copyResults");
    // const exportCsvButton = document.createElement("button");
    // const exportPdfButton = document.createElement("button");
    const spinner = document.querySelector(".spinner");

    // exportCsvButton.textContent = "Exportar CSV";
    // exportCsvButton.classList.add("copy-btn");
    // exportPdfButton.textContent = "Exportar PDF";
    // exportPdfButton.classList.add("copy-btn");

    // resultsContainer.appendChild(exportCsvButton);
    // resultsContainer.appendChild(exportPdfButton);

    extractButton.addEventListener("click", () => {
        const cnpjInput = document.getElementById("cnpjInput").value;
        // Considers numeric characters only
        const cnpjs = cnpjInput
            .split(/\n+/)
            .map((cnpj) => cnpj.replace(/[^\d]/g, ""))
            .filter(Boolean);

        if (cnpjs.length === 0) {
            // Create the container for the popup
            const popupContainer = document.createElement("div");
            popupContainer.style.position = "fixed";
            popupContainer.style.top = "50%";
            popupContainer.style.left = "50%";
            popupContainer.style.transform = "translate(-50%, -50%)";
            popupContainer.style.backgroundColor = "white";
            popupContainer.style.border = "1px solid #ccc";
            popupContainer.style.padding = "20px";
            popupContainer.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.1)";
            popupContainer.style.zIndex = "10000";
            popupContainer.style.textAlign = "center";

            // Add the title
            const popupTitle = document.createElement("h2");
            popupTitle.innerText = "ROOOAAARRR!";
            popupContainer.appendChild(popupTitle);

            // Add the image
            const popupImage = document.createElement("img");
            popupImage.src = "images/icon96.png";
            popupImage.alt = "Icone de erro";
            popupImage.style.display = "block";
            popupImage.style.margin = "0 auto 20px";
            popupContainer.appendChild(popupImage);

            // Add the message
            const popupMessage = document.createElement("p");
            popupMessage.innerText =
                "Por favor, insira pelo menos um CNPJ válido.";
            popupContainer.appendChild(popupMessage);

            // Add the popup to the body
            document.body.appendChild(popupContainer);

            // Automatically remove the popup after a few seconds
            setTimeout(() => {
                document.body.removeChild(popupContainer);
            }, 3000);

            return;
        }

        // resultsContainer.style.display = "none";
        // resultsContent.innerHTML = "";
        spinner.style.display = "block";

        chrome.runtime.sendMessage({
            action: "startExtraction",
            cnpjs: cnpjs,
        });

        checkResults();
    });

    function checkResults() {
        chrome.storage.local.get("extractionResults", function (data) {
            if (data.extractionResults && data.extractionResults.length > 0) {
                displayResults(data.extractionResults);
            } else {
                setTimeout(checkResults, 1000);
            }
        });
    }

    function displayResults(results) {
        spinner.style.display = "none";
        // resultsContainer.style.display = "block";

        results.forEach((result) => {
            const { cnpj, razaoSocial, anoCalendario } = result;
            const resultDiv = document.createElement("div");
            resultDiv.innerHTML = `
                <h3>${cnpj} - ${razaoSocial}</h3>
                ${
                    anoCalendario.length > 0
                        ? `
                    <ul>
                        ${anoCalendario
                            .map(
                                (ano) => `
                            <li>${ano.ano}: ${ano.descricao} - ${ano.status}</li>
                        `,
                            )
                            .join("")}
                    </ul>
                `
                        : "<p>Nenhum dado de ano calendário disponível.</p>"
                }
            `;
            // resultsContent.appendChild(resultDiv);
        });

        chrome.storage.local.remove("extractionResults");
    }

    // copyButton.addEventListener("click", () => {
    //     const text = resultsContent.innerText;
    //     navigator.clipboard
    //         .writeText(text)
    //         .then(() => {
    //             alert("Resultados copiados para a área de transferência!");
    //         })
    //         .catch((err) => {
    //             console.error("Erro ao copiar texto: ", err);
    //             alert("Erro ao copiar resultados. Por favor, tente novamente.");
    //         });
    // });

    // exportCsvButton.addEventListener("click", () => {
    //     console.log("Exportação CSV não implementada");
    // });

    // exportPdfButton.addEventListener("click", () => {
    //     console.log("Exportação PDF não implementada");
    // });

    // Add listener to show copied content
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "showNotification") {
            alert(request.message);
        }
    });
});
