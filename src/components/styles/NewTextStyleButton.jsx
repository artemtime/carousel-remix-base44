import {useState} from "react";
import {base44} from "@/api/base44Client";
import {TEXT_STYLE} from "@/lib/text-cards";
import {toast} from "sonner";
export default function NewTextStyleButton({onCreated}) {
  const [busy,setBusy]=useState(false);
  return <button disabled={busy} onClick={async()=>{setBusy(true);try{const style=await base44.entities.MyStyle.create(TEXT_STYLE);onCreated(style);}catch(e){toast.error(e.message);}finally{setBusy(false);}}} className="rounded-lg border border-border px-3 py-2 text-[12.5px] disabled:opacity-50">{busy?"Создаю…":"Текстовый стиль без героя"}</button>;
}
