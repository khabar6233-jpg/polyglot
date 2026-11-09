// Веб-версия приложения: экраны и связь с движком.

import {
  LessonEngine, Memory, average, isDone, scoreOf, answerText, otherAnswers, usedButtons, wordCategory,
} from "./engine.js";

const PLACEHOLDER = "Нажимайте слова по порядку. Кнопка ⌫ стирает последнее слово.";

/** Класс цвета группы слова: вспомогательные, местоимения, артикли, предлоги, вопросительные. */
const catClass = (w) => {
  const c = wordCategory(w);
  return c ? ` cat-${c}` : "";
};
import {
  loadProgress, saveProgress, loadSettings, saveSettings, emptyProgress, askPersistentStorage, DEFAULT_MODEL,
} from "./storage.js";
import { Gemini, systemPrompt, studentMessage } from "./teacher.js";

// ---------- Состояние ----------

const S = {
  lesson: null,
  engine: null,
  task: null,
  progress: loadProgress(),
  settings: loadSettings(),
  recorded: false,
  justPassed: false,
  sheet: null, // "hint" | "more" — открытая шторка

  chat: [], // {fromStudent, text, shown}
  teacherBusy: false,
  teacherError: null,
  keyCheck: null,
  error: null,
};
const gemini = new Gemini();
let lastFailedChecks = 0;

const lessonProgress = () =>
  (S.lesson && S.progress.lessons[S.lesson.id]) || { scores: [], solved: 0, passed: false };

// ---------- Маленький помощник для создания элементов ----------

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Разметка правил: **жирный**, ==акцент==, [[серый]], ++верно++, --неверно--. */
function markup(text) {
  const marks = [["**", "**", "b"], ["==", "==", "m-accent"], ["[[", "]]", "m-muted"], ["++", "++", "m-good"], ["--", "--", "m-bad"]];
  const active = new Set();
  let out = "", buf = "";
  const flush = () => {
    if (!buf) return;
    let piece = esc(buf);
    for (const [, , cls] of marks) {
      if (!active.has(cls)) continue;
      piece = cls === "b" ? `<b>${piece}</b>` : `<span class="${cls}">${piece}</span>`;
    }
    out += piece;
    buf = "";
  };
  for (let i = 0; i < text.length;) {
    const m = marks.find(([open, close, cls]) => text.startsWith(active.has(cls) ? close : open, i));
    if (m) {
      flush();
      const [open, close, cls] = m;
      i += (active.has(cls) ? close : open).length;
      active.has(cls) ? active.delete(cls) : active.add(cls);
    } else {
      buf += text[i++];
    }
  }
  flush();
  return out;
}

// ---------- Действия ----------

function persist() {
  saveProgress(S.progress);
}

function nextTask() {
  const e = S.engine;
  const item = Memory.pick(e.lesson.items, (it) => e.elementsOf(it), S.progress, S.task?.item.id);
  S.task = e.newTask(item);
  S.recorded = false;
  S.justPassed = false;
  S.chat = [];
  S.teacherError = null;
  lastFailedChecks = 0;
}

function update(change) {
  if (!S.task) return;
  const t = change(S.engine, S.task);
  S.task = t;
  if (isDone(t) && !S.recorded) {
    S.recorded = true;
    const was = lessonProgress().passed;
    S.progress = Memory.record(S.progress, S.lesson.id, t, S.engine.elementsOf(t.item));
    if (!was && lessonProgress().passed) S.justPassed = true;
    persist();
    // Автоозвучка: сразу произносим правильный ответ (iPhone разрешает это только в ответ на нажатие — так и есть).
    if (S.settings.autoSpeak) speak();
  }
  render();
}

function speak() {
  const text = S.task ? answerText(S.task) : "";
  const synth = window.speechSynthesis;
  if (!synth) return alert("Этот браузер не умеет озвучивать текст.");
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === "en-US") || voices.find((v) => v.lang?.startsWith("en"));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang || "en-US";
  if (voice) u.voice = voice;
  u.rate = 0.9;
  synth.cancel();
  synth.speak(u);
}

