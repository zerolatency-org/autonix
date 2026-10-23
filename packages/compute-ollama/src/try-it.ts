import { OllamaCompute } from "./ollama-compute";

const compute = new OllamaCompute({ defaultModel: "llama3.1:8b" });
const reply = await compute.chat({ messages: [{ role: "user", content: "Say hello in one short sentence." }] });
console.log(reply);