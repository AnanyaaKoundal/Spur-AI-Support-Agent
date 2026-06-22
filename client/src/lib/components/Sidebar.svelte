<script lang="ts">
  import type { Conversation } from '$lib/types';

  let {
    conversations = [],
    activeId = '',
    loading = false,
    onNewChat,
    onSelect,
    class: className = '',
  }: {
    conversations: Conversation[];
    activeId: string;
    loading: boolean;
    onNewChat: () => void;
    onSelect: (id: string) => void;
    class?: string;
  } = $props();
</script>

<aside class="flex h-full w-[260px] shrink-0 flex-col border-r border-surface-200 bg-white {className}">
  <!-- Brand -->
  <div class="flex items-center gap-2.5 border-b border-surface-100 px-5 py-4">
    <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-sm font-bold text-white">
      S
    </div>
    <span class="text-base font-semibold text-surface-800">Spur</span>
  </div>

  <!-- New Chat -->
  <div class="px-3 pt-4 pb-2">
    <button
      onclick={onNewChat}
      class="flex w-full items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 active:bg-primary-800"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      New Chat
    </button>
  </div>

  <!-- Conversations -->
  <div class="flex-1 overflow-y-auto px-3 pb-3">
    {#if loading}
      <p class="mt-8 text-center text-xs text-surface-400">Loading conversations...</p>
    {:else if conversations.length === 0}
      <p class="mt-8 text-center text-xs text-surface-400">No conversations yet</p>
    {/if}

    {#each conversations as conv, i (conv.id)}
      <button
        onclick={() => onSelect(conv.id)}
        class="w-full rounded-lg px-3 py-3 text-left transition {conv.id === activeId
          ? 'bg-primary-50'
          : 'hover:bg-surface-50'}"
      >
        <p
          class="truncate text-sm font-medium {conv.id === activeId ? 'text-primary-700' : 'text-surface-700'}"
          title={conv.title}
        >
          {conv.title}
        </p>
      </button>
      {#if i < conversations.length - 1}
        <div class="mx-3 border-b border-surface-100"></div>
      {/if}
    {/each}
  </div>
</aside>
