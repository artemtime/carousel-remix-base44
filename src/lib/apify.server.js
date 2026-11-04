// Apify: собираем посты и рилсы конкурента. Ключ читается только на сервере.
import { secrets } from "base44:runtime";

const DEFAULT_ACTOR = "apify/instagram-scraper";

function token() {
  const t = secrets.get("APIFY_TOKEN");
  if (!t) throw new Error("Не задан ключ APIFY_TOKEN. Добавьте его в разделе Secrets.");
  return t;
}

function actorId() {
  const id = secrets.get("APIFY_INSTAGRAM_ACTOR") || DEFAULT_ACTOR;
  return id.replace("/", "~");
}

export async function runActor(input) {
  const url = `https://api.apify.com/v2/acts/${actorId()}/run-sync-get-dataset-items?token=${token()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`Apify ответил ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}

export function cleanHandle(input) {
  return String(input || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9._]/g, "");
}

export function normalizePost(item) {
  const children = Array.isArray(item.childPosts) ? item.childPosts : [];
  const childImages = children.map((c) => c.displayUrl).filter(Boolean);
  const images = childImages.length ? childImages : [item.displayUrl].filter(Boolean);
  const isCarousel = children.length > 1 || item.type === "Sidecar";
  const isVideo = Boolean(item.videoUrl) || item.type === "Video";
  return {
    handle: cleanHandle(item.ownerUsername || item.owner?.username || item.username || ""),
    shortcode: item.shortCode || item.shortcode || "",
    url: item.url || (item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
    thumb: item.displayUrl || "",
    video_url: item.videoUrl || "",
    likes: Number(item.likesCount || 0),
    comments: Number(item.commentsCount || 0),
    timestamp: item.timestamp || "",
    caption: item.caption || "",
    images,
    type: isCarousel ? "carousel" : isVideo ? "reel" : "image",
  };
}

export async function fetchProfilePosts(handle, limit = 40) {
  const h = cleanHandle(handle);
  if (!h) throw new Error("Не разобрал ник");
  const items = await runActor({
    directUrls: [`https://www.instagram.com/${h}/`],
    resultsType: "posts",
    resultsLimit: Math.min(Math.max(limit, 10), 80),
    searchType: "user",
    searchLimit: 1,
  });
  return items.map(normalizePost).map((post) => ({ ...post, handle: post.handle || h })).filter((p) => p.shortcode);
}

export async function fetchSinglePost(url) {
  const items = await runActor({ directUrls: [url], resultsType: "posts", resultsLimit: 1 });
  const post = items.map(normalizePost)[0];
  if (!post) throw new Error("Не получилось открыть этот пост");
  return post;
}

function median(values) {
  const arr = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
}

function ageDays(timestamp) {
  const t = Date.parse(timestamp || "");
  if (!t) return 999;
  return (Date.now() - t) / 86400000;
}

// «Выстрелило сильнее обычного»: лайки к обычному уровню автора.
export function rankHits(posts, kind, limit = 5) {
  const pool = posts.filter((p) => (kind === "reel" ? p.type === "reel" : p.type === "carousel"));
  const baseline = median(pool.map((p) => p.likes));
  const scored = pool.map((p) => ({
    ...p,
    baseline,
    ratio: baseline ? Number((p.likes / baseline).toFixed(2)) : 0,
    age: ageDays(p.timestamp),
  }));
  const hits = scored
    .filter((p) => p.ratio >= 1.35 || (p.age <= 4 && p.ratio >= 1.1))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit);
  const topRatio = hits.length ? hits[0].ratio : 0;
  return hits.map((p) => ({
    ...p,
    badge: p.age <= 5 ? "hot" : p.ratio === topRatio ? "best" : "rising",
  }));
}

export { median };