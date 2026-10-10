"use strict";

/* =========================================================
   Бейс Телеком — опрос клиентов
   Этот файл управляет всем: вопросами, прогрессом,
   проверкой ответов и отправкой в Google Таблицу.
   ========================================================= */

/* ---------------------------------------------------------
   1. НАСТРОЙКИ
   --------------------------------------------------------- */

// ВСТАВЬТЕ СЮДА адрес вашего Google Apps Script (заканчивается на /exec).
// Пока тут пусто — сайт работает в ДЕМО-РЕЖИМЕ (ответы никуда не уходят).
// Пример: "https://script.google.com/macros/s/AKfycb.../exec"
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyr99YBlONfPebhQzH3W024bUQAWKYW4hub_ghE6M5v2RaUACdzzH_ZuFXM0DKBKjQe6A/exec";

const MIN_FILL_SECONDS = 10;     // быстрее этого опрос пройти нельзя (защита от ботов)
const REQUEST_TIMEOUT_MS = 20000; // сколько ждать ответ сервера
const MAX_SHORT_TEXT = 100;      // максимум символов в коротких полях
const MAX_LONG_TEXT = 1000;      // максимум символов в комментариях
const ANALYTICS_DEBUG = false;   // true — показывать события аналитики в консоли

/* ---------------------------------------------------------
   2. АНАЛИТИКА (пока ничего не подключено)
   Когда подключите Google Analytics, события заработают сами.
   --------------------------------------------------------- */

const analytics = {
  track(eventName, params = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }
    if (ANALYTICS_DEBUG) {
      console.log("[analytics]", eventName, params);
    }
  }
};

/* ---------------------------------------------------------
   3. ВОПРОСЫ
   Чтобы изменить вопрос — правьте title и options.
   required: true — обязательный, false — можно пропустить.
   type: scale (шкала), single (один вариант),
         multi (несколько), text (свой текст), extra (последний шаг)
   --------------------------------------------------------- */

const QUESTIONS = [
  {
    id: "overall",
    type: "scale",
    required: true,
    min: 1,
    max: 10,
    title: "Насколько вы в целом довольны Бейс Телеком?",
    lowLabel: "1 — совсем не доволен",
    highLabel: "10 — полностью доволен"
  },
  {
    id: "stability",
    type: "single",
    required: true,
    title: "Насколько вас устраивает стабильность интернет-соединения?",
    options: [
      "Полностью устраивает",
      "Скорее устраивает",
      "Иногда бывают проблемы",
      "Часто возникают проблемы",
      "Совсем не устраивает"
    ]
  },
  {
    id: "speed",
    type: "single",
    required: true,
    title: "Как вы оцениваете скорость интернета?",
    options: ["Отлично", "Хорошо", "Нормально", "Плохо", "Очень плохо"]
  },
  {
    id: "problems",
    type: "single",
    required: true,
    title: "Как часто у вас возникают проблемы с интернетом?",
    options: ["Практически никогда", "Редко", "Иногда", "Часто", "Очень часто"]
  },
  {
    id: "support",
    type: "single",
    required: true,
    title: "Как вы оцениваете работу службы поддержки?",
    options: ["Отлично", "Хорошо", "Нормально", "Плохо", "Не обращался(ась)"]
  },
  {
    id: "important",
    type: "multi",
    required: true,
    title: "Что для вас самое важное в работе интернет-провайдера?",
    hint: "Можно выбрать несколько вариантов.",
    options: [
      "Стабильность",
      "Скорость",
      "Цена",
      "Быстрое устранение проблем",
      "Качество поддержки",
      "Удобство оплаты",
      "Дополнительные услуги",
      "Другое"
    ]
  },
  {
    id: "likes",
    type: "text",
    required: false,
    maxLength: MAX_LONG_TEXT,
    title: "Что вам больше всего нравится в Бейс Телеком?",
    hint: "Можно пропустить, если нечего добавить.",
    placeholder: "Напишите своими словами"
  },
  {
    id: "dislikes",
    type: "text",
    required: false,
    maxLength: MAX_LONG_TEXT,
    title: "Что вам сейчас не нравится в Бейс Телеком?",
    hint: "Можно пропустить, если всё устраивает.",
    placeholder: "Напишите своими словами"
  },
  {
    id: "improve",
    type: "text",
    required: false,
    maxLength: MAX_LONG_TEXT,
    title: "Что бы вы хотели улучшить или изменить?",
    hint: "Можно пропустить.",
    placeholder: "Ваши пожелания"
  },
  {
    id: "nps",
    type: "scale",
    required: true,
    min: 0,
    max: 10,
    title: "Порекомендовали бы вы Бейс Телеком своим знакомым?",
    lowLabel: "0 — точно не порекомендую",
    highLabel: "10 — обязательно порекомендую"
  },
  {
    id: "source",
    type: "single",
    required: true,
    title: "Как вы узнали о Бейс Телеком?",
    options: [
      "От знакомых или родственников",
      "Увидел рекламу",
      "Баннер / наружная реклама",
      "WhatsApp",
      "Социальные сети",
      "Уже пользовались услугами",
      "Другое"
    ]
  },
  {
    id: "comment",
    type: "text",
    required: false,
    maxLength: MAX_LONG_TEXT,
    title: "Хотите оставить дополнительный комментарий?",
    hint: "Необязательно. Можно сразу нажать «Далее».",
    placeholder: "Ваш комментарий"
  },
  {
    // Последний шаг: населённый пункт + согласие на обратную связь + телефон
    id: "extra",
    type: "extra",
    required: false,
    title: "Последний шаг — немного о вас",
    hint: "Все поля на этом шаге необязательные."
  }
];