async function askTeacher(question) {
  const q = question.trim();
  const t = S.task;
  if (!q || !t || S.teacherBusy) return;
  S.chat.push({ fromStudent: true, text: studentMessage(t, q), shown: q });
  S.teacherBusy = true;
  S.teacherError = null;
  render();
  const reply = await gemini.ask(S.settings.apiKey, S.settings.model, systemPrompt(S.lesson), S.chat);
  S.teacherBusy = false;
  // Пока учитель думал, ученик перешёл к другому предложению — ответ уже не нужен.
  if (!S.chat.length || S.task?.item.id !== t.item.id) return render();
  if (reply.error) {
    if (S.chat.at(-1)?.fromStudent) S.chat.pop();
    S.teacherError = reply.error;
  } else {
    const fallback = reply.model !== S.settings.model.trim() ? `\n\n(основная модель перегружена, ответила ${reply.model})` : "";
    S.chat.push({ fromStudent: false, text: reply.text, shown: reply.text + fallback });
  }
  render();
}

async function checkKey() {
  S.keyCheck = { text: "Проверяю…", ok: null };
  render();
  const reply = await gemini.ask(S.settings.apiKey, S.settings.model, "Отвечай одним словом.",
    [{ fromStudent: true, text: "Скажи «работает»." }]);
  if (reply.error) {
    S.keyCheck = { text: reply.error + (reply.details ? `\nПодробности: ${reply.details}` : ""), ok: false };
  } else {
    S.keyCheck = {
      text: reply.model === S.settings.model.trim() ? "Всё работает: учитель на связи."
        : `Всё работает. Модель ${S.settings.model} сейчас перегружена, поэтому ответила запасная: ${reply.model}.`,
      ok: true,
    };
  }
  render();
}

function applyTheme() {
  const t = S.settings.theme;
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}

// ---------- Экран упражнения ----------

function header() {
  const lp = lessonProgress();
  const avg = average(lp.scores);
  const left = Memory.PASS_MIN_SOLVED - lp.scores.length;
  return h("header", { class: "head" },
    h("div", { class: "row" },
      h("div", { class: "title grow" }, `Урок ${S.lesson.number}`, h("span", {}, S.lesson.title)),
      h("div", { class: "score" }, avg.toFixed(1), h("span", {}, " / 5"))),
    h("div", { class: "meter" }, h("i", { style: `width:${(avg / 5) * 100}%` }), h("span", { class: "goal" })),
    h("div", { class: "meter-row" },
      h("span", {}, `Решено: ${lp.solved}`),
      lp.passed ? h("span", { class: "ok" }, "Цель достигнута, следующий урок открыт")
        : h("span", {}, left > 0 ? `Цель 4.5 · ещё минимум ${left}` : "Цель 4.5")));
}

function taskCard() {
  const t = S.task;
  const done = isDone(t);
  const built = h("div", { class: "built" + (done ? " done" : ""), id: "built" });
  if (!t.built.length) built.append(h("span", { class: "ph" }, PLACEHOLDER));
  t.built.forEach((w, i) => {
    const shown = (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w) + (done && i === t.built.length - 1 ? t.punctuation : "");
    built.append(h("span", { class: "chip" + (t.marked[i] ? " wrong" : catClass(w)) }, shown));
  });

  const card = h("section", { class: "card" },
    h("div", {}, h("p", { class: "ru" }, t.item.ru), t.item.note ? h("div", { class: "note" }, "* " + t.item.note) : null),
    built);

  if (!done) {
    // Строка состояния всегда одной высоты, чтобы кнопки слов не прыгали.
    const msg = t.feedback === "wrong" ? "Красные слова — неверные. Сотрите их кнопкой ⌫."
      : t.feedback === "missing" ? "Не хватает слов." : null;
    card.append(h("div", { class: "status" },
      msg ? h("span", { class: "msg-bad" }, msg)
        : h("span", { class: "errors" + (t.errors ? " bad" : "") }, `Ошибок: ${t.errors}`),
      h("button", { class: "link", onclick: () => update((e, task) => e.reveal(task)) }, "Показать ответ")));
  }
  return card;
}

