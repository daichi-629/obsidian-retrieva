<script lang="ts">
  import type { TagTreeNode } from "../core";
  import TagTree from "./TagTree.svelte";

  interface Props {
    nodes: TagTreeNode[];
    // eslint-disable-next-line no-unused-vars -- parameter name in a type signature, not a binding
    count: (tag: string) => number;
    // eslint-disable-next-line no-unused-vars -- parameter name in a type signature, not a binding
    onSelect: (tag: string) => void;
  }
  const { nodes, count, onSelect }: Props = $props();
</script>

<ul class="retrieva-tag-tree">
  {#each nodes as node (node.path)}
    <li>
      <button class="retrieva-tag-node" onclick={() => onSelect(node.path)}>
        <span>#{node.segment}</span>
        <small>{count(node.path)}</small>
      </button>
      {#if node.children.length > 0}
        <TagTree nodes={node.children} {count} {onSelect} />
      {/if}
    </li>
  {/each}
</ul>
