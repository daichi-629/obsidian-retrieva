export class Plugin {
  app = {};
  registerView() {}
  addCommand() {}
  addSettingTab() {}
  addRibbonIcon() {}
  registerEvent() {}
}

export class Notice {
  constructor(public message: string) {}
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
  immediate?: boolean,
): T {
  return fn;
}

export const moment = {
  locale: () => "en",
};

export class TFile {
  path = "";
  name = "";
  extension = "md";
}

export class TAbstractFile {
  path = "";
  name = "";
}
