import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const DEFAULTS = {
  instagram_handle: "",
  codeword: "ХОЧУ",
  gift: "",
  blog_topic: "",
  text_mode: "close",
  digest_day: 1,
  digest_hour: 9,
  timezone: "Europe/Moscow",
  scout_limit: 40,
  cta_memory: {},
  buffer_channel_id: "",
  max_image_requests_per_carousel: 80,
  image_model: "automatic",
};

// На странице настройки читают сразу несколько блоков — держим один общий запрос.
let cachePromise = null;

async function fetchSettings() {
  const page = await base44.entities.Settings.list({ sort: "-created_date", limit: 1 });
  let record = (page.items || [])[0];
  if (!record) record = await base44.entities.Settings.create(DEFAULTS);
  return record;
}

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force) => {
    if (force || !cachePromise) cachePromise = fetchSettings();
    setLoading(true);
    const record = await cachePromise;
    setSettings(record);
    setLoading(false);
    return record;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch) => {
      const current = settings || (await load());
      const next = { ...patch, ...(["digest_day","digest_hour","timezone"].some(key=>key in patch) ? { digest_last_slot: "" } : {}) };
      const updated = await base44.entities.Settings.update(current.id, next);
      const merged = { ...current, ...patch, ...(updated || {}) };
      cachePromise = Promise.resolve(merged);
      setSettings(merged);
      return updated;
    },
    [settings, load],
  );

  return { settings, loading, save, reload: () => load(true) };
}

