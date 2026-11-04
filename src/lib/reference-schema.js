const bounds = {
  type: "object",
  description: "Rectangle measured on a 1000 by 1000 coordinate grid covering the FULL image. All four values are integers, not fractions or pixels.",
  properties: {
    x: { type: "integer", description: "Left edge, integer from 0 to 999." },
    y: { type: "integer", description: "Top edge, integer from 0 to 999." },
    w: { type: "integer", description: "Width, integer from 1 to 1000, x+w <= 1000." },
    h: { type: "integer", description: "Height, integer from 1 to 1000, y+h <= 1000." },
  },
  required: ["x", "y", "w", "h"],
};
export const REFERENCE_CARD_SCHEMA = {
  type: "object",
  properties: {
    readable: { type: "boolean" }, has_text: { type: "boolean" },
    aspect: { type: "string" }, art_style: { type: "string" }, background: { type: "string" },
    palette: { type: "array", items: { type: "string" }, description: "3 to 5 dominant #RRGGBB colors, most frequent first." },
    lighting: { type: "string", description: "One phrase: direction and character of the light." },
    panels: {
      type: "array",
      items: { type: "object", properties: { scene: { type: "string" }, bounds }, required: ["scene", "bounds"] },
    },
    scrims: {
      type: "array",
      description: "Darkening layers placed under the captions so the text reads over the artwork. Empty when there is none.",
      items: {
        type: "object",
        properties: {
          bounds,
          color: { type: "string", description: "Fill color as #RRGGBB, usually #000000." },
          opacity: { type: "number", description: "0 to 1." },
          fade: { type: "string", enum: ["none", "top", "bottom"], description: "Where the gradient gets lighter." },
        },
        required: ["bounds", "color", "opacity", "fade"],
      },
    },
    text_blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" }, bounds, font: { type: "string" }, weight: { type: "number" },
          color: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] },
          font_size: { type: "number", description: "Font size divided by the FULL image height, typically 0.025 to 0.06; not pixels." }, line_height: { type: "number" }, shadow: { type: "boolean" },
        },
        required: ["text", "bounds", "font", "weight", "color", "align", "font_size", "line_height", "shadow"],
      },
    },
  },
  required: ["readable", "has_text", "aspect", "art_style", "background", "panels", "text_blocks"],
};