/** Ответ собран: итог и «Озвучить» / «Дальше» на месте кнопок слов. */
function donePanel() {
  const t = S.task;
  const head = t.revealed ? ["Ответ показан · балл 2", "mid"]
    : t.errors === 0 ? ["Верно! · балл 5", "ok"] : [`Получилось, ошибок: ${t.errors} · балл ${scoreOf(t)}`, "mid"];
  const others = otherAnswers(t);
  return h("div", { class: "done-panel" },
    h("div", { class: `result-head ${head[1]}` }, head[0]),
    S.justPassed ? h("div", { class: "pass" }, "Цель урока достигнута: средний балл 4.5! Следующий урок открыт.") : null,
    others.length ? h("div", { class: "others" }, "Тоже правильно: " + others.slice(0, 3).join("  ·  ")) : null,
    h("div", { class: "row", style: "margin-top:auto" },
      h("button", { class: "btn big", onclick: speak }, "Озвучить"),
      h("button", { class: "btn big primary", id: "next", onclick: () => { nextTask(); render(); } }, "Дальше")));
}

function exerciseView() {
  const t = S.task;
  const done = isDone(t);
  const enter = S.progress.enterMode;
  const used = usedButtons(t);
  return h("main", { class: "screen exercise" },
    header(),
    taskCard(),
    // Нажатое слово «уходит» в строку ответа: его кнопка пустеет, но место остаётся, чтобы остальные не сдвигались.
    done ? donePanel() : h("div", { class: "tiles" }, t.buttons.map((w, i) =>
      h("button", {
        class: "tile" + catClass(w) + (used[i] ? " used" : ""),
        disabled: used[i],
        "aria-hidden": used[i] ? "true" : null,
        onclick: () => update((e, task) => e.tap(task, w, !enter)),
      }, w))),
    h("nav", { class: "bar" },
      done ? null : h("div", { class: "row" },
        h("button", { class: "btn erase", "aria-label": "Ой, ошибся: стереть последнее слово", disabled: !t.built.length, onclick: () => update((e, task) => e.undo(task)) }, "⌫"),
        enter ? h("button", { class: "btn primary", disabled: !t.built.length, onclick: () => update((e, task) => e.check(task)) }, "Ввод") : null),
      h("div", { class: "tabs" },
        h("button", { onclick: () => { S.sheet = "hint"; render(); } }, "Подсказка"),
        h("button", { onclick: () => go("theory") }, "Правила"),
        h("button", { class: "accent", onclick: () => go("teacher") }, "Учитель"),
        h("button", { onclick: () => { S.sheet = "more"; render(); } }, "Ещё"))));
}

/** Шторка «Ещё»: ползунок «Ввод», трудные слова, настройки. */
function moreSheet() {
  const enter = S.progress.enterMode;
  const close = () => { S.sheet = null; render(); };
  return [
    h("div", { class: "veil", onclick: close }),
    h("div", { class: "sheet", role: "dialog", "aria-label": "Ещё" },
      h("div", { class: "inner" },
        h("div", { class: "topbar" }, h("h1", {}, "Ещё"), h("button", { class: "link", onclick: close }, "Закрыть")),
        h("label", { class: "switch-row" },
          h("div", { class: "grow" },
            h("div", { style: "font-weight:650" }, "Ввод"),
            h("div", { class: "muted small" }, enter ? "Проверка по кнопке «Ввод»" : "Проверка сразу после последнего слова")),
          h("span", { class: "switch" },
            h("input", { type: "checkbox", checked: enter, onchange: (e) => { S.progress = { ...S.progress, enterMode: e.target.checked }; persist(); render(); } }),
            h("span"))),
        h("button", { class: "btn", onclick: () => go("hard") }, "Мои трудные слова"),
        h("button", { class: "btn", onclick: () => go("settings") }, "Настройки"))),
  ];
}

// ---------- Правила и подсказка ----------

const TENSE_COLOR = { present: "var(--present)", past: "var(--past)", future: "var(--future)" };

