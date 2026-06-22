<script lang="ts">
  import { marked } from 'marked';
  import type { Message } from '$lib/types';

  let { message }: { message: Message } = $props();

  let isUser = $derived(message.role === 'user');
  let copied = $state(false);

  function renderMarkdown(text: string): string {
    return marked.parse(text, { async: false }) as string;
  }

  function formatTimestamp(date: string): string {
    const d = new Date(date);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    const time = d.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (sameDay) return time;

    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    }) + ', ' + time;
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(message.content);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      // Clipboard API not available
    }
  }
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'}">
  <div class="flex max-w-[70%] flex-col {isUser ? 'items-end' : 'items-start'}">
    <span class="mb-1 text-xs font-medium {isUser ? 'text-surface-400 ml-0' : 'text-primary-600 ml-10'}">
      {isUser ? 'You' : 'Spur AI Agent'}
    </span>

    <div class="flex items-end gap-2 {isUser ? 'flex-row-reverse' : 'flex-row'}">
      {#if !isUser}
        <img src="/favicon.jpg" alt="Spur" class="h-8 w-8 shrink-0 rounded-full object-cover" />
      {/if}

      <div
        class="rounded-2xl px-4 py-2.5 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-surface-100 [&_code]:px-1 [&_code]:text-xs {isUser
          ? 'rounded-br-md bg-primary-600 text-white'
          : 'rounded-bl-md border border-surface-100 bg-white text-surface-700 shadow-sm'}"
      >
        {#if isUser}
          {message.content}
        {:else}
          {@html renderMarkdown(message.content)}
        {/if}
      </div>
    </div>

    <span class="mt-1 flex items-center gap-3 text-xs text-surface-400 {isUser ? 'ml-0' : 'ml-10'}">
      <span>{formatTimestamp(message.timestamp)}</span>
      <button
        onclick={copyToClipboard}
        title="Copy message"
        class="transition-colors {copied ? 'text-green-500' : 'hover:text-surface-600'}"
      >
        {#if copied}
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        {:else}
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
        {/if}
      </button>
    </span>
  </div>
</div>
