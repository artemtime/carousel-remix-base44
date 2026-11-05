import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, ArrowRight, Settings2 } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import ImageModelPicker from "@/components/ImageModelPicker";
import { EDITORIAL_MODES, STAGES, PRESETS } from "@/lib/editorial-policy";
import { getEditorialState, saveEditorial, startEditorialProbe, acceptEditorialProbe } from "@/lib/editorial";
import { bufferChannels } from "@/lib/buffer";

export const Route = createFileRoute("/_authed/editorial")({head:()=>({meta:[{title:"Редакция — Цифровые сотрудники"}]}),component:EditorialPage});
const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary disabled:opacity-50";
function Field({label,children,hint}) { return <label className="block space-y-1.5"><span className="block text-[12px] text-muted-foreground">{label}</span>{children}{hint && <span className="block text-[11px] leading-relaxed text-muted-foreground">{hint}</span>}</label>; }
function Section({number,title,description,children}) { return <section className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[12px] text-primary">{number}</span><div><h2 className="text-[16px] font-medium">{title}</h2><p className="mt-1 text-[12px] text-muted-foreground">{description}</p></div></div>{children}</section>; }
function EditorialPage() {
  const loadFn=useServerFn(getEditorialState),saveFn=useServerFn(saveEditorial),probeFn=useServerFn(startEditorialProbe),acceptFn=useServerFn(acceptEditorialProbe),channelsFn=useServerFn(bufferChannels);
  const [state,setState]=useState(null),[form,setForm]=useState(null),[busy,setBusy]=useState(""),[error,setError]=useState(""),[channels,setChannels]=useState([]),[autoAck,setAutoAck]=useState(false);
  const load=async(reset=false)=>{const next=await loadFn();setState(next);if(reset || !form){setForm(next.editorial);setAutoAck(Boolean(next.editorial.stages.approval));}};
  useEffect(()=>{load(true).catch(e=>setError(String(e.message || e)));},[]);
  useEffect(()=>{if(!state?.probes?.some(p=>p.status==="rendering" || p.needs_finalization))return;const timer=setInterval(()=>load().catch(()=>{}),5000);return()=>clearInterval(timer);},[state?.probes]);
  const set=patch=>{if(["style_id","hero_id","image_model"].some(k=>patch[k]!==undefined))setAutoAck(false);setForm(f=>{
    const visualChanged=["style_id","hero_id","image_model"].some(k=>patch[k]!==undefined && patch[k]!==f[k]);
    return {...f,...patch,...(visualChanged?{stages:{...f.stages,approval:false}}:{})};
  });};
  const perform=async(key,fn)=>{setBusy(key);setError("");try{await fn();}catch(e){setError(String(e.message || e).slice(0,500));}finally{setBusy("");}};
  const save=async()=>{if(form.audience.trim().length<3 || form.topics.trim().length<3 || !form.style_id)throw new Error("Укажите аудиторию, темы и выберите свой стиль.");if(!form.publish_days.length)throw new Error("Выберите хотя бы один день публикации.");await saveFn({data:{...form,allow_auto_approval:autoAck}});await load();toast.success("Задание редакции сохранено");};
  if(!form)return <div className="p-8 text-sm text-muted-foreground">{error || "Загружаю редакцию…"}</div>;
  const selectedStyle=state.styles.find(s=>s.id===form.style_id);
  const probe=state.probes.find(c=>c.style_id===form.style_id && c.image_model===form.image_model && (c.hero_id || "")===(selectedStyle?.content_format === "text" ? "" : form.hero_id || selectedStyle?.hero_id || ""));
  const templateMatchesDraft=state.templateCurrent && ["style_id","hero_id","image_model"].every(k=>form[k]===state.editorial[k]);
  return <div className="fade-in">
    <PageHeader eyebrow="цифровая редакция" title="Один раз объяснить, как работать" description="Задание, утверждённый образец и степень самостоятельности сотрудников." actions={<button disabled={Boolean(busy)} onClick={()=>perform("save",save)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] text-primary-foreground disabled:opacity-50">{busy==="save"?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}Сохранить задание</button>}/>
    <div className="space-y-5 px-5 py-6 md:px-8">
      {error && <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-[13px]">{error}</p>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Section number="1" title="Для кого и зачем" description="Эти правила получают Автор и редактор каждой новой идеи.">
          <Field label="Кому мы помогаем"><textarea rows={2} value={form.audience} onChange={e=>set({audience:e.target.value})} placeholder="Например: владельцы небольших онлайн-школ" className={input}/></Field>
          <Field label="Продукт или услуга"><textarea rows={2} value={form.product} onChange={e=>set({product:e.target.value})} placeholder="Что предлагаем аудитории" className={input}/></Field>
          <Field label="Основная цель"><select value={form.goal} onChange={e=>set({goal:e.target.value})} className={input}>{[["reach","Охваты"],["subscribers","Подписчики"],["leads","Обращения"],["sales","Продажи"]].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>
          <Field label="О чём пишем"><textarea rows={3} value={form.topics} onChange={e=>set({topics:e.target.value})} placeholder="Темы и рубрики" className={input}/></Field>
          <Field label="Какие темы пропускаем" hint="По одной теме или ключевой фразе на строку. Совпадения исключаются из автоматического отбора."><textarea rows={2} value={form.excluded_topics} onChange={e=>set({excluded_topics:e.target.value})} className={input}/></Field>
          <Field label="Как звучит автор"><textarea rows={2} value={form.voice} onChange={e=>set({voice:e.target.value})} placeholder="Прямо, спокойно, с конкретными примерами" className={input}/></Field>
          <div className="grid gap-3 md:grid-cols-2"><Field label="Удачные формулировки"><textarea rows={3} value={form.good_examples} onChange={e=>set({good_examples:e.target.value})} className={input}/></Field><Field label="Так писать не нужно"><textarea rows={3} value={form.bad_examples} onChange={e=>set({bad_examples:e.target.value})} className={input}/></Field></div>
        </Section>
        <Section number="2" title="Как выглядит результат" description="Герой, рисовка и типографика проверяются по сохранённому образцу.">
          <Field label="Мой стиль"><select value={form.style_id} onChange={e=>set({style_id:e.target.value})} className={input}><option value="">Выберите стиль</option>{state.styles.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          {!state.styles.length && <Link to="/styles" className="text-sm text-primary">Создать первый стиль <ArrowRight className="inline h-3 w-3"/></Link>}
          {selectedStyle?.content_format !== "text" && <Field label="Герой"><select value={form.hero_id} onChange={e=>set({hero_id:e.target.value})} className={input}><option value="">Герой из выбранного стиля</option>{state.heroes.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>}
          {selectedStyle?.content_format !== "text" && <ImageModelPicker value={form.image_model} onChange={image_model=>set({image_model})}/>}
          {selectedStyle?.content_format === "text" && <p className="text-xs text-muted-foreground">Текстовые карточки без героя и генерации картинок. Расходуются запросы на текст, чтение исходников и проверку готовых PNG.</p>}
          <div className="grid gap-3 md:grid-cols-2"><Field label="Режим содержания"><select value={form.content_mode} onChange={e=>set({content_mode:e.target.value})} className={input}><option value="adapt">Адаптация в моём стиле</option><option value="original">Своя история по теме</option></select></Field><Field label="Язык"><select value={form.language} onChange={e=>set({language:e.target.value})} className={input}><option value="ru">Русский</option><option value="es">Español</option><option value="en">English</option></select></Field></div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <p className="text-[13px] font-medium">Пробная карточка</p><p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Один рисунок и подпись выбранным шрифтом. Создание расходует запросы ИИ. Финальная сборка и проверка продолжаются при закрытой вкладке.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button disabled={Boolean(busy) || !form.style_id || probe?.status==="rendering" || probe?.needs_finalization} className="rounded-lg border border-border px-3 py-2 text-[12px] disabled:opacity-40" onClick={()=>perform("probe",async()=>{const r=await probeFn({data:{style_id:form.style_id,hero_id:form.hero_id,image_model:form.image_model}});await load();toast.success("Образец рисуется в фоне");setState(s=>({...s,lastProbe:r.carouselId}));})}>{busy==="probe"?"Запускаю…":"Создать пробную карточку"}</button>
              {probe && <Link className="rounded-lg border border-border px-3 py-2 text-[12px]" to="/author/$carouselId" params={{carouselId:probe.id}}>Открыть образец</Link>}
            </div>
            {probe?.needs_finalization && <p className="mt-2 text-[12px] text-primary">Образец рисуется или проверяется…</p>}
            {probe?.finalization_error && <p className="mt-2 text-[12px] text-amber-400">{probe.finalization_error}</p>}
            {state.editorial.template_url && <img src={state.editorial.template_url} alt="Утверждённый образец редакции" className="mt-4 max-h-72 rounded-lg"/>}
            <p className="mt-3 text-[12px] text-muted-foreground">{templateMatchesDraft?"Образец утверждён и соответствует текущим настройкам.":"Автоматическое утверждение доступно после проверки и вашего подтверждения образца."}</p>
            {probe && !probe.needs_finalization && <button disabled={Boolean(busy)} onClick={()=>perform("accept",async()=>{await save();await acceptFn({data:{carouselId:probe.id}});await load(true);toast.success("Образец утверждён");})} className="mt-3 rounded-lg bg-primary/15 px-3 py-2 text-[12px] text-primary">Я просмотрел образец — использовать его</button>}
          </div>
        </Section>
      </div>
      <Section number="3" title="Сколько самостоятельности дать сотрудникам" description="Начните с режима «Редактор». Каждый этап можно настроить отдельно.">
        <div className="grid gap-3 md:grid-cols-3">{EDITORIAL_MODES.map(m=><button key={m.id} onClick={()=>{set({mode:m.id,stages:{...PRESETS[m.id],approval:m.id==="autopilot" && templateMatchesDraft}});setAutoAck(false);}} className={`rounded-xl border p-4 text-left ${form.mode===m.id?"border-primary bg-primary/5":"border-border"}`}><p className="text-[14px] font-medium">{m.label}</p><p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{m.hint}</p></button>)}</div>
        <div className="grid gap-2 md:grid-cols-2">{STAGES.map(s=><label key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-[13px]"><span>{s.label}</span><select aria-label={s.label} value={form.stages[s.id]?"auto":"manual"} onChange={e=>set({stages:{...form.stages,[s.id]:e.target.value==="auto"}})} disabled={s.id==="approval" && !templateMatchesDraft} className="rounded-md border border-border bg-background px-2 py-1 text-[12px] disabled:opacity-40"><option value="manual">Вручную</option><option value="auto">Автоматически</option></select></label>)}</div>
        {form.stages.approval && <label className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[12px]"><input type="checkbox" checked={autoAck} onChange={e=>setAutoAck(e.target.checked)} className="mt-0.5"/><span>Разрешаю утверждать карточки автоматически по этому образцу, только после положительных проверок. При изменении стиля, героя или модели требуется новый образец.</span></label>}
        {form.stages.publish && <div className="space-y-3 rounded-xl border border-border p-4"><p className="text-[12px]">После утверждения карточки будут автоматически передаваться в расписание выбранного Instagram-канала.</p><button disabled={Boolean(busy)} onClick={()=>perform("channels",async()=>{setChannels((await channelsFn()).filter(c=>/instagram/i.test(c.service)));})} className="rounded-lg border border-border px-3 py-2 text-[12px]">Проверить подключение Buffer</button><Field label="Instagram-канал"><select value={form.channel_id} onChange={e=>set({channel_id:e.target.value})} className={input}><option value="">Выберите канал</option>{form.channel_id && !channels.some(c=>c.id===form.channel_id) && <option value={form.channel_id}>Сохранённый канал — проверьте подключение</option>}{channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><p className="text-[11px] text-muted-foreground">Если Buffer не подключён, добавьте BUFFER_API_KEY в Secrets приложения. Реальная публикация при настройке не выполняется.</p></div>}
        <div className="grid gap-3 md:grid-cols-3"><Field label="Публикаций в неделю"><input className={input} type="number" min={1} max={7} value={form.posts_per_week} onChange={e=>set({posts_per_week:Number(e.target.value)})}/></Field><Field label="Час публикации"><select className={input} value={form.publish_hour} onChange={e=>set({publish_hour:Number(e.target.value)})}>{Array.from({length:24},(_,n)=><option key={n} value={n}>{String(n).padStart(2,"0")}:00</option>)}</select></Field><Field label="Часовой пояс"><input className={input} value={form.timezone} onChange={e=>set({timezone:e.target.value})} placeholder="Europe/Moscow"/></Field></div>
        <div className="flex flex-wrap gap-2">{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d,i)=><button key={d} className={`rounded-lg border px-3 py-2 text-[12px] ${form.publish_days.includes(i+1)?"border-primary bg-primary/10":"border-border"}`} onClick={()=>set({publish_days:form.publish_days.includes(i+1)?form.publish_days.filter(n=>n!==i+1):[...form.publish_days,i+1]})}>{d}</button>)}</div>
      </Section>
      <Section number="4" title="Лимиты и отчёт" description="Лимиты считаются до обращения к сервису. Ноль останавливает новые запросы этого вида.">
        <div className="grid gap-4 md:grid-cols-3">{[["image","Рисунки"],["text","Обращения к ИИ"],["scout","Проверки авторов"]].map(([key,label])=><div key={key} className="space-y-2 rounded-xl border border-border p-3"><p className="text-[13px] font-medium">{label}</p><Field label="За день"><input type="number" min={0} max={5000} value={form.limits[`${key}_day`]} onChange={e=>set({limits:{...form.limits,[`${key}_day`]:Number(e.target.value)}})} className={input}/></Field><Field label="За неделю"><input type="number" min={0} max={5000} value={form.limits[`${key}_week`]} onChange={e=>set({limits:{...form.limits,[`${key}_week`]:Number(e.target.value)}})} className={input}/></Field></div>)}</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">Это жёсткие лимиты числа запросов, включая проверки и попытки исправления. Это не денежный баланс: стоимость моделей различается. Отклонённые сервисом запросы также учитываются как попытки.</p>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.daily_report} onChange={e=>set({daily_report:e.target.checked})}/>Короткий ежедневный отчёт на главной странице</label>
      </Section>
      <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/settings" className="inline-flex items-center gap-2 text-[12px] text-muted-foreground"><Settings2 className="h-4 w-4"/>Ник, призыв к действию и настройки разведки</Link><button disabled={Boolean(busy)} onClick={()=>perform("save",save)} className="rounded-lg bg-primary px-5 py-2.5 text-[13px] text-primary-foreground">{busy==="save"?"Сохраняю…":"Сохранить задание редакции"}</button></div>
    </div>
  </div>;
}
