import { fetchTrustedImage } from "@/lib/trusted-images.server";
// Только размеры файла на сервере; распознавание содержимого выполняет Core.
export default async function referenceImageSize(url, base44) {
  const stored = ["base44.app","base44.com"].some(host=>new URL(url).hostname===host || new URL(url).hostname.endsWith(`.${host}`));
  const loaded=await fetchTrustedImage(url,{maxBytes:8_000_000});
  const buffer=loaded.bytes.buffer;
  const materialize = async (dimensions) => {
    if (!base44 || stored) return { ...dimensions, url };
    const type = loaded.type;
    if (!["image/jpeg", "image/png"].includes(type)) throw new Error("Нужен оригинал JPEG или PNG");
    const file = new File([buffer], `reference.${type === "image/png" ? "png" : "jpg"}`, { type });
    const { file_url } = await (base44.asServiceRole || base44).integrations.Core.UploadPublicFile({ file });
    if (!file_url) throw new Error("Не удалось сохранить оригинал для распознавания");
    return { ...dimensions, url: file_url };
  };
  const data = new DataView(buffer);
  if (data.byteLength > 24 && data.getUint32(0) === 0x89504e47) return materialize({ width: data.getUint32(16), height: data.getUint32(20) });
  if (data.byteLength > 4 && data.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 8 < data.byteLength) {
      if (data.getUint8(offset) !== 0xff) break;
      const marker = data.getUint8(offset + 1);
      if (marker === 0xda || marker === 0xd9) break;
      const length = data.getUint16(offset + 2);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return materialize({ width: data.getUint16(offset + 7), height: data.getUint16(offset + 5) });
      offset += length + 2;
    }
  }
  throw new Error("Не удалось определить размеры оригинала. Нужна карточка JPEG или PNG.");
}
