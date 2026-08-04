/**
 * ANRI YUSUPOV — сервер сайта (Cloudflare Workers).
 *
 * Отдаёт статику из папки public и обслуживает API админки:
 *   GET  /api/data          — контент и раскладка стола
 *   POST /api/login         — вход по паролю
 *   POST /api/logout        — выход
 *   GET  /api/me            — проверка входа
 *   POST /api/save          — сохранить правки (нужен вход)
 *   POST /api/upload        — залить файл в R2 (нужен вход)
 *   GET  /api/media/<ключ>  — отдать файл из R2
 *
 * Настраивается в панели Cloudflare:
 *   ADMIN_PASSWORD — пароль админки (Secret)
 *   SITE_KV        — KV-хранилище для правок
 *   MEDIA          — R2-хранилище для загрузок (необязательно)
 */

const COOKIE = "anri_adm";
const WEEK = 604800;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

async function makeToken(password) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("anri-admin-v1"));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function isAuthed(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const got = readCookie(request, COOKIE);
  if (!got) return false;
  const want = await makeToken(env.ADMIN_PASSWORD);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

/* Данные: сперва KV (правки из админки), иначе файлы из сборки */
async function loadData(env, request) {
  const url = new URL(request.url);
  const out = {};
  for (const [key, file] of [["site", "/data/site.json"], ["desk", "/data/desk.json"]]) {
    let text = env.SITE_KV ? await env.SITE_KV.get(key) : null;
    if (!text) {
      try {
        const res = await env.ASSETS.fetch(new Request(url.origin + file));
        text = res.ok ? await res.text() : "{}";
      } catch (e) {
        text = "{}";
      }
    }
    try { out[key] = JSON.parse(text); } catch (e) { out[key] = {}; }
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /* всё, что не /api/, — обычные файлы сайта */
    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const route = path.slice(5);                 /* убираем "/api/" */
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return new Response(null, { status: 204 });

    try {
      if (route === "data" && method === "GET") {
        return json(await loadData(env, request));
      }

      if (route === "login" && method === "POST") {
        if (!env.ADMIN_PASSWORD) return json({ error: "Пароль не настроен на сервере" }, 500);
        const body = await request.json().catch(() => ({}));
        if (!body.password || body.password !== env.ADMIN_PASSWORD) {
          await new Promise(r => setTimeout(r, 400));
          return json({ error: "Неверный пароль" }, 401);
        }
        const t = await makeToken(env.ADMIN_PASSWORD);
        return json({ ok: true }, 200, {
          "set-cookie": `${COOKIE}=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${WEEK}`,
        });
      }

      if (route === "logout" && method === "POST") {
        return json({ ok: true }, 200, {
          "set-cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
        });
      }

      if (route === "me" && method === "GET") {
        return json({ authed: await isAuthed(request, env), canUpload: !!env.MEDIA });
      }

      if (route === "save" && method === "POST") {
        if (!(await isAuthed(request, env))) return json({ error: "Нужен вход" }, 401);
        if (!env.SITE_KV) return json({ error: "Хранилище SITE_KV не подключено" }, 500);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ error: "Плохой запрос" }, 400);

        if (body.site) {
          if (!Array.isArray(body.site.projects))
            return json({ error: "site.projects должен быть списком" }, 400);
          await env.SITE_KV.put("site", JSON.stringify(body.site));
        }
        if (body.desk) {
          if (!Array.isArray(body.desk.icons))
            return json({ error: "desk.icons должен быть списком" }, 400);
          await env.SITE_KV.put("desk", JSON.stringify(body.desk));
        }
        return json({ ok: true, savedAt: new Date().toISOString() });
      }

      if (route === "upload" && method === "POST") {
        if (!(await isAuthed(request, env))) return json({ error: "Нужен вход" }, 401);
        if (!env.MEDIA) return json({ error: "Хранилище MEDIA (R2) не подключено" }, 501);

        const form = await request.formData();
        const file = form.get("file");
        if (!file || typeof file === "string") return json({ error: "Файл не передан" }, 400);
        if (file.size > 100 * 1024 * 1024) return json({ error: "Файл больше 100 МБ" }, 413);

        const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await env.MEDIA.put(key, file.stream(), {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
        });
        return json({ ok: true, url: `api/media/${key}`, name: file.name, bytes: file.size });
      }

      if (route.startsWith("media/") && method === "GET") {
        if (!env.MEDIA) return new Response("Хранилище не подключено", { status: 501 });
        const obj = await env.MEDIA.get(route.slice("media/".length));
        if (!obj) return new Response("Не найдено", { status: 404 });
        const h = new Headers();
        obj.writeHttpMetadata(h);
        h.set("etag", obj.httpEtag);
        h.set("cache-control", "public, max-age=31536000, immutable");
        return new Response(obj.body, { headers: h });
      }

      return json({ error: "Неизвестный маршрут" }, 404);
    } catch (err) {
      return json({ error: "Сбой на сервере", detail: String((err && err.message) || err) }, 500);
    }
  },
};