function tenseTable(table) {
  const cols = table.columns || ["Вопрос", "Утверждение", "Отрицание"];
  const hl = table.highlight;
  let html = '<table class="tt"><thead><tr>' +
    cols.map((c, i) => `<th class="${hl === i ? "hl" : ""}">${esc(c)}</th>`).join("") + "</tr></thead><tbody>";
  for (const row of table.rows) {
    if (row.label) {
      html += `<tr><td colspan="${cols.length}"><span class="tense" style="color:${TENSE_COLOR[row.tense] || "var(--accent)"}">${esc(row.label)}</span></td></tr>`;
    }
    for (const line of row.lines) {
      html += "<tr>" + line.cells.map((c, i) =>
        `<td class="${hl === i ? "hl" : ""}"><span class="who">${esc(line.who)}</span>${markup(c)}</td>`).join("") + "</tr>";
    }
  }
  return h("div", { html: html + "</tbody></table>" });
}

function theoryBlock(block, id) {
  switch (block.type) {
    case "h1": return h("h1", {}, block.text);
    case "h2": return h("h2", { id }, block.text);
    case "h3": return h("h3", {}, block.text);
    case "note": return h("div", { class: "note-box", html: markup(block.text) });
    case "list": return h("ul", {}, block.items.map((it) => h("li", { html: markup(it) })));
    case "table": return block.table ? tenseTable(block.table) : null;
    default: return h("p", { html: markup(block.text) });
  }
}

function topbar(title, back = "") {
  return h("div", { class: "topbar" }, h("h1", {}, title), h("button", { class: "link", onclick: () => go(back) }, "Назад"));
}

function theoryView() {
  const blocks = S.lesson.theory || [];
  const sections = blocks.map((b, i) => [b, i]).filter(([b]) => b.type === "h2");
  return h("main", { class: "screen" },
    topbar("Правила урока"),
    h("div", { class: "scroll" },
      h("nav", { class: "panel toc" },
        h("div", { class: "eyebrow" }, "Содержание"),
        sections.map(([b, i], n) => h("a", {
          href: `#theory`,
          onclick: (e) => { e.preventDefault(); document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: "smooth" }); },
        }, `${n + 1}. ${b.text}`))),
      h("article", { class: "theory" }, blocks.map((b, i) => theoryBlock(b, `sec-${i}`)))));
}

function hintSheet() {
  const close = () => { S.sheet = null; render(); };
  return [
    h("div", { class: "veil", onclick: close }),
    h("div", { class: "sheet", role: "dialog", "aria-label": "Подсказка" },
      h("div", { class: "inner theory" },
        h("div", { class: "topbar" }, h("h1", {}, "Таблица времён"),
          h("button", { class: "link", onclick: close }, "Закрыть")),
        h("div", { class: "legend" },
          h("span", { class: "cat-aux" }, "do, does, did, will, not"),
          h("span", { class: "cat-pron" }, "I, you, he, my…"),
          h("span", { class: "cat-art" }, "a, an, the"),
          h("span", { class: "cat-prep" }, "in, on, at, to…"),
          h("span", { class: "cat-q" }, "where, how…")),
        (S.lesson.hint || []).map((b) => theoryBlock(b)))),
  ];
}

// ---------- Мои трудные слова ----------

function describe(k) {
  const [kind, ...rest] = k.split(":");
  const v = rest.join(":");
  const names = {
    aux: [v, "вспомогательное слово"], verb: [v, "глагол"], article: [v, "артикль"], prep: [v, "предлог"],
    pron: [v === "i" ? "I" : v, "местоимение"], word: [v, "слово"], time: [v, "слова времени"],
    choice: [v.replace(/-/g, " / "), "выбор слова по смыслу"],
  };
  if (names[kind]) return names[kind];
  if (kind === "past") return v === "-ed" ? ["-ed", "прошедшее время правильных глаголов"] : [v, "прошедшая форма неправильного глагола"];
  if (kind === "form") return v === "-s" ? ["-s у he, she, it", "форма глагола в настоящем времени"]
    : v === "base" ? ["начальная форма глагола", "после do, does, did, will и с I, you, we, they"] : [v, "форма глагола"];
  if (kind === "order") return v === "question" ? ["порядок слов в вопросе", "do, does, did, will в начале"]
    : v === "adverb" ? ["место наречия", "usually, often, well…"] : [v, "порядок слов"];
  if (kind === "tense") return [{ present: "Present Simple", past: "Past Simple", future: "Future Simple" }[v] || v, "время"];
  if (kind === "type") return [{ affirmative: "утверждение", negative: "отрицание", question: "вопрос" }[v] || v, "тип предложения"];
  return [k, ""];
}

