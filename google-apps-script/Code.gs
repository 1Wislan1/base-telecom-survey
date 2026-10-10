/**
 * Бейс Телеком — приём ответов опроса в Google Таблицу.
 *
 * Как использовать: см. README.md (шаги 3–7).
 * Скрипт нужно создавать из самой таблицы: Расширения → Apps Script.
 */

// Название листа, куда пишутся ответы (если его нет — создастся сам)
const SHEET_NAME = "Ответы";

// Максимальная длина текста в одной ячейке
const MAX_TEXT = 1000;

// Заголовки таблицы (первая строка)
const HEADERS = [
  "Дата",
  "Время",
  "Общая оценка",
  "Стабильность",
  "Скорость",
  "Частота проблем",
  "Поддержка",
  "Что важно",
  "Что нравится",
  "Что не нравится",
  "Что улучшить",
  "NPS",
  "Источник",
  "Дополнительный комментарий",
  "Населённый пункт",
  "Разрешена обратная связь",
  "Телефон"
];

/**
 * Проверка в браузере: если открыть адрес Web App, увидите это сообщение.
 */
function doGet() {
  return jsonResponse_({ ok: true, message: "Бейс Телеком: сервис приёма ответов работает." });
}

/**
 * Сюда приходят ответы с сайта.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // Если ответы приходят одновременно, они выстраиваются в очередь
    lock.waitLock(15000);

    const raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error("Пустой запрос.");

    const data = JSON.parse(raw);

    // Ловушка для ботов: поле «website» у людей всегда пустое
    if (data.website) return jsonResponse_({ ok: true });

    const submissionId = String(data.submissionId || "");
    if (!submissionId) throw new Error("Нет идентификатора ответа.");

    // Защита от дублей: тот же ответ повторно не записываем
    const cache = CacheService.getScriptCache();
    const cacheKey = "sub_" + submissionId.slice(0, 80);
    if (cache.get(cacheKey)) return jsonResponse_({ ok: true, duplicate: true });

    const answers = validate_(data.answers);
    const sheet = getSheet_();

    const now = new Date();
    const timeZone = sheet.getParent().getSpreadsheetTimeZone();

    const row = [
      Utilities.formatDate(now, timeZone, "dd.MM.yyyy"),
      Utilities.formatDate(now, timeZone, "HH:mm:ss"),
      answers.overall,
      answers.stability,
      answers.speed,
      answers.problems,
      answers.support,
      answers.important,
      answers.likes,
      answers.dislikes,
      answers.improve,
      answers.nps,
      answers.source,
      answers.comment,
      answers.location,
      answers.contactAllowed,
      answers.phone
    ];

    // Формат «простой текст»: так телефон «+7…» не превратится в формулу
    const newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, row.length).setNumberFormat("@").setValues([row]);

    cache.put(cacheKey, "1", 6 * 60 * 60);
    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) { /* блокировка не была взята */ }
  }
}

/**
 * Один раз запустите эту функцию вручную (кнопка «Выполнить»),
 * чтобы выдать скрипту доступ к таблице и создать заголовки.
 */
function authorizeScript() {
  getSheet_();
  Logger.log("Готово: лист «" + SHEET_NAME + "» готов к приёму ответов.");
}

/* ----------------- Внутренние функции ----------------- */

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("Скрипт не привязан к таблице. Создайте его через Расширения → Apps Script.");

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS])
      .setFontWeight("bold")
      .setBackground("#0B2A5B")
      .setFontColor("#FFFFFF")
      .setWrap(true);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Проверяет и очищает данные, пришедшие с сайта
function validate_(input) {
  if (!input || typeof input !== "object") throw new Error("Нет данных ответов.");

  const overall = toInt_(input.overall);
  const nps = toInt_(input.nps);
  if (isNaN(overall) || overall < 1 || overall > 10) throw new Error("Общая оценка должна быть от 1 до 10.");
  if (isNaN(nps) || nps < 0 || nps > 10) throw new Error("Оценка рекомендации должна быть от 0 до 10.");

  const result = {
    overall: overall,
    nps: nps,
    stability: clean_(input.stability, 100),
    speed: clean_(input.speed, 100),
    problems: clean_(input.problems, 100),
    support: clean_(input.support, 100),
    important: clean_(input.important, 300),
    likes: clean_(input.likes, MAX_TEXT),
    dislikes: clean_(input.dislikes, MAX_TEXT),
    improve: clean_(input.improve, MAX_TEXT),
    source: clean_(input.source, 100),
    comment: clean_(input.comment, MAX_TEXT),
    location: clean_(input.location, 100),
    contactAllowed: clean_(input.contactAllowed, 10),
    phone: clean_(input.phone, 20)
  };

  ["stability", "speed", "problems", "support", "important", "source"].forEach(function (key) {
    if (!result[key]) throw new Error("Не заполнен обязательный ответ: " + key);
  });

  // Телефон сохраняем только если человек разрешил связь
  if (result.contactAllowed !== "Да") result.phone = "";
  if (result.phone && !/^[+\d][\d\s()\-]{8,19}$/.test(result.phone)) {
    throw new Error("Некорректный номер телефона.");
  }

  return result;
}

function toInt_(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : NaN;
}

function clean_(value, maxLength) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function jsonResponse_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
