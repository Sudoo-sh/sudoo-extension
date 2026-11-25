/**
 * The extension's words in English and Arabic. The Arabic follows the panel's own dictionary (web/src/i18n of the
 * panel): an instance is "بيئة", a project "مشروع", a branch "فرع", the panel "اللوحة", and the same action names.
 * The Arabic is typed as the English, so a missing key fails the type check.
 */

import type { InstanceStatus, Stage } from "./types";

/** The English words, grouped by screen. The Arabic dictionary must have the same shape. */
const en = {
  dir: "ltr" as "ltr" | "rtl",
  common: {
    search: "Search",
    settings: "Settings",
    refresh: "Refresh",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    remove: "Remove",
    open: "Open",
    error: "Something went wrong.",
    unreachable: "The panel cannot be reached. Check the connection and try again.",
  },
  status: {
    creating: "Creating",
    online: "Online",
    starting: "Starting",
    busy: "Working",
    paused: "Paused",
    switched_off: "Switched off",
    stopped: "Stopped",
    unknown: "Checking",
  } as Record<InstanceStatus, string>,
  jobStatus: { queued: "Queued", running: "Running", success: "Done", failed: "Failed" } as Record<string, string>,
  stages: { production: "Production", staging: "Staging", development: "Development" } as Record<Stage, string>,
  actions: {
    openOdoo: "Open Odoo",
    openInPanel: "Open in panel",
    logs: "Odoo log",
    start: "Start",
    pause: "Pause",
    restart: "Restart",
    update: "Get latest code",
    confirmProduction: "Production instance: click again to confirm",
  },
  popup: {
    searchLabel: "Search instances",
    emptyTitle: "Connect a panel",
    emptyText: "Add a Sudoo.sh panel with an API token to see its projects and instances here.",
    connect: "Connect a panel",
    thisTab: "This tab",
    plain: "Plain Odoo, no repository",
    noInstances: "No instances yet.",
    noMatch: "No instance matches the search.",
    locked: "Your saved tokens are locked.",
    passphrase: "Passphrase",
    unlock: "Unlock",
    wrongPassphrase: "That passphrase does not open the saved tokens.",
    needsToken: "Enter this panel's token again: tokens are kept only while the browser is open.",
    enterToken: "Enter token",
    needsPermission: "Allow the extension to reach this panel.",
    allow: "Allow",
    tokenRefused: "The panel refused the token. It may have been revoked: create a new one.",
    forbidden: "This token's scope does not allow this.",
    jobStarted: (action: string) => `${action} started`,
    jobDone: (action: string) => `${action}: done`,
    jobFailed: (action: string) => `${action} failed`,
    instances: (n: number) => (n === 1 ? "1 instance" : `${n} instances`),
  },
  github: {
    label: "Sudoo.sh",
    noInstance: "No instance for this branch yet.",
    create: "Create development instance",
    createConfirm: (branch: string, panel: string) => `Create a development instance of ${branch} on ${panel}?`,
    creating: "Creating the instance…",
    created: "The instance is being created. It opens here when it is ready.",
    failed: "The instance could not be created.",
    openOdoo: "Open Odoo",
    openInPanel: "Panel",
    fork: "This pull request comes from a fork: its branch is not in this repository.",
    hide: "Hide on this repository",
    expand: "Show Sudoo.sh",
    collapse: "Collapse",
  },
  options: {
    title: "Sudoo.sh settings",
    panels: "Panels",
    panelsText:
      "Connect each panel with an API token and its signing secret, made on the panel's API tokens page. A read token shows everything but changes nothing; an instances token can also start, pause and restart, and create development instances; a write token can do everything an administrator can.",
    label: "Name",
    labelHint: "Acme production server",
    origin: "Panel address",
    originHint: "https://panel.example.com",
    token: "API token",
    secret: "Signing secret",
    add: "Connect",
    adding: "Checking…",
    badOrigin: "Enter the panel's https:// address.",
    permissionDenied: "The extension needs access to this address to call the panel's API.",
    connected: (label: string) => `${label} is connected.`,
    updateToken: "Replace token",
    noPanels: "No panel connected yet.",
    tokenMissing: "Token needed",
    tokenOk: "Token in use",
    secrets: "Where tokens are kept",
    sessionMode: "This browser session only (recommended)",
    sessionModeText:
      "Tokens stay in memory and are forgotten when the browser closes; nothing secret is written to disk. You enter them again after a restart.",
    passphraseMode: "Remember with a passphrase",
    passphraseModeText:
      "Tokens are encrypted on this computer (AES-256-GCM, a key derived from your passphrase with PBKDF2, 600,000 rounds). You enter the passphrase once per browser session. A weak passphrase can be guessed by someone who copies your browser profile; a forgotten one means entering the tokens again.",
    passphrase: "Passphrase (10 characters or more)",
    passphraseAgain: "Passphrase again",
    passphraseMismatch: "The two passphrases differ.",
    passphraseShort: "The passphrase needs 10 characters or more.",
    enable: "Encrypt and remember",
    disable: "Stop remembering",
    lockNow: "Lock now",
    language: "Language",
    languageAuto: "Browser language",
    github: "GitHub",
    githubText:
      "Show a small Sudoo.sh box on github.com pages of repositories that are projects on your panels: the branch's instance, its stage and status, and a button to create a development instance. No GitHub token: pages are recognised by their address.",
    githubEnable: "Show on GitHub",
    notifications: "Notifications",
    notificationsText:
      "When a job ends or the panel raises an alert. The extension asks each panel once a minute while this is on (less often when a panel cannot be reached).",
    notificationsEnable: "Notify me",
    notifyMine: "Jobs started from this extension",
    notifyAll: "Every job on my panels",
    notifyAlerts: "Panel alerts (needs a token that may read the audit log)",
    saved: "Saved",
  },
  notify: {
    jobSuccess: (action: string, instance: string) => `${action}: ${instance} is done`,
    jobFailed: (action: string, instance: string) => `${action} failed on ${instance}`,
  },
};

