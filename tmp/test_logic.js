const modelName1 = "ollama-gpt-oss (Online)";
const modelName2 = "granite4350m.gguf";

function cleanModelName(content) {
    // This mimics the logic in main.js select handler
    return content.split('{')[0].split('(')[0].trim();
}

console.log(`Original: "${modelName1}" -> Clean: "${cleanModelName(modelName1)}"`);
console.log(`Original: "${modelName2}" -> Clean: "${cleanModelName(modelName2)}"`);

// Mimic ollama-adapter logic
function isVirtualModel(modelName, virtualModels) {
    const cleanName = modelName.replace(' (Online)', '').trim();
    return virtualModels.some(m => m === cleanName);
}

const virtualModels = ["ollama-gpt-oss"];
console.log(`Is "${modelName1}" virtual?`, isVirtualModel(modelName1, virtualModels));
console.log(`Is "ollama-gpt-oss" virtual?`, isVirtualModel("ollama-gpt-oss", virtualModels));
console.log(`Is "${modelName2}" virtual?`, isVirtualModel(modelName2, virtualModels));
