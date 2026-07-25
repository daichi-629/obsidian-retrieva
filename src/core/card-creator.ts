import { renderCardTemplate } from "./card-template";
import { uuidv7 } from "./id";
import type { CardIndexLifecycle, FileAdapter } from "./ports";

export interface CreateCardsInput {
  front: string;
  back: string;
  filename: string;
  presetId: string;
  folder: string;
  pair: boolean;
}
export type CreateCardsResult =
  { status: "exists" } | { status: "created"; paths: string[]; reverseError?: string };

/** Creates one card or an atomic-best-effort forward/reverse pair. */
export class CardCreator {
  private readonly creatingPaths = new Set<string>();

  constructor(
    private readonly files: FileAdapter,
    private readonly lifecycle: CardIndexLifecycle,
  ) {}

  async create(input: CreateCardsInput): Promise<CreateCardsResult> {
    const safe = input.filename.replace(/[\\/:*?"<>|]/g, "-");
    const names = input.pair ? [`${safe} (Front).md`, `${safe} (Back).md`] : [`${safe}.md`];
    const paths = names.map(name => (input.folder ? `${input.folder}/${name}` : name));

    if (paths.some(path => this.files.get(path) || this.creatingPaths.has(path)))
      return { status: "exists" };

    for (const path of paths) this.creatingPaths.add(path);

    try {
      const now = new Date();
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const siblingGroupId = input.pair ? uuidv7(now.getTime()) : undefined;
      await this.files.create(
        paths[0]!,
        renderCardTemplate({
          front: input.front,
          back: input.back,
          presetId: input.presetId,
          cardId: uuidv7(now.getTime()),
          eventId: uuidv7(now.getTime() + 1),
          now,
          zone,
          siblingGroupId,
        }),
      );

      const created = [paths[0]!];
      let reverseError: string | undefined;
      if (input.pair)
        try {
          await this.files.create(
            paths[1]!,
            renderCardTemplate({
              front: input.back,
              back: input.front,
              presetId: input.presetId,
              cardId: uuidv7(now.getTime() + 2),
              eventId: uuidv7(now.getTime() + 3),
              now: new Date(now.getTime() + 1),
              zone,
              siblingGroupId,
            }),
          );
          created.push(paths[1]!);
        } catch (error) {
          reverseError = String(error);
        }
      for (const path of created) await this.lifecycle.refresh(path);
      return { status: "created", paths: created, reverseError };
    } finally {
      for (const path of paths) this.creatingPaths.delete(path);
    }
  }
}
