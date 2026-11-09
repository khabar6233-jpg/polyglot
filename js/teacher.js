// ИИ-учитель: запросы к бесплатному Gemini API прямо из браузера.
// Ключ передаётся в заголовке и хранится только на этом телефоне.

import { sentence } from "./engine.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT = 599; // своё число для «модель не ответила вовремя»
const BUSY = new Set([500, 502, 503, 504, TIMEOUT]);
const STICKY_MS = 10 * 60 * 1000;
const SKIP = ["image", "tts", "live", "audio", "embedding", "native", "omni"];

export const NO_KEY = "Учитель пока не подключён: нужен ключ Gemini. Его можно вставить в «Настройках».";
export const NO_INTERNET = "Нет связи с интернетом. Учитель сейчас недоступен, но упражнения работают как обычно.";

const TENSE = { present: "Present Simple (настоящее)", past: "Past Simple (прошедшее)", future: "Future Simple (будущее)" };
const TYPE = { affirmative: "утверждение", negative: "отрицание", question: "вопрос" };

export function systemPrompt(lesson) {
  return `Ты — терпеливый учитель английского в учебном приложении. Ученик русскоязычный, уровень продвинутый, но объяснять нужно простыми словами.
Урок ${lesson.number}: ${lesson.title}. Темы урока: Present Simple, Past Simple, Future Simple; утверждение, отрицание, вопрос; вспомогательные do/does/did/will и don't/doesn't/didn't/won't; окончание -s у he/she/it; -ed у правильных глаголов и вторая форма неправильных; после do/does/did/will — начальная форма глагола; порядок слов (слова частоты перед глаголом, время в начале или в конце); артикли a/an/the; предлоги in/on/at; сокращения равны полным формам; выбор слова по смыслу (do/make, say/tell, speak/talk, see/watch/look, listen/hear, learn/teach, lend/borrow, bring/take).
Ученик собирает английское предложение из кнопок со словами; среди кнопок есть ловушки.

Правила:
- Отвечай только про этот урок и текущее задание. На посторонние темы мягко возвращай к заданию.
- Пиши по-русски, коротко: 2–4 предложения. Без заголовков, таблиц и markdown-разметки. Английские слова пиши как есть.
- Не выдавай готовый перевод сразу. Наводящими вопросами и подсказками помоги ученику самому понять: какое время, нужно ли вспомогательное слово, какая форма глагола, какой артикль или предлог, какой порядок слов.
- Если ученик ошибся, назови, в каком месте ошибка и какое правило нарушено, но не подставляй правильное слово сразу.
- Если ученик прямо просит ответ и уже пытался (есть собранные слова или ошибки), можно дать ответ целиком и коротко объяснить, почему он такой.
- Правильные ответы ниже — только для тебя; не цитируй их, пока ученик не попросит ответ.`;
}

/** Состояние задания на момент вопроса — добавляется к каждому вопросу ученика. */
export function taskContext(task) {
  const answers = task.variants.slice(0, 6).map((v) => sentence(v, task.punctuation));
  const built = task.built.length ? task.built.join(" ") : "(пока ничего)";
  const wrong = [...new Set(task.wrongWords)];
  const state = task.revealed ? "ученик нажал «Показать ответ»" : task.solved ? "задание решено" : "задание ещё не решено";
  const note = task.item.note ? `\nСноска к заданию (ученик её видит): ${task.item.note}` : "";
  return `[Задание] Перевести на английский: «${task.item.ru}»${note}
Время: ${TENSE[task.item.tense] || task.item.tense}; тип: ${TYPE[task.item.type] || task.item.type}
Правильные ответы (не раскрывай сразу): ${answers.join(" | ")}
Ученик уже собрал: ${built}
Слова, которые при проверке оказались неверными: ${wrong.length ? wrong.join(", ") : "нет"}
Ошибок: ${task.errors}; ${state}`;
}

export const studentMessage = (task, question) => `${taskContext(task)}\n\n[Вопрос ученика] ${question}`;

