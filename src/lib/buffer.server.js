// Клиент Buffer: GraphQL-запросы идут с личным ключом владельца аккаунта.
import { secrets } from "base44:runtime";

const ENDPOINT = "https://api.buffer.com";

// Значения подставляем в запрос строковыми литералами — экранируем и чистим,
// чтобы идентификатор из ответа Buffer не мог сломать GraphQL-документ.
const literal = (value) => JSON.stringify(String(value || ""));

async function call(query) {
  const key = secrets.get("BUFFER_API_KEY");
  if (!key) throw new Error("Buffer не подключён: добавьте ключ BUFFER_API_KEY в секреты приложения.");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(25000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.errors?.[0]?.message || `Buffer ответил ошибкой ${res.status}`);
  if (body?.errors?.length) throw new Error(String(body.errors[0].message || "Buffer отклонил запрос").slice(0, 300));
  return body?.data || {};
}

export async function listBufferChannels() {
  const data = await call("query { account { organizations { id name } } }");
  const orgs = data?.account?.organizations || [];
  const all = [];
  for (const org of orgs) {
    const page = await call(
      `query { channels(input: { organizationId: ${literal(org.id)} }) { id name descriptor service avatar timezone } }`,
    );
    for (const channel of page?.channels || []) {
      all.push({
        id: channel.id,
        name: channel.name || channel.descriptor || "канал",
        service: channel.service || "",
        descriptor: channel.descriptor || "",
        avatar: channel.avatar || "",
        organization: org.name || "",
        organizationId: org.id,
      });
    }
  }
  return all;
}

// Публикация: в очередь канала или на конкретное время.
export async function createBufferPost({ channelId, text, imageUrls, dueAt }) {
  const assets = (imageUrls || []).map((url) => `{ image: { url: ${literal(url)} } }`).join(", ");
  const scheduling = dueAt
    ? `mode: customScheduled, dueAt: ${literal(dueAt)}`
    : "mode: addToQueue";
  const data = await call(`mutation {
    createPost(input: {
      text: ${literal(text)}
      channelId: ${literal(channelId)}
      schedulingType: automatic
      ${scheduling}
      assets: [${assets}]
    }) {
      ... on PostActionSuccess { post { id text } }
      ... on MutationError { message }
    }
  }`);
  const result = data?.createPost;
  if (!result?.post?.id) {const error=new Error(String(result?.message || "Buffer не подтвердил результат отправки").slice(0, 300));if(result?.message)error.submissionRejected=true;throw error;}
  return { id: result.post.id, dueAt: dueAt || "" };
}
export async function getBufferPost(postId) {
  const data = await call(`query { post(input: { id: ${literal(postId)} }) { id channelId text assets { source } status dueAt sentAt externalLink schedulingType error { message supportUrl } } }`);
  if (!data.post || data.post.id !== postId) throw new Error("Buffer не вернул запрошенную публикацию");
  return data.post;
}
