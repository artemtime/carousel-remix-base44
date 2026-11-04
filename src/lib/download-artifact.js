export async function downloadArtifact(url,name,proxy) {
  if(!url)throw new Error("Готовая карточка не сохранена");
  const data=await proxy(url),match=/^data:(image\/png);base64,(.+)$/s.exec(data);
  if(!match)throw new Error("Не удалось скачать готовую карточку PNG");
  const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
  const objectUrl=URL.createObjectURL(new Blob([bytes],{type:match[1]}));
  const a=document.createElement("a");a.href=objectUrl;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
}