/** The shape of a dictionary. */
export type Words = typeof en;

/** The Arabic words. */
const ar: Words = {
  dir: "rtl",
  common: {
    search: "ابحث",
    settings: "الإعدادات",
    refresh: "حدّث",
    close: "أغلق",
    cancel: "ألغِ",
    confirm: "أكّد",
    save: "احفظ",
    remove: "أزل",
    open: "افتح",
    error: "حدث خطأ ما.",
    unreachable: "يتعذّر الوصول إلى اللوحة. تحقّق من الاتصال وحاول مجددًا.",
  },
  status: {
    creating: "قيد الإنشاء",
    online: "تعمل",
    starting: "قيد التشغيل",
    busy: "قيد العمل",
    paused: "متوقفة مؤقتًا",
    switched_off: "مطفأة",
    stopped: "متوقفة",
    unknown: "قيد الفحص",
  },
  jobStatus: { queued: "في الانتظار", running: "قيد التنفيذ", success: "اكتملت", failed: "فشلت" },
  stages: { production: "الإنتاج", staging: "التجهيز", development: "التطوير" },
  actions: {
    openOdoo: "افتح Odoo",
    openInPanel: "افتح في اللوحة",
    logs: "سجل Odoo",
    start: "شغّل",
    pause: "أوقف مؤقتًا",
    restart: "أعد التشغيل",
    update: "اجلب أحدث شيفرة",
    confirmProduction: "بيئة إنتاج: انقر مجددًا للتأكيد",
  },
  popup: {
    searchLabel: "ابحث في البيئات",
    emptyTitle: "اربط لوحة",
    emptyText: "أضف لوحة Sudoo.sh برمز API لترى مشاريعها وبيئاتها هنا.",
    connect: "اربط لوحة",
    thisTab: "هذا التبويب",
    plain: "Odoo مجرد، دون مستودع",
    noInstances: "لا توجد بيئات بعد.",
    noMatch: "لا توجد بيئة تطابق البحث.",
    locked: "رموزك المحفوظة مقفلة.",
    passphrase: "عبارة المرور",
    unlock: "افتح القفل",
    wrongPassphrase: "عبارة المرور هذه لا تفتح الرموز المحفوظة.",
    needsToken: "أدخل رمز هذه اللوحة مجددًا: تُحفظ الرموز ما دام المتصفح مفتوحًا فقط.",
    enterToken: "أدخل الرمز",
    needsPermission: "اسمح للإضافة بالوصول إلى هذه اللوحة.",
    allow: "اسمح",
    tokenRefused: "رفضت اللوحة الرمز. ربما أُلغي: أنشئ رمزًا جديدًا.",
    forbidden: "نطاق هذا الرمز لا يسمح بهذا.",
    jobStarted: (action) => `بدأ ${action}`,
    jobDone: (action) => `${action}: اكتمل`,
    jobFailed: (action) => `فشل ${action}`,
    instances: (n) => (n === 1 ? "بيئة واحدة" : n === 2 ? "بيئتان" : n <= 10 ? `${n} بيئات` : `${n} بيئة`),
  },
  github: {
    label: "Sudoo.sh",
    noInstance: "لا بيئة لهذا الفرع بعد.",
    create: "أنشئ بيئة تطوير",
    createConfirm: (branch, panel) => `أتنشئ بيئة تطوير للفرع ${branch} على ${panel}؟`,
    creating: "جارٍ إنشاء البيئة…",
    created: "البيئة قيد الإنشاء. تظهر هنا حين تجهز.",
    failed: "تعذّر إنشاء البيئة.",
    openOdoo: "افتح Odoo",
    openInPanel: "اللوحة",
    fork: "طلب الدمج هذا من نسخة متفرعة: فرعه ليس في هذا المستودع.",
    hide: "أخفِ في هذا المستودع",
    expand: "اعرض Sudoo.sh",
    collapse: "اطوِ",
  },
  options: {
    title: "إعدادات Sudoo.sh",
    panels: "اللوحات",
    panelsText:
      "اربط كل لوحة برمز API وسرّ التوقيع الخاص به، من صفحة رموز API في اللوحة. رمز القراءة يعرض كل شيء ولا يغيّر شيئًا؛ ورمز البيئات يشغّل البيئات ويوقفها مؤقتًا ويعيد تشغيلها وينشئ بيئات تطوير أيضًا؛ ورمز الكتابة يفعل كل ما يفعله المسؤول.",
    label: "الاسم",
    labelHint: "خادم إنتاج Acme",
    origin: "عنوان اللوحة",
    originHint: "https://panel.example.com",
    token: "رمز API",
    secret: "سرّ التوقيع",
    add: "اربط",
    adding: "جارٍ التحقق…",
    badOrigin: "أدخل عنوان اللوحة الذي يبدأ بـ https://.",
    permissionDenied: "تحتاج الإضافة إلى الوصول إلى هذا العنوان لتستدعي واجهة API للوحة.",
    connected: (label) => `رُبطت ${label}.`,
    updateToken: "استبدل الرمز",
    noPanels: "لم تُربط أي لوحة بعد.",
    tokenMissing: "الرمز مطلوب",
    tokenOk: "الرمز مستخدم",
    secrets: "أين تُحفظ الرموز",
    sessionMode: "جلسة المتصفح هذه فقط (موصى به)",
    sessionModeText:
      "تبقى الرموز في الذاكرة وتُنسى حين يُغلق المتصفح؛ ولا يُكتب أي سرّ على القرص. تدخلها مجددًا بعد إعادة التشغيل.",
    passphraseMode: "احفظها بعبارة مرور",
    passphraseModeText:
      "تُشفَّر الرموز على هذا الحاسوب (AES-256-GCM، بمفتاح مشتق من عبارة مرورك بـ PBKDF2 و600,000 جولة). تدخل عبارة المرور مرة في كل جلسة متصفح. يمكن تخمين عبارة ضعيفة لمن ينسخ ملف تعريف متصفحك؛ ونسيانها يعني إدخال الرموز مجددًا.",
    passphrase: "عبارة المرور (10 أحرف أو أكثر)",
    passphraseAgain: "عبارة المرور مجددًا",
    passphraseMismatch: "عبارتا المرور مختلفتان.",
    passphraseShort: "تحتاج عبارة المرور إلى 10 أحرف أو أكثر.",
    enable: "شفّر واحفظ",
    disable: "توقّف عن الحفظ",
    lockNow: "اقفل الآن",
    language: "اللغة",
    languageAuto: "لغة المتصفح",
    github: "GitHub",
    githubText:
      "اعرض مربعًا صغيرًا لـ Sudoo.sh في صفحات github.com للمستودعات التي هي مشاريع على لوحاتك: بيئة الفرع ومرحلتها وحالتها، وزرًا لإنشاء بيئة تطوير. دون رمز GitHub: تُعرف الصفحات من عناوينها.",
    githubEnable: "اعرض في GitHub",
    notifications: "الإشعارات",
    notificationsText:
      "حين تنتهي مهمة أو ترفع اللوحة تنبيهًا. تسأل الإضافة كل لوحة مرة في الدقيقة ما دام هذا مفعّلًا (وأقل حين يتعذّر الوصول إلى لوحة).",
    notificationsEnable: "أشعرني",
    notifyMine: "المهام التي بدأت من هذه الإضافة",
    notifyAll: "كل المهام على لوحاتي",
    notifyAlerts: "تنبيهات اللوحة (تحتاج رمزًا يقرأ سجل التدقيق)",
    saved: "حُفظ",
  },
  notify: {
    jobSuccess: (action, instance) => `${action}: اكتملت على ${instance}`,
    jobFailed: (action, instance) => `فشل ${action} على ${instance}`,
  },
};

/** The languages the extension speaks. */
export type Locale = "en" | "ar";
/** The dictionaries by language. */
export const dictionaries: Record<Locale, Words> = { en, ar };

/**
 * Choose the language.
 *
 * @param setting - The person's setting; "auto" follows the browser.
 * @param uiLanguage - The browser's language code.
 * @returns "ar" when the browser language starts with "ar" under "auto", otherwise the setting or "en".
 */
export function pickLocale(setting: "auto" | Locale, uiLanguage: string): Locale {
  if (setting !== "auto") return setting;
  return uiLanguage.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/**
 * Get the dictionary of a language.
 *
 * @param locale - The language.
 * @returns The words.
 */
export function wordsFor(locale: Locale): Words {
  return dictionaries[locale];
}

/** Applies the language and direction to a document. */
export function applyLocale(doc: Document, locale: Locale): Words {
  const words = wordsFor(locale);
  doc.documentElement.lang = locale;
  doc.documentElement.dir = words.dir;
  return words;
}