/** Понятное сообщение вместо технической ошибки сервера. */
export function errorMessage(code, body, model) {
  const lower = (body || "").toLowerCase();
  if (lower.includes("api_key_invalid") || lower.includes("api key not valid") || lower.includes("api key expired")) {
    return "Ключ Gemini не подошёл. Проверьте его в «Настройках».";
  }
  if (lower.includes("location is not supported")) return "Gemini недоступен из вашей страны. Учитель заработает, если включить VPN.";
  if (code === 404) return `Модель «${model}» не найдена. Проверьте название модели в «Настройках».`;
  if (code === 429) return "Слишком много вопросов подряд или закончился бесплатный лимит. Подождите минуту и спросите снова.";
  if (code === 401 || code === 403) return "Ключу не хватает прав. Проверьте его в Google AI Studio и в «Настройках».";
  if (code === 503) return "Модели Gemini сейчас перегружены. Попробуйте через минуту-другую.";
  if (code === TIMEOUT) return "Gemini слишком долго не отвечает — видимо, перегружен. Попробуйте через минуту-другую.";
  if (code >= 500) return "Сервер Gemini сейчас не отвечает. Попробуйте чуть позже.";
  return `Учитель не ответил (ошибка ${code}). Попробуйте ещё раз.`;
}

function details(code, body) {
  try {
    const msg = JSON.parse(body)?.error?.message;
    return `код ${code}` + (msg ? `: ${String(msg).slice(0, 300)}` : "");
  } catch {
    return `код ${code}`;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const version = (name) => parseFloat((/gemini-(\d+(?:\.\d+)?)-/.exec(name) || [])[1] || "0");

export class Gemini {
  constructor() {
    this.fallbackCache = null; // [модель, [запасные]]
    this.working = null; // [запасная модель, время]
  }

  async post(apiKey, model, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey.trim() },
        body,
        signal: ctrl.signal,
      });
      return [res.status, await res.text()];
    } catch (e) {
      if (e.name === "AbortError") return [TIMEOUT, '{"error":{"message":"timeout"}}'];
      throw e; // нет сети
    } finally {
      clearTimeout(timer);
    }
  }

  async postWithRetry(apiKey, model, body, retries) {
    for (let attempt = 0; ; attempt++) {
      const [code, text] = await this.post(apiKey, model, body);
      if (code < 400) return [code, text];
      console.warn(`Gemini HTTP ${code} for ${model}: ${text.slice(0, 500)}`);
      if (!BUSY.has(code) || code === TIMEOUT || attempt >= retries) return [code, text];
      await sleep(1500 * (attempt + 1));
    }
  }

  /** Другие текстовые flash-модели, доступные ключу. Сначала более новые. */
  async fallbacks(apiKey, current) {
    if (this.fallbackCache && this.fallbackCache[0] === current) return this.fallbackCache[1];
    let list = [];
    try {
      const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey.trim() } });
      if (res.ok) {
        const data = await res.json();
        list = (data.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map((m) => String(m.name || "").replace(/^models\//, ""))
          .filter((n) => n.includes("flash") && !SKIP.some((w) => n.includes(w)) && n !== current)
          .sort((a, b) => version(b) - version(a) || a.length - b.length)
          .slice(0, 3);
      }
    } catch {
      /* без запасных */
    }
    this.fallbackCache = [current, list];
    return list;
  }

  parse(text, model) {
    let root;
    try {
      root = JSON.parse(text);
    } catch {
      return { error: "Учитель прислал непонятный ответ. Попробуйте ещё раз." };
    }
    const parts = root?.candidates?.[0]?.content?.parts || [];
    const answer = parts.filter((p) => p.thought !== true).map((p) => p.text || "").join("").trim();
    return answer ? { text: answer, model } : { error: "Учитель промолчал. Попробуйте спросить иначе." };
  }

  /**
   * history: [{fromStudent, text}]. Возвращает {text, model} или {error, details}.
   * Если основная модель перегружена — пробует запасные и помнит выручившую 10 минут.
   */
  async ask(apiKey, model, system, history) {
    if (!apiKey.trim()) return { error: NO_KEY };
    model = model.trim();
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((m) => ({ role: m.fromStudent ? "user" : "model", parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    });
    try {
      const sticky = this.working && Date.now() - this.working[1] < STICKY_MS ? this.working[0] : null;
      if (sticky && sticky !== model) {
        const [c, t] = await this.postWithRetry(apiKey, sticky, body, 0);
        if (c < 400) { this.working = [sticky, Date.now()]; return this.parse(t, sticky); }
      }
      const [code, text] = await this.postWithRetry(apiKey, model, body, 1);
      if (code < 400) { this.working = null; return this.parse(text, model); }
      if (BUSY.has(code)) {
        for (const other of (await this.fallbacks(apiKey, model)).filter((m) => m !== sticky)) {
          const [c, t] = await this.postWithRetry(apiKey, other, body, 0);
          if (c < 400) { this.working = [other, Date.now()]; return this.parse(t, other); }
        }
      }
      return { error: errorMessage(code, text, model), details: details(code, text) };
    } catch (e) {
      return { error: NO_INTERNET, details: String(e) };
    }
  }
}