const CONTACT_YES = "Да";
const CONTACT_NO = "Нет";
const PHONE_NOTE = "Оставляя номер телефона, вы соглашаетесь на обратную связь по вашему обращению.";

/* ---------------------------------------------------------
   4. СОСТОЯНИЕ (здесь хранятся все ответы)
   --------------------------------------------------------- */

const state = {
  step: 0,
  answers: {},
  startedAt: 0,
  submissionId: "",
  isSubmitting: false,
  submitted: false
};

/* ---------------------------------------------------------
   5. ЭЛЕМЕНТЫ СТРАНИЦЫ
   --------------------------------------------------------- */

const $ = (selector) => document.querySelector(selector);

const screens = {
  welcome: $("#screen-welcome"),
  survey: $("#screen-survey"),
  thanks: $("#screen-thanks")
};

const stepEl = $("#step");
const stepError = $("#step-error");
const backBtn = $("#btn-back");
const nextBtn = $("#btn-next");
const nextText = $("#btn-next-text");
const nextSpinner = nextBtn.querySelector(".spinner");
const progressLabel = $("#progress-label");
const progressPercent = $("#progress-percent");
const progressTrack = $("#progress-track");
const progressBar = $("#progress-bar");
const honeypot = $("#hp");
const demoNotice = $("#demo-notice");

/* ---------------------------------------------------------
   6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   --------------------------------------------------------- */

