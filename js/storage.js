// Прогресс и настройки хранятся только в этом браузере (на этом телефоне).

const PROGRESS_KEY = "polyglot.progress.v1";
const SETTINGS_KEY = "polyglot.settings.v1";
export const DEFAULT_MODEL = "gemini-3.8-flash";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const emptyProgress = () => ({ elements: {}, sentences: {}, lessons: {}, enterMode: false });

export const loadProgress = () => read(PROGRESS_KEY, emptyProgress());
export const saveProgress = (p) => write(PROGRESS_KEY, p);

/**
 * apiKey — ключ Gemini, model — название модели, theme — system | light | dark,
 * autoSpeak — произносить ответ сам, когда предложение собрано.
 */
export const loadSettings = () => read(SETTINGS_KEY, { apiKey: "", model: DEFAULT_MODEL, theme: "system", autoSpeak: false });
export const saveSettings = (s) => write(SETTINGS_KEY, s);

/** Просим браузер не стирать наши данные при нехватке места (Safari на iPhone это учитывает). */
export function askPersistentStorage() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* не страшно */
  }
}
