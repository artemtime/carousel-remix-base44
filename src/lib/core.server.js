// Обёртки над интеграциями платформы: текст (InvokeLLM), картинки (GenerateImage), речь (TranscribeAudio).
import { TEXT_CHECK_PROMPT } from "@/lib/prompts";
import { imageRequestOptions, imageModelLabel } from "@/lib/image-models";
import { reserveStudioUsage } from "@/lib/editorial-store.server";
async function reserve(base44, kind) {
  if (base44.reserveUsage) await base44.reserveUsage(kind);
  else await reserveStudioUsage(base44, kind);
}

export async function askJson(base44, { prompt, schema, fileUrls, model }) {
  await reserve(base44, "text");
  const args = { prompt };
  if (model) args.model = model;
  if (schema) args.response_json_schema = schema;
  if (fileUrls && fileUrls.length) args.file_urls = fileUrls.filter(Boolean).slice(0, 10);
  const res = await (base44.asServiceRole || base44).integrations.Core.InvokeLLM(args);
  if (typeof res === "string") {
    const clean = res.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(clean);
  }
  return res;
}

// Select a supported canvas close to the actual panel, rather than defaulting to a square.
export function panelAspect(card, index = 0) {
  const [w, h] = String(card?.aspect || "1:1").split(":").map(Number);
  const box = card?.panels?.[index]?.bounds;
  const ratio = w * (box?.w || 1) / (h * (box?.h || 1));
  if (!(ratio > 0) || !Number.isFinite(ratio)) throw new Error("Неверные пропорции кадра");
  return ["1:1", "3:2", "2:3", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"]
    .sort((a, b) => {
      const value = str => { const [x,y] = str.split(":").map(Number); return Math.abs(Math.log((x/y)/ratio)); };
      return value(a) - value(b);
    })[0];
}

export async function imageFromPrompt(base44, prompt, refs, aspectRatio) {
  let selected = base44.imageModel;
  if (selected === undefined && base44.entities?.Settings) {
    selected = (await base44.entities.Settings.list({ sort: "-created_date", limit: 1 })).items?.[0]?.image_model;
  }
  const options = imageRequestOptions(selected, aspectRatio || "1:1");
  const client = base44.asServiceRole || base44;
  if (aspectRatio || options.model !== "automatic") {
    await reserve(base44, "image");
    const { baseURL, token, headers } = client.aiGateway.connection();
    const response = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...options, prompt,
        reference_image_urls: (refs || []).filter(Boolean).slice(0, 4), response_format: "url" }),
      signal: AbortSignal.timeout(150000),
    }).catch(() => {
      const error = new Error(`${imageModelLabel(options.model)}: соединение с генератором прервалось. Очередь остановлена; проверьте результат перед повтором.`);
      error.stopRender = true;
      throw error;
    });
    if (!response.ok) {
      const reason = response.status === 402 ? "Закончились кредиты приложения."
        : response.status === 403 ? "Платформа отказала в доступе к генерации."
        : response.status === 404 ? "Эта модель сейчас недоступна в Base44."
        : response.status === 429 ? "Превышен лимит запросов. Повторите позже."
        : response.status === 400 ? "Модель отклонила запрос или его параметры."
        : "Сервис генерации не ответил корректно. Повторите позже.";
      const error = new Error(`${imageModelLabel(options.model)} (${response.status}): ${reason}`);
      error.stopRender = true;
      throw error;
    }
    const result = await response.json().catch(() => null);
    if (!result?.data?.[0]?.url) {
      const error = new Error("Генератор не вернул картинку. Очередь остановлена; проверьте результат перед повтором.");
      error.stopRender = true;
      throw error;
    }
    base44.onImageGenerated?.({ requested_model: options.model,
      model: result.model || (options.model === "automatic" ? "" : options.model),
      aspect_ratio: options.aspect_ratio, quality: options.quality || "", url: result.data[0].url });
    return result.data[0].url;
  }
  await reserve(base44, "image");
  const args = { prompt };
  if (refs && refs.length) args.existing_image_urls = refs.filter(Boolean).slice(0, 4);
  const res = await client.integrations.Core.GenerateImage(args);
  if (!res || !res.url) throw new Error("Картинка не сгенерировалась");
  base44.onImageGenerated?.({ requested_model: "automatic", model: "", url: res.url });
  return res.url;
}

export async function transcribe(base44, audioUrl) {
  await reserve(base44, "text");
  const res = await (base44.asServiceRole || base44).integrations.Core.TranscribeAudio({ audio_url: audioUrl });
  if (typeof res === "string") return res;
  return res?.text || res?.transcript || "";
}

// Чистый кадр: на картинке не должно быть ни одной буквы — текст накладывает код.
export async function hasTextInImage(base44, url) {
  const res = await askJson(base44, { prompt: TEXT_CHECK_PROMPT, schema: TEXT_CHECK_SCHEMA, fileUrls: [url] });
  if (typeof res?.has_text !== "boolean") throw new Error("Проверка надписей не вернула результат");
  return res.has_text;
}

