import { createInstance } from "i18next";
import { en, type TranslationKey } from "./locales/en";
import { ja } from "./locales/ja";

const i18n = createInstance();

export async function initializeI18n(locale: string): Promise<void> {
  await i18n.init({
    fallbackLng: "en",
    initAsync: false,
    interpolation: { escapeValue: false },
    keySeparator: false,
    lng: locale,
    load: "languageOnly",
    nsSeparator: false,
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    returnNull: false,
  });
}

export async function setLocale(locale: string): Promise<void> {
  if (!i18n.isInitialized) await initializeI18n(locale);
  else await i18n.changeLanguage(locale);
}

export function t(key: TranslationKey, variables: Record<string, string | number> = {}): string {
  return i18n.t(key, { ...variables, defaultValue: en[key] });
}
