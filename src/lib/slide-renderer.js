import { fontString, fitCaption, captionArea, captionTop } from "@/lib/caption-layout";
export { parseRuns } from "@/lib/caption-layout";
import { artworkBounds } from "@/lib/artwork-bounds";
// Рендер слайда на Canvas: картинку рисует нейросеть, БУКВЫ рисует только этот код.
// Разметка подписи: **жирный**, ==выделенное цветом==, ^^мелкий^^, перенос строки — \n.
import { loadFonts, familyOf } from "@/lib/fonts";
import renderReferenceCard from "@/lib/reference-canvas";
import renderOwnStyleCard from "@/lib/own-style-canvas";

export const ASPECTS = { "4:5": [1080, 1350], "3:4": [1080, 1440], "1:1": [1080, 1080] };

export const DEFAULT_PROFILE = {
  text_only: false,
  placement: "overlay", // overlay | band | strip
  font: "Montserrat",
  weight: 600,
  bold_weight: 800,
  size: 64,
  color: "#FFFFFF",
  accent: "#F5B342",
  uppercase: false,
  squeeze: 1,
  max_width: 0.84,
  position: 0.8,
  shadow: true,
  glow: 0.55,
  scrim_opacity: null, // own-style defaults to a readable vignette; explicit 0 disables it
  keep_breaks: false,
  smart_place: true,
  band_height: 0.24,
  strip_bg: "#FFFFFF",
  strip_height: 0.16,
  divider: false,
  line_spacing: 1.15,
  small_scale: 0.5,
};

export function normalizeProfile(input) {
  const p = { ...DEFAULT_PROFILE };
  const src = input || {};
  for (const key of Object.keys(DEFAULT_PROFILE)) {
    if (src[key] !== undefined && src[key] !== null) p[key] = src[key];
  }
  p.size = Number(p.size) || 64;
  p.weight = Number(p.weight) || 600;
  p.bold_weight = Number(p.bold_weight) || 800;
  p.squeeze = Number(p.squeeze) || 1;
  p.max_width = Number(p.max_width) || 0.84;
  p.position = Number(p.position) || 0.8;
  p.glow = Number(p.glow) || 0;
  p.band_height = Number(p.band_height) || 0.24;
  p.strip_height = Number(p.strip_height) || 0.16;
  p.line_spacing = Number(p.line_spacing) || 1.15;
  p.small_scale = Number(p.small_scale) || 0.5;
  if (!["overlay", "band", "strip"].includes(p.placement)) p.placement = "overlay";
  return p;
}

export const SLIDE_ROLES = [
  { id: "hook", label: "хук" },
  { id: "body", label: "текст" },
  { id: "cta", label: "финал" },
];

// Подпись под роль слайда: свой набор для хука, текста и финала, остальное — из общей подписи.
export function profileForRole(style, role) {
  const custom = style?.typography?.[role];
  return normalizeProfile({ ...(style?.caption || {}), ...(custom || {}) });
}

export function hasRoleProfile(style, role) {
  return Boolean(style?.typography?.[role]);
}

function coverImage(ctx, img, x, y, w, h, alignY = .5, trimFrame = false, trimFooter = false) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const b=trimFrame?artworkBounds(img,trimFooter):{x:0,y:0,w:1,h:1};
  const sw=iw*b.w,sh=ih*b.h;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  if(trimFrame)ctx.drawImage(img,iw*b.x,ih*b.y,sw,sh,x+(w-dw)/2,y+(h-dh)*Math.max(0,Math.min(1,alignY)),dw,dh);
  else ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * Math.max(0, Math.min(1, alignY)), dw, dh);
}

// Насколько «занята» полоса кадра: чем больше деталей, тем выше значение.
function busyBands(img, bands = 22) {
  const sw = 27;
  const sh = 90;
  const off = document.createElement("canvas");
  off.width = sw;
  off.height = sh;
  const octx = off.getContext("2d", { willReadFrequently: true });
  octx.drawImage(img, 0, 0, sw, sh);
  const data = octx.getImageData(0, 0, sw, sh).data;
  const scores = [];
  const bandH = Math.max(1, Math.floor(sh / bands));
  for (let b = 0; b < bands; b += 1) {
    let sum = 0;
    let count = 0;
    for (let y = b * bandH; y < Math.min(sh, (b + 1) * bandH); y += 1) {
      for (let x = 1; x < sw - 1; x += 1) {
        const i = (y * sw + x) * 4;
        const j = i + 4;
        sum += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
        count += 1;
      }
    }
    scores.push(count ? sum / count : 0);
  }
  return scores;
}