function hardView() {
  const list = Object.entries(S.progress.elements)
    .filter(([, s]) => s.errors > 0)
    .sort(([ka, a], [kb, b]) => b.weight - a.weight || (/^(tense|type):/.test(ka) ? 1 : 0) - (/^(tense|type):/.test(kb) ? 1 : 0));
  return h("main", { class: "screen" },
    topbar("Мои трудные слова"),
    h("div", { class: "scroll" },
      h("p", { class: "muted", style: "margin:0" }, "Здесь то, в чём вы чаще всего ошибаетесь. Предложения с этими словами будут попадаться чаще, пока вы не начнёте отвечать без ошибок."),
      list.length ? list.map(([k, s]) => {
        const [title, sub] = describe(k);
        return h("div", { class: "hard-item" },
          h("div", { class: "row" },
            h("div", { class: "grow" }, h("div", { style: "font-weight:650;font-size:18px" }, title), sub ? h("div", { class: "muted small" }, sub) : null),
            h("span", { class: "small", style: "color:var(--bad)" }, `ошибок: ${s.errors}`)),
          h("div", { class: "bar-line" }, h("i", { style: `width:${Math.max(3, (s.weight / Memory.MAX_WEIGHT) * 100)}%` })));
      }) : h("p", { class: "muted" }, "Пока ошибок нет.")),
    h("button", {
      class: "btn danger",
      onclick: () => {
        if (!confirm("Сбросить статистику? Удалятся все ошибки, веса слов и баллы. Уже открытые уроки останутся открытыми. Отменить это нельзя.")) return;
        const lessons = Object.fromEntries(Object.entries(S.progress.lessons).map(([id, lp]) => [id, { scores: [], solved: 0, passed: lp.passed }]));
        S.progress = { ...emptyProgress(), lessons, enterMode: S.progress.enterMode };
        persist();
        render();
      },
    }, "Сбросить статистику"));
}

// ---------- Учитель ----------

const QUICK = ["С чего начать?", "Почему у меня ошибка?", "Какое тут время?"];

function teacherView() {
  const t = S.task;
  const send = () => {
    const input = document.getElementById("ask");
    const q = input.value;
    input.value = "";
    askTeacher(q);
  };
  return h("main", { class: "screen" },
    topbar("Учитель"),
    h("div", { class: "scroll", id: "chat-scroll" },
      h("div", { class: "panel" },
        h("div", {}, `Задание: «${t.item.ru}»`),
        t.built.length ? h("div", { class: "muted small" }, "Вы собрали: " + t.built.join(" ")) : null,
        h("div", { class: "muted small" }, "Учитель видит задание, правильный ответ, ваш ответ и ошибки. Он будет подсказывать, а не выдавать ответ сразу.")),
      !S.settings.apiKey ? h("div", { class: "panel", style: "background:var(--accent-soft)" },
        "Чтобы учитель заработал, вставьте ключ Gemini в настройках. Это нужно сделать один раз.",
        h("button", { class: "btn primary", onclick: () => go("settings", "teacher") }, "Открыть настройки")) : null,
      h("div", { class: "chat", id: "chat" },
        S.chat.map((m) => h("div", { class: "msg " + (m.fromStudent ? "me" : "t") }, m.shown)),
        S.teacherBusy ? h("div", { class: "msg t" }, "Думаю…") : null,
        S.teacherError ? h("div", { class: "check-bad small" }, S.teacherError) : null,
        S.teacherError?.includes("Настройк") ? h("button", { class: "link", onclick: () => go("settings", "teacher") }, "Открыть настройки") : null)),
    h("div", { class: "quick" }, QUICK.map((q) => h("button", { disabled: S.teacherBusy, onclick: () => askTeacher(q) }, q))),
    h("div", { class: "ask" },
      h("textarea", { id: "ask", rows: 1, placeholder: "Ваш вопрос…",
        onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } } }),
      h("button", { class: "btn primary", disabled: S.teacherBusy, onclick: send }, "Спросить")));
}

// ---------- Настройки ----------