export const STYLE_SCHEMA = {
  type: "object",
  properties: {
    aspect: { type: "string" },
    art_style: { type: "string" },
    palette: { type: "array", items: { type: "string" } },
    lighting: { type: "string" },
    background: { type: "string" },
    competitor_character: { type: ["string", "null"] },
    caption: {
      type: "object",
      properties: {
        placement: { type: "string" },
        font: { type: "string" },
        weight: { type: "number" },
        bold_weight: { type: "number" },
        color: { type: "string" },
        accent: { type: "string" },
        uppercase: { type: "boolean" },
        squeeze: { type: "number" },
        position: { type: "number" },
        shadow: { type: "boolean" },
        scrim_opacity: { type: "number" },
        strip_bg: { type: "string" },
        divider: { type: "boolean" },
      },
    },
    font_kind: { type: "string" },
    caption_notes: { type: "string" },
  },
  required: ["aspect", "art_style", "caption"],
};

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    caption: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          scene: { type: "string" },
          text: { type: "string" },
          layout: { type: "number" },
          ref_index: { type: "number" },
          ref_brief: { type: "string" },
          text_blocks: { type: "array", items: { type: "string" } },
          panel_scenes: { type: "array", items: { type: "string" } },
        },
        required: ["role", "scene", "text"],
      },
    },
  },
  required: ["title", "caption", "slides"],
};

// Чертёж залетевшей карусели: снимается со всех её карточек подряд.
export const REFERENCE_SCHEMA = {
  type: "object",
  properties: {
    cards_count: { type: "number" },
    aspect: { type: "string" },
    art_style: { type: "string" },
    character: { type: ["string", "null"] },
    palette: { type: "array", items: { type: "string" } },
    lighting: { type: "string" },
    composition_rule: { type: "string" },
    typography: {
      type: "object",
      properties: {
        placement: { type: "string" },
        case: { type: "string" },
        weight: { type: "string" },
        notes: { type: "string" },
      },
    },
    caption: {
      type: "object",
      properties: {
        placement: { type: "string" },
        font: { type: "string" },
        weight: { type: "number" },
        bold_weight: { type: "number" },
        color: { type: "string" },
        accent: { type: "string" },
        uppercase: { type: "boolean" },
        position: { type: "number" },
        shadow: { type: "boolean" },
      },
    },
    series_logic: { type: "string" },
    rules: { type: "array", items: { type: "string" } },
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          shot: { type: "string" },
          subject: { type: "string" },
          hero_place: { type: "string" },
          setting: { type: "string" },
          light: { type: "string" },
          text_zone: { type: "string" },
          layout: { type: "string" },
          text: { type: "string" },
          text_lines: { type: "number" },
        },
        required: ["index", "subject", "layout", "text", "text_lines"],
      },
    },
  },
  required: ["cards_count", "art_style", "cards"],
};

export const HERO_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    default_outfit: { type: "string" },
    signature_details: { type: "array", items: { type: "string" } },
    never_change: { type: "array", items: { type: "string" } },
  },
  required: ["name", "description"],
};

export const SERIES_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          angle: { type: "string" },
          hook: { type: "string" },
        },
        required: ["title", "angle", "hook"],
      },
    },
  },
  required: ["posts"],
};

export const VARIANTS_SCHEMA = {
  type: "object",
  properties: { variants: { type: "array", items: { type: "string" } } },
  required: ["variants"],
};

export const CRITIC_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" }, problem: { type: "string" }, fix: { type: "string" } },
  required: ["ok"],
};

export const CRITIC_PANEL_SCHEMA = {
  type: "object",
  properties: {
    integrity: { type: "boolean" },
    style: { type: "boolean" },
    composition: { type: "boolean" },
    scene: { type: "boolean" },
    hero: { type: "boolean" },
    text: { type: "boolean" },
    ok: { type: "boolean" },
    problem: { type: "string" },
    fix: { type: "string" },
  },
  required: ["integrity", "style", "composition", "scene", "hero", "text", "ok", "problem", "fix"],
};

export const TEXT_CHECK_SCHEMA = {
  type: "object",
  properties: { has_text: { type: "boolean" }, where: { type: "string" } },
  required: ["has_text"],
};

export const REEL_ANALYSIS_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" }, hook: { type: "string" }, why_viral: { type: "string" } },
  required: ["summary"],
};

export const REEL_LINES_SCHEMA = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
  },
  required: ["lines"],
};

export const SCENARIO_SCHEMA = {
  type: "object",
  properties: {
    hook_type: { type: "string" },
    emotion: { type: "string" },
    structure: { type: "array", items: { type: "string" } },
    hooks: { type: "array", items: { type: "string" } },
    script: { type: "string" },
  },
  required: ["hooks", "script"],
};

