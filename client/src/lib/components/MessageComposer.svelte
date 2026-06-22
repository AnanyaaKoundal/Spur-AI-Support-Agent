<script lang="ts">
  let {
    onSend,
    disabled = false,
  }: {
    onSend: (text: string) => void;
    disabled?: boolean;
  } = $props();

  const MAX_LENGTH = 10000;

  let text = $state('');

  let charCount = $derived(text.length);
  let overLimit = $derived(charCount > MAX_LENGTH);

  function handleSend() {
    if (disabled || overLimit) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    text = '';
  }
</script>

<div class="border-t border-surface-100 bg-white px-5 py-4">
  <div class="flex items-end gap-3">
    <div class="relative flex-1">
      <textarea
        bind:value={text}
        onkeydown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type your message..."
        rows="1"
        class="max-h-32 w-full resize-none rounded-xl border px-4 py-2.5 text-sm text-surface-800 outline-none transition placeholder:text-surface-400 focus:ring-2 {overLimit
          ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100'
          : 'border-surface-200 bg-surface-50 focus:border-primary-300 focus:bg-white focus:ring-primary-100'}"
      ></textarea>
      {#if charCount > 0}
        <div class="pointer-events-none absolute bottom-2 right-3 text-xs {overLimit ? 'font-medium text-red-500' : 'text-surface-400'}">
          {charCount}/{MAX_LENGTH}
        </div>
      {/if}
    </div>
    <button
      onclick={handleSend}
      disabled={disabled || overLimit || !text.trim()}
      aria-label="Send message"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:opacity-40"
    >
      <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
      </svg>
    </button>
  </div>
</div>
