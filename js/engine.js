// Движок урока: общий для всех уроков. Перенесён из Android-версии один к одному.

// ---------- Текст ответа: варианты, слова, сокращения ----------

export const CONTRACTIONS = {
  "don't": ["do", "not"],
  "doesn't": ["does", "not"],
  "didn't": ["did", "not"],
  "won't": ["will", "not"],
  "isn't": ["is", "not"],
  "aren't": ["are", "not"],
  "wasn't": ["was", "not"],
  "weren't": ["were", "not"],
  "wouldn't": ["would", "not"],
};

export const key = (w) => w.toLowerCase();

/** "in {a|the} tent" → ["in a tent", "in the tent"]. Пустой вариант {the|} = слово необязательно. */
export function expandGroups(sentence) {
  const m = /\{([^{}]*)\}/.exec(sentence);
  if (!m) return [sentence];
  return m[1].split("|").flatMap((option) =>
    expandGroups(sentence.slice(0, m.index) + option + sentence.slice(m.index + m[0].length)));
}

/** Знак в конце предложения: "?" для вопроса, иначе ".". */
export function punctuation(sentence) {
  const last = sentence.trim().slice(-1);
  return ".?!".includes(last) && last ? last : ".";
}

/** Делит предложение на слова-кнопки. Первое слово — с маленькой буквы, кроме I и имён. */
export function tokenize(sentence, properNouns) {
  const words = sentence.trim()
    .replace(/’/g, "'")
    .replace(/[.?!]+$/, "")
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.map((w, i) => (i === 0 && w !== "I" && !properNouns.has(w) ? w.toLowerCase() : w));
}

/** Добавляет варианты с полной формой вместо сокращения и наоборот. */
export function withContractions(variants) {
  const seen = new Set();
  const result = [];
  const queue = [...variants];
  while (queue.length) {
    const v = queue.shift();
    const id = v.join(" ");
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(v);
    for (let i = 1; i < v.length; i++) {
      const full = CONTRACTIONS[key(v[i])];
      if (full) queue.push([...v.slice(0, i), ...full, ...v.slice(i + 1)]);
      if (i + 1 < v.length) {
        const pair = key(v[i]) + " " + key(v[i + 1]);
        const short = Object.keys(CONTRACTIONS).find((k) => CONTRACTIONS[k].join(" ") === pair);
        if (short) queue.push([...v.slice(0, i), short, ...v.slice(i + 2)]);
      }
    }
  }
  return result;
}

/** Все правильные варианты ответа в виде списков слов. */
export function variants(answers, properNouns) {
  const all = withContractions(answers.flatMap(expandGroups).map((a) => tokenize(a, properNouns)));
  const seen = new Set();
  return all.filter((v) => !seen.has(v.join(" ")) && seen.add(v.join(" ")));
}

/** Кнопка «?»: разговорный вопрос одной интонацией, вместо do / does / did / will. */
export const QMARK = "?";

/** Слова → предложение с заглавной буквы и знаком в конце (если «?» уже нажат — второй не ставим). */
export function sentence(tokens, punct) {
  const words = tokens[tokens.length - 1] === QMARK ? tokens.slice(0, -1) : tokens;
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1) + (words === tokens ? punct : QMARK);
}

