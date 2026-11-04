const HOSTS = ["base44.com", "base44.app", "wixstatic.com", "cdninstagram.com", "fbcdn.net", "apify.com"];
export function trustedImageUrl(value, storedOnly = false) {
  const url = new URL(value);
  const hosts = storedOnly ? HOSTS.slice(0, 2) : HOSTS;
  if (url.protocol !== "https:" || url.username || url.password || !(hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) || (!storedOnly && url.hostname === "images.unsplash.com"))) throw new Error("Этот адрес картинки не разрешён");
  return url;
}
export async function fetchTrustedImage(value, { maxBytes = 8_000_000, storedOnly = false } = {}) {
  let target = trustedImageUrl(value, storedOnly), response;
  for (let i = 0; i <= 3; i++) {
    response = await fetch(target.href, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (![301,302,303,307,308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || i === 3) throw new Error("Слишком много перенаправлений картинки");
    target = trustedImageUrl(new URL(location,target).href, storedOnly);
  }
  if (!response.ok) throw new Error(`Картинка не открылась (${response.status})`);
  const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(type)) throw new Error("Нужен файл PNG, JPEG или WebP");
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("Картинка слишком большая");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Пустой файл картинки");
  const chunks=[];let length=0;
  try {
    while (true) {
      const {done,value:chunk}=await reader.read(); if(done)break;
      length+=chunk.byteLength;
      if(length>maxBytes) { await reader.cancel(); throw new Error("Картинка слишком большая"); }
      chunks.push(chunk);
    }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(length);let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  const png=bytes.length>=24 && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;
  const jpeg=bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp=bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" && String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if (!(type==="image/png"&&png || type==="image/jpeg"&&jpeg || type==="image/webp"&&webp)) throw new Error("Содержимое файла не совпадает с форматом картинки");
  const view=png?new DataView(bytes.buffer):null;
  return {bytes,type,url:target.href,width:view?.getUint32(16),height:view?.getUint32(20)};
}
export function imageDataUrl({bytes,type}) {
  let binary="";
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `data:${type};base64,${btoa(binary)}`;
}
