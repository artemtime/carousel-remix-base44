export const ADAPTED_CARDS_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    caption: { type: "string" },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "Номер карточки оригинала, начиная с 1." },
          panels: { type: "array", items: { type: "string" }, description: "По одной сцене на каждый кадр карточки." },
          texts: { type: "array", items: { type: "string" }, description: "Одна законченная подпись на каждый кадр (panel), в том же порядке. Число texts равно числу panels, независимо от числа фрагментов OCR." },
        },
        required: ["index", "panels", "texts"],
      },
    },
  },
  required: ["title", "caption", "cards"],
};