/** Как слово выглядит на кнопке: как в ответе (TV, London), только i → I. */
export const label = (w) => (w === "i" ? "I" : w);

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const TENS = { 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty", 100: "hundred" };

/** Распознанная речь → слова: без запятых и точек, цифры словами, «?» в конце — отдельное слово. */
export function speechTokens(text) {
  const t = text.trim().replace(/[’‘]/g, "'");
  const question = /\?\s*$/.test(t);
  const words = t.replace(/[.,!?;:"]+/g, " ").split(/\s+/).filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? NUMBER_WORDS[+w] || TENS[+w] || w : w));
  return question ? [...words, QMARK] : words;
}

/**
 * Значение слова для подсказки при удержании пальца: перевод из словаря урока,
 * у глаголов — ещё три формы (buy · buys · bought). null — если слова в словаре нет.
 */
export function wordInfo(word, lesson, lexicon) {
  const w = key(word);
  const glossary = lesson.glossary || {};
  const verb = lexicon.verbOf(w);
  const meaning = glossary[w] || (verb && glossary[key(verb.base)]);
  if (!meaning) return null;
  return {
    word: label(word),
    meaning,
    forms: verb && !glossary[w]?.startsWith("✗") ? [verb.base, verb.s, verb.past] : null,
  };
}

// ---------- Метки «что проверяется» ----------

export const BE = new Set(["am", "is", "are", "was", "were"]);
export const AUX = new Set([
  "do", "does", "did", "will", "don't", "doesn't", "didn't", "won't", "not",
  ...BE, "isn't", "aren't", "wasn't", "weren't", "would", "wouldn't",
]);
export const QUESTION_AUX = new Set(["do", "does", "did", "will", ...BE, "would"]);
const DETERMINERS = new Set(["the", "a", "an", "my", "your", "his", "her", "our", "their", "this", "that", "these", "those"]);
export const ARTICLES = new Set(["a", "an", "the"]);
export const PREPOSITIONS = new Set([
  "in", "at", "on", "to", "for", "with", "from", "of", "by", "about", "near", "after", "before", "under",
  "into", "during", "since", "until", "without", "behind", "between", "across", "through", "over", "as",
]);
export const PRONOUNS = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their",
]);
const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their"]);
export const QUESTION_WORDS = new Set(["what", "where", "when", "why", "who", "how", "which", "whose"]);

/**
 * Группа слова для цвета кнопки: aux (do, does, will, not…), pron (I, you, my…), art (a, an, the),
 * prep (in, on, at…), q (what, where, how…). Остальные слова — без цвета.
 */
export function wordCategory(word) {
  const w = key(word);
  if (AUX.has(w)) return "aux";
  if (PRONOUNS.has(w)) return "pron";
  if (ARTICLES.has(w)) return "art";
  if (PREPOSITIONS.has(w)) return "prep";
  if (QUESTION_WORDS.has(w) || w === QMARK) return "q";
  return null;
}

/** Быстрый поиск глагола по любой его форме. */
export class Lexicon {
  constructor(verbs) {
    this.byForm = new Map();
    for (const v of verbs) {
      const verb = { ...v, irregular: !v.past.endsWith("ed") };
      for (const f of [v.past, v.s, v.base]) this.byForm.set(key(f), verb);
    }
  }
  verbOf(word) {
    return this.byForm.get(key(word)) || null;
  }
}

/** Глагол, если слово стоит на месте глагола; null, если это существительное («to work»). */
export function verbAt(tokens, index, lexicon) {
  const verb = lexicon.verbOf(tokens[index]);
  if (!verb) return null;
  const prev = index > 0 ? key(tokens[index - 1]) : null;
  if (prev && (ARTICLES.has(prev) || POSSESSIVES.has(prev) || PREPOSITIONS.has(prev))) return null;
  return verb;
}

export function tagsForToken(tokens, index, item, lexicon) {
  const w = key(tokens[index]);
  if (w === QMARK) return ["order:spoken-question"];
  if (AUX.has(w)) {
    return item.type === "question" && QUESTION_AUX.has(w) ? [`aux:${w}`, "order:question"] : [`aux:${w}`];
  }
  if (ARTICLES.has(w)) return [`article:${w}`];
  if (PREPOSITIONS.has(w)) return [`prep:${w}`];
  if (PRONOUNS.has(w)) return [`pron:${w}`];
  const verb = verbAt(tokens, index, lexicon);
  if (!verb) return [`word:${w}`];
  let form;
  if (w === verb.past && item.tense === "past" && item.type === "affirmative") {
    form = verb.irregular ? `past:${verb.past}` : "past:-ed";
  } else if (w === verb.s) form = "form:-s";
  else if (w === verb.base) form = "form:base";
  else form = verb.irregular ? `past:${verb.past}` : "past:-ed";
  return [`verb:${verb.base}`, form];
}

/** Все элементы предложения: время, тип, ручные метки и метки слов главного ответа. */
export function itemElements(item, mainTokens, lexicon) {
  const result = new Set([`tense:${item.tense}`, `type:${item.type}`]);
  (item.elements || []).forEach((e) => result.add(e));
  mainTokens.forEach((_, i) => tagsForToken(mainTokens, i, item, lexicon).forEach((e) => result.add(e)));
  return result;
}

// ---------- Ловушки ----------

const AUX_SWAPS = {
  do: ["does", "did"], does: ["do", "did"], did: ["does", "do"], will: ["do", "did"],
  "don't": ["doesn't", "didn't"], "doesn't": ["don't", "didn't"], "didn't": ["don't", "doesn't"],
  "won't": ["don't", "didn't"],
  am: ["is", "are"], is: ["are", "am"], are: ["is", "am"], was: ["were", "is"], were: ["was", "are"],
  "isn't": ["aren't", "wasn't"], "aren't": ["isn't", "weren't"], "wasn't": ["weren't", "isn't"],
  "weren't": ["wasn't", "aren't"], would: ["will", "do"], "wouldn't": ["won't", "don't"],
};
const PREP_SWAPS = {
  in: ["at", "on"], at: ["in", "on"], on: ["in", "at"], to: ["at", "for"], for: ["to", "during"],
  with: ["by"], from: ["of"], of: ["from"], near: ["with"], before: ["after"], after: ["before"],
  as: ["like"], like: ["as"],
};
const PRONOUN_SWAPS = {
  i: "me", he: "him", she: "her", we: "us", they: "them", me: "I", him: "he", us: "we", them: "they",
  their: "there",
};
export const MAX_TRAPS = 9;

/** Правдоподобные неверные слова. Слово из правильного ответа ловушкой быть не может. */
export function buildTraps(item, vars, lexicon) {
  const valid = new Set(vars.flat().map(key));
  const main = vars[0];
  const important = [];
  const extra = [];
  const add = (list, w) => { if (!list.includes(w)) list.push(w); };

  main.forEach((_, i) => {
    const v = verbAt(main, i, lexicon);
    if (v) [v.base, v.s, v.past].forEach((f) => add(important, f));
  });
  main.forEach((w) => { const s = AUX_SWAPS[key(w)]; if (s) add(important, s[0]); });
  if (item.tense === "past" && item.type === "affirmative") add(important, "did");
  if (item.tense === "present" && item.type === "affirmative") add(important, "does");
  if (item.tense === "future" && item.type === "affirmative") add(important, "did");
  (item.traps || []).forEach((t) => add(important, t));

  const articles = main.map(key).filter((w) => ARTICLES.has(w));
  if (articles.length === 0) add(extra, "the");
  else [...ARTICLES].filter((a) => !articles.includes(a)).forEach((a) => add(extra, a));
  main.forEach((w) => (PREP_SWAPS[key(w)] || []).forEach((p) => add(extra, p)));
  main.forEach((w) => { const p = PRONOUN_SWAPS[key(w)]; if (p) add(extra, p); });

  const seen = new Set();
  const fresh = [...important, ...extra].filter((w) => {
    const k = key(w);
    if (valid.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const mustKeep = fresh.filter((w) => important.includes(w));
  const rest = fresh.filter((w) => !important.includes(w));
  return [...mustKeep, ...rest].slice(0, Math.max(MAX_TRAPS, mustKeep.length));
}

// ---------- Сравнение собранного ответа с правильным ----------

/** Самая длинная общая цепочка слов. Слова вне неё — лишние или неверные. */
export function align(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = key(a[i]) === key(b[j]) ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const inA = new Array(n).fill(false), inB = new Array(m).fill(false);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { inA[i] = true; inB[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { inA, inB, length: inA.filter(Boolean).length };
}

// ---------- Задание ----------

export const startsWith = (variant, prefix) =>
  variant.length >= prefix.length && prefix.every((w, i) => key(variant[i]) === key(w));
export const same = (a, b) => a.length === b.length && startsWith(a, b);

/** solved — собрано верно, revealed — «Показать ответ», forced — «Ответить» с ошибкой (показан правильный). */
export const isDone = (t) => Boolean(t.solved || t.revealed || t.forced);

/**
 * «Слова под словами» для длинных предложений: если кнопок больше, чем клеток на экране (cap),
 * лишние слова ответа лежат под другими словами ответа и открываются, когда верхнее выбрано.
 * Прячем последние слова ответа и кладём каждое под слово, которое в ответе идёт раньше, —
 * тогда нужное слово всегда успевает открыться. Ловушки и «?» не прячем.
 * Возвращает стопки индексов кнопок: [верхнее, под ним, …].
 */
export function stackButtons(t, cap) {
  const n = t.buttons.length;
  if (!(n > cap)) return t.buttons.map((_, i) => [i]);
  // Для каждой кнопки — её место в каждом варианте ответа (у повторов — по порядку появления), -1 если нет.
  const vars = t.variants.map((v) => v.map(key));
  const seen = new Map();
  const nth = t.buttons.map((w) => { const k = key(w); const c = seen.get(k) || 0; seen.set(k, c + 1); return c; });
  const posIn = (v, i) => {
    const k = key(t.buttons[i]);
    for (let j = 0, c = 0; j < v.length; j++) if (v[j] === k && c++ === nth[i]) return j;
    return -1;
  };
  const pos = t.buttons.map((_, i) => vars.map((v) => posIn(v, i)));
  const isAnswer = (i) => pos[i].some((p) => p >= 0);
  // Слово c может закрывать слово h, если в каждом варианте, где есть h, c тоже есть и стоит раньше.
  const covers = (c, h) => vars.every((_, vi) => pos[h][vi] < 0 || (pos[c][vi] >= 0 && pos[c][vi] < pos[h][vi]));
  const mainPos = (i) => (pos[i][0] >= 0 ? pos[i][0] : 1e9);

  let toHide = n - cap;
  const stacks = t.buttons.map((_, i) => [i]);
  const closed = new Set(); // стопки, в низу которых ловушка: под ловушку ничего не кладём
  // 1) Прячем слова ответа — с конца предложения.
  const answers = t.buttons.map((_, i) => i).filter(isAnswer).sort((a, b) => mainPos(b) - mainPos(a));
  for (const h of answers) {
    if (toHide <= 0) break;
    const own = stacks.findIndex((s) => s[0] === h && s.length === 1);
    if (own < 0) continue; // под этим словом уже что-то лежит
    const options = stacks.filter((s, si) => si !== own && !closed.has(s) && covers(s[s.length - 1], h));
    if (!options.length) continue;
    const target = options.reduce((a, b) => (mainPos(b[b.length - 1]) < mainPos(a[a.length - 1]) ? b : a));
    stacks.splice(own, 1);
    target.push(h);
    toHide--;
  }
  // 2) Если места всё ещё мало — прячем ловушки в самый низ стопок со словами ответа.
  const traps = t.buttons.map((_, i) => i).filter((i) => !isAnswer(i));
  for (const tr of traps) {
    if (toHide <= 0) break;
    const own = stacks.findIndex((s) => s[0] === tr && s.length === 1);
    const target = stacks.find((s, si) => si !== own && !closed.has(s) && isAnswer(s[s.length - 1]));
    if (own < 0 || !target) continue;
    stacks.splice(own, 1);
    target.push(tr);
    closed.add(target);
    toHide--;
  }
  return stacks;
}

/** Видимое слово в каждой клетке (null — клетка опустела): верхние кнопки расходуются первыми. */
export function visibleCells(t, stacks) {
  const left = new Map();
  t.built.forEach((w) => left.set(key(w), (left.get(key(w)) || 0) + 1));
  const used = new Array(t.buttons.length).fill(false);
  const depth = Math.max(1, ...stacks.map((s) => s.length));
  for (let d = 0; d < depth; d++) {
    for (const s of stacks) {
      const i = s[d];
      if (i == null) continue;
      const k = key(t.buttons[i]);
      if ((left.get(k) || 0) > 0) { used[i] = true; left.set(k, left.get(k) - 1); }
    }
  }
  return stacks.map((s) => {
    const i = s.find((j) => !used[j]);
    return i == null ? null : t.buttons[i];
  });
}

/** Какие кнопки уже использованы: слово ушло в строку ответа (по одной кнопке на каждое слово). */
export function usedButtons(t) {
  const inBuilt = new Map();
  t.built.forEach((w) => inBuilt.set(key(w), (inBuilt.get(key(w)) || 0) + 1));
  return t.buttons.map((w) => {
    const left = inBuilt.get(key(w)) || 0;
    if (left > 0) { inBuilt.set(key(w), left - 1); return true; }
    return false;
  });
}
/** Балл: без ошибок 5, каждая ошибка −1, минимум 2; «Показать ответ» — 2. */
export const scoreOf = (t) => (t.revealed ? 2 : Math.max(2, 5 - t.errors));
export const answerText = (t) => sentence(isDone(t) ? t.built : t.variants[0], t.punctuation);
export function otherAnswers(t) {
  const shown = answerText(t);
  return [...new Set(t.variants.map((v) => sentence(v, t.punctuation)))].filter((s) => s !== shown);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class LessonEngine {
  constructor(lesson) {
    this.lesson = lesson;
    this.lexicon = new Lexicon(lesson.verbs || []);
    this.properNouns = new Set(lesson.properNouns || []);
    this.variantCache = new Map();
    this.elementCache = new Map();
  }

  variantsOf(item) {
    if (!this.variantCache.has(item.id)) {
      const vars = variants(item.answers, this.properNouns);
      // В вопросе: полная форма — с «?» в конце или без, разговорная — обязательно с «?»: «you hear me ?».
      const extra = item.type === "question"
        ? [...vars.map((v) => [...v, QMARK]), ...vars.map((v) => this.spokenQuestion(v)).filter(Boolean).map((v) => [...v, QMARK])]
        : [];
      const seen = new Set(vars.map((v) => v.map(key).join(" ")));
      this.variantCache.set(item.id, [...vars, ...extra.filter((v) => !seen.has(v.map(key).join(" ")) && seen.add(v.map(key).join(" ")))]);
    }
    return this.variantCache.get(item.id);
  }

  /**
   * Разговорный вопрос — без do/does/did, одной интонацией: «Do you hear me?» → «You hear me?».
   * Does she speak → She speaks, Did you see → You saw, Will you come → You will come.
   * Только для вопросов «да/нет», которые начинаются с do/does/did/will. null — если не получается.
   */
  spokenQuestion(v) {
    const aux = key(v[0]);
    if (!QUESTION_AUX.has(aux)) return null;
    const rest = v.slice(1);
    const lower = (list) => list.map((w, i) => (i === 0 && w !== "I" && !this.properNouns.has(w) ? w.toLowerCase() : w));
    // to be: «Are you at home?» → «You are at home ?». Подлежащее — местоимение или «слово + существительное».
    if (BE.has(aux)) {
      const n = PRONOUNS.has(key(rest[0] || "")) ? 1
        : DETERMINERS.has(key(rest[0] || "")) && !DETERMINERS.has(key(rest[1] || "")) && rest.length > 2 ? 2 : 0;
      if (!n) return null;
      return lower([...rest.slice(0, n), v[0], ...rest.slice(n)]);
    }
    // Глагол — первое слово после подлежащего, которое есть в списке глаголов (often, usually пропускаем).
    const j = rest.findIndex((_, i) => i > 0 && verbAt(rest, i, this.lexicon) && key(rest[i]) === verbAt(rest, i, this.lexicon).base);
    if (j < 1) return null;
    const verb = verbAt(rest, j, this.lexicon);
    const subject = rest.slice(0, j);
    const after = rest.slice(j + 1);
    let verbPart;
    if (aux === "do") verbPart = [rest[j]];
    else if (aux === "does") verbPart = [verb.s];
    else if (aux === "did") verbPart = [verb.past];
    else verbPart = [aux, rest[j]]; // will / would остаются: «You will come ?», «You would like tea ?»
    // Наречия частоты (often, usually) остаются перед глаголом: «You often go…».
    return [...subject, ...verbPart, ...after].map((w, i) => (i === 0 && w !== "I" && !this.properNouns.has(w) ? w.toLowerCase() : w));
  }

  elementsOf(item) {
    if (!this.elementCache.has(item.id)) {
      this.elementCache.set(item.id, itemElements(item, this.variantsOf(item)[0], this.lexicon));
    }
    return this.elementCache.get(item.id);
  }

  newTask(item) {
    const vars = this.variantsOf(item);
    // Слово, которое встречается в ответе дважды (the … the), получает две кнопки:
    // каждая нажатая кнопка «уходит» в строку ответа.
    const need = new Map();
    for (const v of vars) {
      const local = new Map();
      v.forEach((w) => local.set(key(w), (local.get(key(w)) || 0) + 1));
      local.forEach((n, k) => need.set(k, Math.max(n, need.get(k) || 0)));
    }
    const seen = new Set();
    const buttons = [];
    // Кнопка «?» есть в каждом предложении: в вопросе она нужна, в утверждении — это ловушка.
    for (const w of [...vars.flat(), ...buildTraps(item, vars, this.lexicon), QMARK].map(label)) {
      if (seen.has(key(w))) continue;
      seen.add(key(w));
      for (let i = 0; i < (need.get(key(w)) || 1); i++) buttons.push(w);
    }
    shuffle(buttons);
    return {
      item, variants: vars, buttons, punctuation: punctuation(item.answers[0]),
      built: [], marked: [], errors: 0, failedChecks: 0, wrongWords: [], missed: [], penalized: [],
      feedback: "none", cursor: null, solved: false, revealed: false,
    };
  }

  /**
   * Правильный вариант, больше всего похожий на собранное. При равенстве — тот, что совпадает
   * с началом ответа, затем более короткий («do you hear me» раньше, чем «do you hear me ?»).
   */
  closestVariant(task) {
    let best = null, bestScore = null;
    for (const v of task.variants) {
      const s = [align(v, task.built).length, startsWith(v, task.built) ? 1 : 0, -v.length];
      if (!best || s[0] > bestScore[0] || (s[0] === bestScore[0] && (s[1] > bestScore[1] ||
        (s[1] === bestScore[1] && s[2] > bestScore[2])))) { best = v; bestScore = s; }
    }
    return best;
  }

  /** Добавляет слово (даже неверное): в конец или на место убранного слова. */
  tap(task, word, autoCheck) {
    if (isDone(task)) return task;
    const at = task.cursor ?? task.built.length;
    const built = [...task.built]; built.splice(at, 0, word);
    const marked = [...task.marked]; marked.splice(at, 0, false);
    const cursor = at + 1 < built.length ? at + 1 : null;
    const next = { ...task, built, marked, cursor, feedback: "none" };
    // Автопроверка — только когда слов стало столько, сколько в ответе (или больше).
    if (!autoCheck) return next;
    return next.built.length >= this.closestVariant(next).length ? this.check(next) : next;
  }

  /** Убирает слово из ответа. Следующее слово встанет на его место. */
  removeAt(task, index) {
    if (isDone(task) || index < 0 || index >= task.built.length) return task;
    const size = task.built.length - 1;
    return {
      ...task,
      built: task.built.filter((_, i) => i !== index),
      marked: task.marked.filter((_, i) => i !== index),
      cursor: index < size ? index : null,
      feedback: "none",
    };
  }

  /** «Ой, ошибся»: убрать последнее слово. */
  undo(task) {
    if (isDone(task) || task.built.length === 0) return task;
    const size = task.built.length - 1;
    return {
      ...task,
      built: task.built.slice(0, -1),
      marked: task.marked.slice(0, -1),
      cursor: task.cursor != null && task.cursor < size ? task.cursor : null,
      feedback: "none",
    };
  }

  /** Проверка. Ошибки засчитываются элементам, которые стояли на месте неверных слов. */
  check(task) {
    if (isDone(task) || task.built.length === 0) return task;
    const exact = task.variants.find((v) => same(v, task.built));
    if (exact) {
      return { ...task, built: exact, marked: exact.map(() => false), cursor: null, solved: true, feedback: "none" };
    }
    const target = this.closestVariant(task);
    const match = align(task.built, target);
    const wrongIdx = task.built.map((_, i) => i).filter((i) => !match.inA[i]);
    const wrongKeys = wrongIdx.map((i) => key(task.built[i]));
    const penaltyKeys = wrongKeys.length ? wrongKeys : ["#missing"];
    const added = penaltyKeys.filter((k) => !task.penalized.includes(k)).length;
    return {
      ...task,
      marked: task.built.map((_, i) => wrongIdx.includes(i)),
      errors: task.errors + added,
      failedChecks: task.failedChecks + 1,
      wrongWords: [...task.wrongWords, ...wrongIdx.map((i) => task.built[i])],
      missed: [...new Set([...task.missed, ...this.missedElements(task.item, target, match.inB)])],
      penalized: [...new Set([...task.penalized, ...penaltyKeys])],
      feedback: wrongIdx.length ? "wrong" : "missing",
    };
  }

  /**
   * Кнопка «Ответить»: проверяем ответ сейчас. Верно — засчитано. Неверно или не хватает слов —
   * это ошибка, и сразу показываем правильный ответ (ближайший к собранному). Собранное хранится в attempt.
   */
  answerNow(task) {
    if (isDone(task) || task.built.length === 0) return task;
    const checked = this.check(task);
    if (checked.solved) return checked;
    const target = this.closestVariant(task);
    return {
      ...checked,
      attempt: task.built,
      built: target,
      marked: target.map(() => false),
      errors: Math.max(1, checked.errors),
      cursor: null,
      forced: true,
      feedback: "none",
    };
  }

  /**
   * Голосовой ввод: распознанные фразы (несколько вариантов от распознавания) становятся строкой ответа
   * и сразу проверяются. Берём первый вариант, который верен; если верного нет — первый.
   */
  fromSpeech(task, transcripts) {
    if (isDone(task)) return task;
    const words = new Map([...task.variants.flat(), ...task.buttons].map((w) => [key(w), w]));
    let first = null;
    for (const text of transcripts) {
      let built = speechTokens(text).map((w) => words.get(key(w)) || label(key(w)));
      if (task.item.type !== "question") built = built.filter((w) => w !== QMARK);
      if (!built.length) continue;
      // Распознавание часто не ставит «?»: если без него не совпало, а с ним совпадает — добавляем.
      if (task.item.type === "question" && built.at(-1) !== QMARK && !task.variants.some((v) => same(v, built)) &&
        task.variants.some((v) => same(v, [...built, QMARK]))) built = [...built, QMARK];
      const next = { ...task, built, marked: built.map(() => false), cursor: null, feedback: "none" };
      if (task.variants.some((v) => same(v, built))) return this.check(next);
      first ??= next;
    }
    return first ? this.check(first) : task;
  }

  /** «Показать ответ»: дособираем ближайший вариант. Не собранное — ошибка. */
  reveal(task) {
    if (isDone(task)) return task;
    const target = this.closestVariant(task);
    const match = align(task.built, target);
    return {
      ...task,
      built: target,
      marked: target.map(() => false),
      cursor: null,
      missed: [...new Set([...task.missed, ...this.missedElements(task.item, target, match.inB)])],
      revealed: true,
      feedback: "none",
    };
  }

  missedElements(item, variant, matched) {
    const result = new Set([`tense:${item.tense}`, `type:${item.type}`]);
    variant.forEach((_, i) => {
      if (!matched[i]) tagsForToken(variant, i, item, this.lexicon).forEach((e) => result.add(e));
    });
    return [...result];
  }
}

// ---------- Система запоминания ----------

export const Memory = {
  MIN_WEIGHT: 0.3,
  MAX_WEIGHT: 10,
  ERROR_STEP: 1,
  DECAY: 0.85,
  NEW_SHARE: 0.25,
  HARDNESS_POWER: 1.5,
  SCORE_WINDOW: 20,
  PASS_SCORE: 4.5,
  PASS_MIN_SOLVED: 10,

  /** Записывает результат законченного задания и возвращает новый прогресс. */
  record(progress, lessonId, task, itemElements) {
    const elements = { ...progress.elements };
    const missed = new Set(task.missed);
    for (const k of new Set([...itemElements, ...task.missed])) {
      const s = elements[k] || { weight: 1, errors: 0, seen: 0 };
      elements[k] = missed.has(k)
        ? { weight: Math.min(this.MAX_WEIGHT, s.weight + this.ERROR_STEP), errors: s.errors + 1, seen: s.seen + 1 }
        : { weight: Math.max(this.MIN_WEIGHT, s.weight * this.DECAY), errors: s.errors, seen: s.seen + 1 };
    }
    const old = progress.sentences[task.item.id] || { seen: 0, errors: 0, lastScore: 0 };
    const sentenceStat = { seen: old.seen + 1, errors: old.errors + task.errors, lastScore: scoreOf(task) };
    const lp = progress.lessons[lessonId] || { scores: [], solved: 0, passed: false };
    const scores = [...lp.scores, scoreOf(task)].slice(-this.SCORE_WINDOW);
    const passedNow = scores.length >= this.PASS_MIN_SOLVED && average(scores) >= this.PASS_SCORE;
    return {
      ...progress,
      elements,
      sentences: { ...progress.sentences, [task.item.id]: sentenceStat },
      lessons: { ...progress.lessons, [lessonId]: { scores, solved: lp.solved + 1, passed: lp.passed || passedNow } },
    };
  },

  itemWeight(elements, progress) {
    const ws = [...elements].map((e) => progress.elements[e]?.weight ?? 1);
    if (!ws.length) return 1;
    const w = 0.5 * Math.max(...ws) + 0.5 * average(ws);
    return Math.pow(w, this.HARDNESS_POWER);
  },

  /** Иногда новое предложение, иначе случайное с учётом трудности; два раза подряд — никогда. */
  pick(items, elementsOf, progress, previousId, random = Math.random) {
    let pool = items.filter((it) => it.id !== previousId);
    if (!pool.length) pool = items;
    const unseen = pool.filter((it) => !(progress.sentences[it.id]?.seen > 0));
    if (unseen.length && (unseen.length === pool.length || random() < this.NEW_SHARE)) {
      return unseen[Math.floor(random() * unseen.length)];
    }
    const weights = pool.map((it) => this.itemWeight(elementsOf(it), progress));
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  },
};

export const average = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
