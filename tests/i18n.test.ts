import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t } from "../src/i18n";

describe("i18n", () => {
  afterEach(async () => setLocale("en"));

  it("uses the matching locale file", async () => {
    await setLocale("ja-JP");
    expect(t("common.start")).toBe("開始");
  });

  it("falls back to English when no locale file is available", async () => {
    await setLocale("fr-FR");
    expect(t("common.start")).toBe("Start");
  });

  it("interpolates variables", async () => {
    await setLocale("en-US");
    expect(t("review.invalidBanner", { count: 3 })).toBe("3 cards have history or syntax problems");
  });
});