function smartPosition(img, prof) {
  if (!img || !prof.smart_place) return prof.position;
  try {
    const scores = busyBands(img);
    const candidates = [];
    for (let i = 3; i < scores.length - 2; i += 1) {
      const y = (i + 0.5) / scores.length;
      if (y < 0.42 || y > 0.9) continue;
      const calm = scores[i - 1] + scores[i] + scores[i + 1];
      candidates.push({ y, calm, dist: Math.abs(y - prof.position) });
    }
    if (!candidates.length) return prof.position;
    candidates.sort((a, b) => a.calm - b.calm || a.dist - b.dist);
    const target = candidates[0];
    const near = candidates.filter((c) => Math.abs(c.y - prof.position) < 0.12);
    const best = near.length ? near.sort((a, b) => a.calm - b.calm)[0] : target;
    return best.y;
  } catch {
    return prof.position;
  }
}

const imageCache = new Map();

function decode(url, anonymous) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = "anonymous";
    const timeout = setTimeout(() => { img.src = ""; reject(new Error("Изображение не загрузилось за 15 секунд")); }, 15000);
    img.onload = () => { clearTimeout(timeout); resolve(img); };
    img.onerror = () => { clearTimeout(timeout); reject(new Error("image")); };
    img.src = url;
  });
}

export async function loadImage(url, proxy) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const promise = (async () => {
    try {
      return await decode(url, true);
    } catch {
      if (!proxy) return null;
      try {
        const dataUrl = await proxy(url);
        if (!dataUrl) return null;
        return await decode(dataUrl, false);
      } catch {
        return null;
      }
    }
  })();
  imageCache.set(url, promise);
  const img = await promise;
  if (!img) imageCache.delete(url);
  return img;
}