function settingsView() {
  const s = S.settings;
  const setTheme = (theme) => { S.settings = { ...S.settings, theme }; saveSettings(S.settings); applyTheme(); render(); };
  const save = () => {
    S.settings = {
      ...S.settings,
      apiKey: document.getElementById("key").value.trim(),
      model: document.getElementById("model").value.trim() || DEFAULT_MODEL,
    };
    saveSettings(S.settings);
  };
  return h("main", { class: "screen" },
    topbar("Настройки", settingsBack),
    h("div", { class: "scroll" },
    h("label", { class: "switch-row" },
      h("div", { class: "grow" },
        h("div", { style: "font-weight:650" }, "Автоозвучка"),
        h("div", { class: "muted small" }, "Произносить правильный ответ, как только предложение собрано")),
      h("span", { class: "switch" },
        h("input", { type: "checkbox", checked: !!s.autoSpeak, onchange: (e) => { S.settings = { ...S.settings, autoSpeak: e.target.checked }; saveSettings(S.settings); } }),
        h("span"))),
    h("section", { class: "panel" },
      h("div", { style: "font-weight:650;font-size:18px" }, "Тема"),
      [["system", "Как в телефоне"], ["light", "Светлая"], ["dark", "Тёмная"]].map(([v, label]) =>
        h("label", { class: "radio" },
          h("input", { type: "radio", name: "theme", checked: s.theme === v, onchange: () => setTheme(v) }), label))),
    h("section", { class: "panel" },
      h("div", { style: "font-weight:650;font-size:18px" }, "Учитель (Gemini)"),
      h("div", { class: "muted small" }, "Ключ хранится только в этом браузере на этом телефоне. В файлы проекта и на GitHub он не попадает."),
      h("div", { class: "field" }, h("label", { for: "key" }, "Ключ Gemini API"),
        h("input", { class: "input", id: "key", type: "password", autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: s.apiKey })),
      h("div", { class: "field" }, h("label", { for: "model" }, `Модель (по умолчанию ${DEFAULT_MODEL})`),
        h("input", { class: "input", id: "model", autocapitalize: "off", spellcheck: "false", value: s.model })),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: () => { save(); S.keyCheck = { text: "Сохранено.", ok: true }; render(); } }, "Сохранить"),
        h("button", { class: "btn", onclick: () => { save(); checkKey(); } }, "Проверить")),
      S.keyCheck ? h("div", { class: S.keyCheck.ok === false ? "check-bad" : S.keyCheck.ok ? "check-ok" : "muted" }, S.keyCheck.text) : null,
      h("div", { class: "muted small" }, "Где взять ключ: откройте aistudio.google.com, войдите в Google-аккаунт, нажмите «Get API key» → «Create API key» и скопируйте ключ сюда."))));
}

// ---------- Переходы между экранами ----------

let settingsBack = "";

function go(view, from = "") {
  if (view === "settings") settingsBack = from;
  if (view === "settings") S.keyCheck = null;
  location.hash = view ? `#${view}` : "";
}

function currentView() {
  const v = location.hash.replace("#", "");
  return ["theory", "hard", "teacher", "settings"].includes(v) ? v : "exercise";
}

let lastView = null;

function render() {
  const app = document.getElementById("app");
  if (S.error) {
    app.replaceChildren(h("main", { class: "screen" }, h("p", { class: "check-bad" }, S.error)));
    return;
  }
  if (!S.task) return;
  const view = currentView();
  // Сохраняем то, что ученик печатает в поле вопроса, пока экран перерисовывается.
  const ask = document.getElementById("ask");
  const draft = ask ? ask.value : "";
  const focused = document.activeElement?.id;

  const views = { exercise: exerciseView, theory: theoryView, hard: hardView, teacher: teacherView, settings: settingsView };
  const nodes = [views[view]()];
  if (view === "exercise" && S.sheet === "hint") nodes.push(...hintSheet());
  if (view === "exercise" && S.sheet === "more") nodes.push(...moreSheet());
  app.replaceChildren(...nodes);

  const newAsk = document.getElementById("ask");
  if (newAsk) { newAsk.value = draft; if (focused === "ask") newAsk.focus(); }
  lastView = view;
  if (view === "teacher") {
    const box = document.getElementById("chat-scroll");
    if (box) box.scrollTop = box.scrollHeight;
  }
  if (view === "exercise") fitToScreen();

  // Поле ответа слегка трясётся при каждой неудачной проверке.
  if (view === "exercise" && S.task.failedChecks > lastFailedChecks) {
    lastFailedChecks = S.task.failedChecks;
    const b = document.getElementById("built");
    b?.classList.add("shake");
  }
}

