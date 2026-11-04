import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, ExternalLink, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { bufferChannels, bufferPublish, refreshDelivery, verifyUnknownDelivery } from "@/lib/buffer";
import { slideToPublicUrl } from "@/lib/buffer-upload";
import { fetchImageData } from "@/lib/server-fns";
import { assertReady } from "@/lib/readiness";
import { useSettings } from "@/hooks/use-settings";

// Автопубликация через Buffer: карусель уходит в канал аккаунта сразу в очередь
// или на выбранное время. Картинки заливаются публично — Buffer открывает их по ссылке.
export default function BufferPanel({ carousel, slides, style, aspect, caption, onDone }) {
  const channelsFn = useServerFn(bufferChannels);
  const publishFn = useServerFn(bufferPublish);
  const deliveryFn=useServerFn(refreshDelivery),verifyFn=useServerFn(verifyUnknownDelivery);
  const proxy = useServerFn(fetchImageData);
  const { settings, save } = useSettings();
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [step, setStep] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [postId,setPostId]=useState("");
  const submitted=Boolean(carousel.buffer_post_id || ["submitting","unknown"].includes(carousel.publish_state));
  const checkDelivery=async(link=false)=>{
    setBusy("delivery");
    try{const result=await (link?verifyFn({data:{carouselId:carousel.id,postId:postId.trim()}}):deliveryFn({data:{carouselId:carousel.id}}));toast.success(result.state==="published"?"Публикация подтверждена в Instagram":result.note || "Статус обновлён");onDone?.();}
    catch(e){toast.error(String(e.message || e).slice(0,300));}finally{setBusy("");}
  };

  const channelId = settings?.buffer_channel_id || "";

  useEffect(() => {
    (async () => {
      try {
        setChannels(await channelsFn());
      } catch (e) {
        setError(String(e.message || e).slice(0, 240));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pickChannel = async (id) => {
    try {
      await save({ buffer_channel_id: id });
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 180));
    }
  };

  const send = async (scheduled) => {
    if (!channelId) return toast.error("Выберите канал Buffer");
    if (scheduled && !dueAt) return toast.error("Укажите дату и время публикации");
    if (!slides.length) return;
    if (slides.length > 10) return toast.error("Buffer принимает не больше 10 кадров в карусели");
    setBusy(scheduled ? "schedule" : "queue");
    try {
      assertReady(slides, carousel.slides_count);
      const imageUrls = [];
      for (const slide of slides) {
        setStep(`кадр ${slide.position} из ${slides.length}`);
        imageUrls.push(await slideToPublicUrl(slide, { style, aspect, proxy: (url) => proxy({ data: { url } }) }));
      }
      setStep("отправляю в Buffer…");
      await publishFn({
        data: {
          carouselId: carousel.id,
          channelId,
          text: caption,
          imageUrls,
          dueAt: scheduled ? new Date(dueAt).toISOString() : null,
        },
      });
      toast.success(scheduled ? "Запланировано в Buffer" : "Отправлено в очередь Buffer");
      onDone?.();
    } catch (e) {
      toast.error(String(e.message || e).slice(0, 220));
    } finally {
      setBusy("");
      setStep("");
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-[hsl(var(--card))] p-4">
      {(submitted || carousel.delivery_status) && <div className="mb-3 space-y-2 rounded-lg border border-border p-3 text-[12px]">
        <p>{carousel.status==="published"?"Опубликовано в Instagram":carousel.delivery_status==="error"?"Публикация не вышла":carousel.publish_state==="unknown"?"Результат отправки неизвестен — повторная отправка заблокирована":"Передано в Buffer; ожидается подтверждение публикации"}</p>
        {carousel.delivery_note && <p className="text-amber-400">{carousel.delivery_note}</p>}
        {carousel.published_url && <a className="inline-flex items-center gap-1 text-primary" target="_blank" rel="noreferrer" href={carousel.published_url}>Открыть публикацию <ExternalLink className="h-3 w-3"/></a>}
        {carousel.buffer_post_id && <button disabled={Boolean(busy)} onClick={()=>checkDelivery()} className="block rounded-md border border-border px-2 py-1.5">Проверить статус публикации</button>}
        {carousel.publish_state==="unknown" && !carousel.buffer_post_id && <div className="space-y-2"><a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="text-primary">Проверить очередь Buffer</a><p className="text-[11px] text-muted-foreground">Если пост найден, укажите его ID. Приложение сверит канал, подпись и изображения; новый пост при этом не создаётся.</p><input aria-label="ID найденного поста Buffer" value={postId} onChange={e=>setPostId(e.target.value)} placeholder="ID поста из Buffer" className="w-full rounded-md border border-border bg-background px-2 py-1.5"/><button disabled={Boolean(busy)||!postId.trim()} onClick={()=>checkDelivery(true)} className="rounded-md border border-border px-2 py-1.5 disabled:opacity-40">Сверить найденный пост</button></div>}
      </div>}
      <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <Radio className="h-3.5 w-3.5" /> автопубликация · Buffer
      </p>

      {loading ? (
        <p className="text-[12px] text-muted-foreground">Читаю каналы…</p>
      ) : error ? (
        <div className="space-y-1.5">
          <p className="text-[11.5px] leading-snug text-amber-400">{error}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Ключ создаётся в Buffer: Настройки → API, затем сохраняется в секретах приложения как BUFFER_API_KEY.
          </p>
        </div>
      ) : channels.length === 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11.5px] leading-snug text-muted-foreground">В аккаунте Buffer нет подключённых каналов.</p>
          <a
            href="https://publish.buffer.com/channels"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] text-[hsl(var(--primary))] hover:opacity-80"
          >
            <ExternalLink className="h-3 w-3" /> подключить Instagram в Buffer
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => pickChannel(channel.id)}
                className={
                  channelId === channel.id
                    ? "rounded-lg border border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10 px-2.5 py-1.5 text-[11.5px]"
                    : "rounded-lg border border-border/70 px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                }
              >
                {channel.name}
                <span className="ml-1 text-[10px] opacity-60">{channel.service}</span>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded-md border border-border bg-[hsl(var(--input))]/40 px-2 py-1 text-[11.5px] text-foreground outline-none focus:border-[hsl(var(--primary))]/50"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => send(false)}
              disabled={Boolean(busy) || !channelId || submitted}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-[12px] font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            >
              {busy === "queue" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />} в очередь
            </button>
            <button
              onClick={() => send(true)}
              disabled={Boolean(busy) || !channelId || !dueAt || submitted}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
            >
              {busy === "schedule" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />} на время
            </button>
          </div>

          {step && <p className="text-[11px] text-muted-foreground">{step}</p>}
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            Кадры загружаются в публичное хранилище (stored publicly — anyone with the link can open them): Buffer забирает их по ссылке.
          </p>
        </div>
      )}
    </div>
  );
}
