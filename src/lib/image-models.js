// The builder chat's model picker is separate from these image-generation models.
export const IMAGE_MODELS = [
  { id: "automatic", label: "Автоматически · Base44", hint: "Платформа выбирает модель. Стоимость зависит от её выбора." },
  { id: "nano_banana_2_1", label: "Gemini · Nano Banana 2.1", hint: "Модель Google с поддержкой образцов стиля и героя." },
  { id: "gpt_image_2", label: "GPT Image 2 · OpenAI", hint: "Модель OpenAI. Качество medium; расход кредитов может быть выше." },
];
export const IMAGE_MODEL_IDS = IMAGE_MODELS.map(model => model.id);
export function normalizeImageModel(value) {
  const id = value ?? "automatic";
  if (!IMAGE_MODEL_IDS.includes(id)) throw new Error("Неизвестная модель рисования. Выберите модель из списка.");
  return id;
}
export function imageModelLabel(value) {
  return IMAGE_MODELS.find(model => model.id === (value || "automatic"))?.label
    || ({ gemini_3_1_flash_lite_image: "Gemini 3.1 Flash Lite", gemini_3_1_flash_image: "Gemini 3.1 Flash", gemini_2_5_flash_image: "Gemini 2.5 Flash" })[value]
    || String(value || "Неизвестная модель");
}
export function imageRequestOptions(value, aspect = "1:1") {
  const model = normalizeImageModel(value);
  const [w, h] = String(aspect).split(":").map(Number);
  if (!(w > 0 && h > 0)) throw new Error("Неверные пропорции рисунка");
  const ratios = model === "gpt_image_2"
    ? ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]
    : ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"];
  const distance = ratio => { const [x, y] = ratio.split(":").map(Number); return Math.abs(Math.log((x / y) / (w / h))); };
  return { model, aspect_ratio: ratios.sort((a, b) => distance(a) - distance(b))[0],
    ...(model === "gpt_image_2" ? { quality: "medium" } : {}) };
}