/**
 * Подгоняет экран упражнения под высоту телефона: если кнопки слов не влезают,
 * понемногу уменьшает шрифты и отступы (переменная --k), пока всё не поместится.
 */
let fit = { key: null, k: 1, builtHeight: 0 };

function fitToScreen(force = false) {
  const screen = document.querySelector(".screen.exercise");
  if (!screen) return;
  const built = document.getElementById("built");
  // Размер подбирается один раз на предложение (и при повороте экрана),
  // чтобы кнопки не меняли размер и не сдвигались, пока собираешь ответ.
  const key = `${S.task.item.id}|${isDone(S.task)}|${innerWidth}x${innerHeight}`;
  if (!force && fit.key === key) {
    screen.style.setProperty("--k", fit.k);
    if (built && fit.builtHeight) built.style.minHeight = fit.builtHeight + "px";
    return;
  }
  // Временно кладём в поле ответа самый длинный правильный вариант, чтобы оставить под него место.
  const ghosts = [];
  if (built && !isDone(S.task)) {
    const longest = S.task.variants.reduce((a, b) => (b.join(" ").length > a.join(" ").length ? b : a));
    built.querySelector(".ph")?.remove();
    for (const w of longest) {
      const g = h("span", { class: "chip", style: "visibility:hidden" }, w);
      built.append(g);
      ghosts.push(g);
    }
  }
  const area = screen.querySelector(".tiles, .done-panel");
  const overflows = () => screen.scrollHeight > screen.clientHeight + 1 || (area && area.scrollHeight > area.clientHeight + 1);
  let k = 1;
  screen.style.setProperty("--k", k);
  while (overflows() && k > 0.62) {
    k = Math.round((k - 0.04) * 100) / 100;
    screen.style.setProperty("--k", k);
  }
  // На больших телефонах, наоборот, делаем кнопки чуть крупнее, пока есть место.
  if (k === 1) {
    while (k < 1.2) {
      const bigger = Math.round((k + 0.04) * 100) / 100;
      screen.style.setProperty("--k", bigger);
      if (overflows()) { screen.style.setProperty("--k", k); break; }
      k = bigger;
    }
  }
  const builtHeight = built && ghosts.length ? built.offsetHeight : 0;
  ghosts.forEach((g) => g.remove());
  fit = { key, k, builtHeight };
  // Возвращаем подсказку в пустое поле и фиксируем его высоту.
  if (built && !S.task.built.length && !isDone(S.task)) {
    built.append(h("span", { class: "ph" }, PLACEHOLDER));
  }
  if (built && builtHeight) built.style.minHeight = builtHeight + "px";
}

window.addEventListener("resize", () => fitToScreen());
window.visualViewport?.addEventListener("resize", () => fitToScreen());
window.addEventListener("hashchange", () => { S.sheet = null; render(); });

// ---------- Запуск ----------

async function start() {
  applyTheme();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  askPersistentStorage();
  try {
    const index = await (await fetch("lessons/index.json", { cache: "no-cache" })).json();
    const ref = index.lessons[0];
    S.lesson = await (await fetch(`lessons/${ref.file}`, { cache: "no-cache" })).json();
    S.engine = new LessonEngine(S.lesson);
    nextTask();
    // Для проверки раскладки: ?item=L1-044 открывает конкретное предложение.
    const forced = S.lesson.items.find((it) => it.id === new URLSearchParams(location.search).get("item"));
    if (forced) S.task = S.engine.newTask(forced);
  } catch (e) {
    S.error = "Не удалось загрузить урок: " + e.message;
  }
  render();
  // Озвучка в Safari загружает голоса не сразу.
  window.speechSynthesis?.getVoices();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();
