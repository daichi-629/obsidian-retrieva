import { IDENTIFIERS } from "./identifiers";
import type { IndexedCard } from "./types";

export function collectScopeTags(inputs: Iterable<IndexedCard | string>): string[] {
  const tags = new Set<string>();
  for (const item of inputs) {
    const rawTags = typeof item === "string" ? [item] : item.tags;
    for (const tag of rawTags) {
      const clean = tag.replace(/^#/, "").replace(/\/+$/, "").trim();
      if (clean && clean !== IDENTIFIERS.cardTag) tags.add(clean);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}

export interface TagTreeNode {
  segment: string;
  path: string;
  children: TagTreeNode[];
}

export function buildTagTree(tags: string[]): TagTreeNode[] {
  const roots: TagTreeNode[] = [];
  const byPath = new Map<string, TagTreeNode>();

  for (const tag of tags) {
    let path = "";
    let siblings = roots;
    for (const segment of tag.split("/").filter(Boolean)) {
      path = path ? `${path}/${segment}` : segment;
      let node = byPath.get(path);
      if (!node) {
        node = { segment, path, children: [] };
        byPath.set(path, node);
        siblings.push(node);
      }
      siblings = node.children;
    }
  }

  const sortNodes = (nodes: TagTreeNode[]): void => {
    nodes.sort((left, right) => left.segment.localeCompare(right.segment));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
}