function drawPlaceholder(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#1b1b20");
  g.addColorStop(1, "#2a2a31");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = `500 ${Math.round(w * 0.028)}px "Inter", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("картинка ещё не нарисована", x + w / 2, y + h / 2);
  ctx.textAlign = "left";
}

export async function renderSlide(canvas, options) {
  const { imageUrl, imageUrl2, text, profile, aspect = "4:5", layout = 1, proxy } = options;
  if (!canvas) return;
  const textCard=options.referenceCard?.visual_mode === "text";
  if(textCard && options.referenceCard.text_design === "own") {
    const card=options.referenceCard,[w,h]=card.aspect.split(":").map(Number);
    return renderSlide(canvas,{...options,referenceCard:null,textOnly:true,strict:false,imageUrl:null,imageUrl2:null,text:card.text_blocks.map(b=>b.text).join("\n\n"),profile:card.own_caption,dimensions:[1080,Math.round(1080*h/w)],fixedCaption:true,background:card.background});
  }
  if (options.strict && !options.textOnly) {
    const count = options.referenceCard?.schema_version === 2 ? options.referenceCard.panels.length : imageUrl2 ? 2 : 1;
    const urls = [imageUrl, imageUrl2].slice(0, count);
    if (urls.length !== count || urls.some((url) => !url)) throw new Error("Не все кадры нарисованы");
    const loaded = await Promise.all(urls.map((url) => loadImage(url, proxy)));
    if (loaded.some((image) => !image)) throw new Error("Один из кадров не загрузился. Повторите скачивание.");
  }
  if (options.referenceCard?.visual_mode === "own") return renderOwnStyleCard(canvas, options, renderSlide);
  if (options.referenceCard?.schema_version === 2) return renderReferenceCard(canvas, options, { loadImage, coverImage, drawPlaceholder, fontString });
  const prof = normalizeProfile(profile);
  const [W, H] = options.dimensions || ASPECTS[aspect] || ASPECTS["4:5"];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  const family = familyOf(prof.font);
  await loadFonts(prof.font, prof.weight, prof.bold_weight);

  const images = (await Promise.all([loadImage(imageUrl, proxy), loadImage(imageUrl2, proxy)])).filter(Boolean);
  const stripH = prof.placement === "strip" ? Math.round(H * prof.strip_height) : 0;
  const picH = H - stripH;
  const panels = Number(layout) >= 2 && images.length > 1 ? 2 : 1;

  // Кадры
  ctx.save();
  ctx.fillStyle = options.textOnly ? options.background || "#FAF8F3" : "#101014";
  ctx.fillRect(0, 0, W, picH);
  if (options.textOnly) { /* Intentional flat background, no placeholder artwork. */ } else if (!images.length) {
    drawPlaceholder(ctx, 0, 0, W, picH);
  } else if (panels === 2) {
    const half = Math.floor(picH / 2);
    coverImage(ctx, images[0], 0, 0, W, half, options.imageAlignY ?? .5, options.trimFrame, options.trimFooter);
    coverImage(ctx, images[1], 0, half, W, picH - half, options.imageAlignY ?? .5, options.trimFrame, options.trimFooter);
    if (prof.divider) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, half - 2, W, 4);
    }
  } else {
    coverImage(ctx, images[0], 0, 0, W, picH, options.imageAlignY ?? .5, options.trimFrame, options.trimFooter);
  }
  ctx.restore();

  // Затемнение снизу для band
  if (prof.placement === "band") {
    const bandH = Math.round(picH * prof.band_height);
    const g = ctx.createLinearGradient(0, picH - bandH * 1.6, 0, picH);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, "rgba(0,0,0,0.72)");
    g.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(0, picH - bandH * 1.6, W, bandH * 1.6);
  }

  // Полоса под кадром
  if (prof.placement === "strip") {
    ctx.fillStyle = prof.strip_bg;
    ctx.fillRect(0, picH, W, stripH);
    if (prof.divider) {
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, picH, W, 3);
    }
  }

  const body = (text ?? "").trim();
  if (!body) return;

  const area=captionArea(W,H,prof.placement,prof);
  const startSize=Math.round(prof.size*W/1080);
  ctx.textBaseline="alphabetic";ctx.textAlign="left";
  const laid=fitCaption(ctx,body,prof,family,{width:area.width,height:area.height,startSize,maxLines:prof.text_only?24:3,minSize:Math.max(18,Math.round(W*.022))});
  let centerY;
  if(prof.placement==="strip")centerY=picH+stripH/2;
  else if(prof.placement==="band")centerY=picH-picH*prof.band_height/2;
  else centerY=(options.fixedCaption?prof.position:smartPosition(images[0],prof))*picH;
  const top=captionTop(area,laid.total,centerY);
  // Own-style white lettering must remain readable on light paper/backgrounds.
  // Keep the user's font/colour; draw the vignette beneath the text, like the sample.
  const scrim = Math.max(0, Math.min(.95, Number(prof.scrim_opacity) || 0));
  if (prof.placement === "overlay" && scrim) {
    const start = Math.max(0, top - laid.size * 1.2);
    const end = Math.max(start + 1, Math.min(H, top + laid.size * .25));
    const gradient = ctx.createLinearGradient(0,start,0,end);
    gradient.addColorStop(0,"rgba(0,0,0,0)");
    gradient.addColorStop(1,`rgba(0,0,0,${scrim})`);
    ctx.save(); ctx.fillStyle = gradient; ctx.fillRect(0,start,W,H-start); ctx.restore();
  }

  const paint = (colorFor, alpha, blur, offset) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (prof.shadow || blur) {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = offset;
    }
    laid.lines.forEach((line, index) => {
      const baseline = top + index * laid.lineHeight + laid.ascent;
      ctx.save();
      ctx.translate(W / 2, baseline);
      if (prof.squeeze !== 1) ctx.scale(prof.squeeze, 1);
      let x = -line.width / prof.squeeze / 2;
      for (const token of line.tokens) {
        ctx.font = fontString(token.weight, token.size, family);
        ctx.fillStyle = colorFor(token);
        ctx.fillText(token.text, x, 0);
        x += token.w / prof.squeeze;
      }
      ctx.restore();
    });
    ctx.restore();
  };

  if (prof.placement === "overlay" && prof.glow > 0) {
    paint(() => "#000000", Math.min(0.8, prof.glow * 0.75), Math.round(laid.size * 0.9), 4);
  }
  paint((token) => (token.accent ? prof.accent : prof.color), 1, prof.shadow ? Math.round(laid.size * 0.18) : 0, 3);
}

export function downloadCanvas(canvas, filename) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Не удалось собрать PNG"));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        resolve(true);
      }, "image/png");
    } catch (e) {
      reject(e);
    }
  });
}