// Создаёт HTML-элемент (текст вставляется безопасно)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Убирает лишние пробелы и переносы строк
function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isDemoMode() {
  return GOOGLE_SCRIPT_URL.trim() === "";
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showScreen(name) {
  Object.keys(screens).forEach((key) => {
    screens[key].hidden = key !== name;
  });
  window.scrollTo({ top: 0 });
  const focusTarget = screens[name].querySelector("[data-focus]");
  if (focusTarget && name !== "survey") focusTarget.focus({ preventScroll: true });
}

/* ---------------------------------------------------------
   7. ПРОВЕРКА ОТВЕТОВ
   Возвращает текст ошибки или пустую строку, если всё хорошо.
   --------------------------------------------------------- */

function validatePhone(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (!/^[+\d][\d\s()\-]*$/.test(value)) {
    return "В номере телефона могут быть только цифры, пробелы, скобки, дефис и «+» в начале.";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return "Проверьте номер телефона: в нём должно быть от 10 до 15 цифр.";
  }
  return "";
}

function validateStep(q) {
  const answer = state.answers[q.id];

  switch (q.type) {
    case "scale":
    case "single":
      return answer === undefined ? "Выберите один из вариантов, чтобы продолжить." : "";

    case "multi":
      return !answer || answer.length === 0 ? "Выберите хотя бы один вариант, чтобы продолжить." : "";

    case "text": {
      const value = cleanText(answer);
      if (q.required && !value) return "Напишите ответ, чтобы продолжить.";
      if (value && !/[\p{L}\p{N}]/u.test(value)) return "Ответ должен содержать буквы или цифры.";
      if (value.length > q.maxLength) return "Слишком длинный текст. Максимум — " + q.maxLength + " символов.";
      return "";
    }

    case "extra": {
      const place = cleanText(state.answers.location);
      if (place && !/[\p{L}]/u.test(place)) return "Название населённого пункта должно содержать буквы.";
      if (state.answers.contactAllowed === CONTACT_YES) return validatePhone(state.answers.phone);
      return "";
    }

    default:
      return "";
  }
}

// Есть ли на шаге хоть какой-то ответ (нужно для аналитики)
function hasAnswer(q) {
  if (q.type === "extra") {
    return Boolean(cleanText(state.answers.location) || state.answers.contactAllowed);
  }
  const answer = state.answers[q.id];
  if (Array.isArray(answer)) return answer.length > 0;
  if (typeof answer === "string") return cleanText(answer) !== "";
  return answer !== undefined;
}

/* ---------------------------------------------------------
   8. ПОСТРОЕНИЕ ВОПРОСОВ НА ЭКРАНЕ
   --------------------------------------------------------- */

// Карточка-вариант ответа (радио или галочка)
function buildOption({ type, name, value, label, checked, onChange }) {
  const wrap = el("label", "option");
  const input = el("input");
  input.type = type;
  input.name = name;
  input.value = value;
  input.checked = checked;
  input.addEventListener("change", () => onChange(input));

  const card = el("span", "option-card");
  const mark = el("span", type === "checkbox" ? "option-mark is-checkbox" : "option-mark");
  mark.setAttribute("aria-hidden", "true");
  card.append(mark, el("span", "option-text", label));

  wrap.append(input, card);
  return wrap;
}

function buildScale(q) {
  const wrap = el("div", "scale-wrap");
  const scale = el("div", "scale");
  scale.setAttribute("role", "radiogroup");
  scale.setAttribute("aria-labelledby", "q-title");
  scale.style.setProperty("--cols", String(q.max - q.min + 1));

  for (let n = q.min; n <= q.max; n++) {
    const item = el("label", "scale-item");
    const input = el("input");
    input.type = "radio";
    input.name = q.id;
    input.value = String(n);
    input.checked = state.answers[q.id] === n;
    input.setAttribute("aria-label", String(n));
    input.addEventListener("change", () => {
      state.answers[q.id] = n;
      onAnswerChanged();
    });
    item.append(input, el("span", "scale-num", String(n)));
    scale.append(item);
  }

  const labels = el("div", "scale-labels");
  labels.append(el("span", "", q.lowLabel), el("span", "", q.highLabel));
  wrap.append(scale, labels);
  return wrap;
}

function buildSingle(q) {
  const list = el("div", "options");
  list.setAttribute("role", "radiogroup");
  list.setAttribute("aria-labelledby", "q-title");
  q.options.forEach((option) => {
    list.append(buildOption({
      type: "radio",
      name: q.id,
      value: option,
      label: option,
      checked: state.answers[q.id] === option,
      onChange: () => {
        state.answers[q.id] = option;
        onAnswerChanged();
      }
    }));
  });
  return list;
}

function buildMulti(q) {
  const list = el("div", "options");
  list.setAttribute("role", "group");
  list.setAttribute("aria-labelledby", "q-title");
  q.options.forEach((option) => {
    const selected = state.answers[q.id] || [];
    list.append(buildOption({
      type: "checkbox",
      name: q.id,
      value: option,
      label: option,
      checked: selected.includes(option),
      onChange: (input) => {
        const current = new Set(state.answers[q.id] || []);
        if (input.checked) current.add(option); else current.delete(option);
        // сохраняем порядок как в списке вопросов
        state.answers[q.id] = q.options.filter((o) => current.has(o));
        onAnswerChanged();
      }
    }));
  });
  return list;
}

function buildText(q) {
  const field = el("div", "field");
  const label = el("label", "field-label", "Ваш ответ");
  label.className = "field-label";
  label.htmlFor = "input-" + q.id;
  label.style.position = "absolute";
  label.style.left = "-9999px";

  const area = el("textarea", "textarea");
  area.id = "input-" + q.id;
  area.maxLength = q.maxLength;
  area.placeholder = q.placeholder || "";
  area.value = state.answers[q.id] || "";
  area.rows = 5;

  const counter = el("div", "counter");
  const updateCounter = () => { counter.textContent = area.value.length + " / " + q.maxLength; };
  updateCounter();

  area.addEventListener("input", () => {
    state.answers[q.id] = area.value;
    updateCounter();
    onAnswerChanged();
  });

  field.append(label, area, counter);
  return field;
}

function buildExtra() {
  const wrap = el("div", "");

  // Населённый пункт
  const placeField = el("div", "field");
  const placeLabel = el("label", "field-label", "В каком населённом пункте вы пользуетесь интернетом?");
  placeLabel.htmlFor = "input-location";
  const placeInput = el("input", "input");
  placeInput.id = "input-location";
  placeInput.type = "text";
  placeInput.maxLength = MAX_SHORT_TEXT;
  placeInput.autocomplete = "address-level2";
  placeInput.placeholder = "Например, название города или села";
  placeInput.value = state.answers.location || "";
  placeInput.addEventListener("input", () => {
    state.answers.location = placeInput.value;
    onAnswerChanged();
  });
  placeField.append(placeLabel, placeInput);

  // Можно ли связаться
  const contactGroup = el("div", "subgroup");
  const contactTitle = el("p", "field-label", "Можно ли связаться с вами по поводу вашего отзыва?");
  contactTitle.id = "contact-title";
  contactTitle.style.fontWeight = "600";
  const contactOptions = el("div", "options");
  contactOptions.setAttribute("role", "radiogroup");
  contactOptions.setAttribute("aria-labelledby", "contact-title");

  // Поле телефона показывается только при ответе «Да»
  const phoneField = el("div", "field");
  const phoneLabel = el("label", "field-label", "Номер телефона");
  phoneLabel.htmlFor = "input-phone";
  const phoneInput = el("input", "input");
  phoneInput.id = "input-phone";
  phoneInput.type = "tel";
  phoneInput.inputMode = "tel";
  phoneInput.autocomplete = "tel";
  phoneInput.maxLength = 20;
  phoneInput.placeholder = "+7 900 000-00-00";
  phoneInput.value = state.answers.phone || "";
  phoneInput.addEventListener("input", () => {
    state.answers.phone = phoneInput.value;
    onAnswerChanged();
  });
  const phoneNote = el("p", "note", PHONE_NOTE);
  phoneField.append(phoneLabel, phoneInput, phoneNote);
  phoneField.hidden = state.answers.contactAllowed !== CONTACT_YES;

  [CONTACT_YES, CONTACT_NO].forEach((option) => {
    contactOptions.append(buildOption({
      type: "radio",
      name: "contactAllowed",
      value: option,
      label: option,
      checked: state.answers.contactAllowed === option,
      onChange: () => {
        state.answers.contactAllowed = option;
        phoneField.hidden = option !== CONTACT_YES;
        if (option !== CONTACT_YES) {
          state.answers.phone = "";
          phoneInput.value = "";
        }
        onAnswerChanged();
      }
    }));
  });

  contactGroup.append(contactTitle, contactOptions);
  wrap.append(placeField, contactGroup, phoneField);
  return wrap;
}

function buildQuestion(q) {
  const wrap = el("div", "question");

  const title = el("h2", "question-title", q.title);
  title.id = "q-title";
  title.tabIndex = -1;
  wrap.append(title);

  if (q.hint) wrap.append(el("p", "hint", q.hint));

  if (q.type === "scale") wrap.append(buildScale(q));
  else if (q.type === "single") wrap.append(buildSingle(q));
  else if (q.type === "multi") wrap.append(buildMulti(q));
  else if (q.type === "text") wrap.append(buildText(q));
  else if (q.type === "extra") wrap.append(buildExtra());

  return wrap;
}

/* ---------------------------------------------------------
   9. ПЕРЕХОДЫ МЕЖДУ ВОПРОСАМИ
   --------------------------------------------------------- */

function onAnswerChanged() {
  stepError.hidden = true;
  refreshNav();
}

// Кнопка «Далее» выглядит неактивной, пока обязательный ответ не дан
function refreshNav() {
  const q = QUESTIONS[state.step];
  const invalid = validateStep(q) !== "";
  nextBtn.setAttribute("aria-disabled", invalid ? "true" : "false");
}

function renderStep() {
  const q = QUESTIONS[state.step];
  const total = QUESTIONS.length;
  const current = state.step + 1;
  const percent = Math.round((current / total) * 100);

  progressLabel.textContent = "Вопрос " + current + " из " + total;
  progressPercent.textContent = percent + "%";
  progressBar.style.width = percent + "%";
  progressTrack.setAttribute("aria-valuenow", String(percent));

  stepEl.replaceChildren(buildQuestion(q));
  stepError.hidden = true;
  nextText.textContent = state.step === total - 1 ? "Завершить опрос" : "Далее";
  refreshNav();

  // Лёгкая анимация появления
  stepEl.classList.remove("step-enter");
  void stepEl.offsetWidth;
  stepEl.classList.add("step-enter");

  window.scrollTo({ top: 0 });
  const title = $("#q-title");
  if (title) title.focus({ preventScroll: true });
}

function startSurvey() {
  state.step = 0;
  state.answers = {};
  state.startedAt = Date.now();
  state.submissionId = newId();
  state.submitted = false;
  setSubmitting(false); // снова включаем кнопки после прошлой отправки
  analytics.track("survey_start");
  showScreen("survey");
  renderStep();
}

function goNext() {
  const q = QUESTIONS[state.step];
  const error = validateStep(q);
  if (error) {
    stepError.textContent = error;
    stepError.hidden = false;
    return;
  }

  // Приводим текстовые ответы в порядок (убираем лишние пробелы)
  if (q.type === "text") state.answers[q.id] = cleanText(state.answers[q.id]);
  if (q.type === "extra") {
    state.answers.location = cleanText(state.answers.location);
    state.answers.phone = cleanText(state.answers.phone);
  }

  if (hasAnswer(q)) analytics.track("survey_question_answered", { question_id: q.id });

  if (state.step < QUESTIONS.length - 1) {
    state.step += 1;
    renderStep();
  } else {
    // Последний вопрос: сразу отправляем ответы, без отдельной страницы проверки
    submitSurvey();
  }
}

function goBack() {
  if (state.step === 0) {
    showScreen("welcome");
    return;
  }
  state.step -= 1;
  renderStep();
}

/* ---------------------------------------------------------
   10. ОТПРАВКА В GOOGLE ТАБЛИЦУ
   --------------------------------------------------------- */

// Во время отправки кнопки блокируются, чтобы не создать дубликат
function setSubmitting(isSubmitting) {
  nextBtn.disabled = isSubmitting || state.submitted;
  backBtn.disabled = isSubmitting;
  nextSpinner.hidden = !isSubmitting;
  if (isSubmitting) nextText.textContent = "Отправляем…";
}

// Собирает данные в том виде, как их ждёт Code.gs
function buildPayload(elapsedSeconds) {
  const a = state.answers;
  const answers = {};

  QUESTIONS.forEach((q) => {
    if (q.type === "extra") return;
    const value = a[q.id];
    if (Array.isArray(value)) answers[q.id] = value.join(", ");
    else if (typeof value === "number") answers[q.id] = value;
    else answers[q.id] = cleanText(value);
  });

  answers.location = cleanText(a.location);
  answers.contactAllowed = a.contactAllowed || "";
  answers.phone = a.contactAllowed === CONTACT_YES ? cleanText(a.phone) : "";

  return {
    submissionId: state.submissionId,
    website: honeypot.value,
    elapsedSeconds: elapsedSeconds,
    answers: answers
  };
}

async function sendToGoogle(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Content-Type text/plain — это важно: так браузер не делает лишний
    // «предварительный запрос», и Google Apps Script принимает данные без проблем с CORS.
    const response = await fetch(GOOGLE_SCRIPT_URL.trim(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const result = await response.json();
    if (!result.ok) throw new Error(result.error || "Сервер вернул ошибку");
  } finally {
    clearTimeout(timer);
  }
}

async function submitSurvey() {
  // Защита от двойного нажатия
  if (state.isSubmitting || state.submitted) return;
  state.isSubmitting = true;
  setSubmitting(true);
  stepError.hidden = true;

  const elapsedSeconds = Math.round((Date.now() - state.startedAt) / 1000);
  const payload = buildPayload(elapsedSeconds);

  try {
    if (isDemoMode()) {
      // ДЕМО-РЕЖИМ: ничего не отправляем, показываем данные в консоли
      await delay(600);
      console.log("[ДЕМО-РЕЖИМ] Адрес Google Apps Script не указан. Ответы НЕ отправлены:", payload);
    } else if (payload.website !== "" || elapsedSeconds < MIN_FILL_SECONDS) {
      // Похоже на бота: тихо делаем вид, что всё хорошо, но ничего не отправляем
      await delay(800);
    } else {
      await sendToGoogle(payload);
    }

    state.submitted = true;
    analytics.track("survey_completed");
    demoNotice.hidden = !isDemoMode();
    showScreen("thanks");
  } catch (error) {
    console.error("Ошибка отправки:", error);
    stepError.textContent = "Не удалось отправить ответы. Проверьте интернет и нажмите «Повторить отправку». Ваши ответы сохранены, заполнять заново не нужно.";
    stepError.hidden = false;
    nextText.textContent = "Повторить отправку";
  } finally {
    state.isSubmitting = false;
    setSubmitting(false);
    // setSubmitting(false) не трогает текст кнопки, поэтому «Повторить отправку» остаётся
  }
}

/* ---------------------------------------------------------
   12. ЛОГОТИП
   Если в папке assets лежит logo.svg — он заменит текст «БЕЙС ТЕЛЕКОМ».
   --------------------------------------------------------- */

// Сначала ищем assets/logo.svg, если его нет — assets/logo.png
const LOGO_FILES = ["assets/logo.svg", "assets/logo.png"];

function loadLogo(index = 0) {
  if (index >= LOGO_FILES.length) return; // логотипа нет — остаётся текст «БЕЙС ТЕЛЕКОМ»
  const probe = new Image();
  probe.onload = () => {
    const img = el("img", "logo-img");
    img.src = LOGO_FILES[index];
    img.alt = "Бейс Телеком";
    $("#logo").replaceChildren(img);
  };
  probe.onerror = () => loadLogo(index + 1);
  probe.src = LOGO_FILES[index];
}

/* ---------------------------------------------------------
   13. ЗАПУСК
   --------------------------------------------------------- */

$("#btn-start").addEventListener("click", startSurvey);
nextBtn.addEventListener("click", goNext);
backBtn.addEventListener("click", goBack);
$("#btn-home").addEventListener("click", () => {
  state.answers = {};
  state.step = 0;
  state.submitted = false;
  honeypot.value = "";
  showScreen("welcome");
});

loadLogo();

if (isDemoMode()) {
  console.info("Бейс Телеком опрос: ДЕМО-РЕЖИМ. Вставьте адрес Google Apps Script в GOOGLE_SCRIPT_URL (script.js), чтобы ответы попадали в таблицу.");
}
