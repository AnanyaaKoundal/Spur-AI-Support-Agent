<script lang="ts">
  let {
    onSuggestedQuestion,
  }: {
    onSuggestedQuestion: (q: string) => void;
  } = $props();

  const suggestions = [
    { label: 'Shipping Policy', icon: '🚚' },
    { label: 'Return Policy', icon: '📦' },
    { label: 'Refund Process', icon: '💳' },
    { label: 'Support Hours', icon: '🕐' },
  ];
</script>

<div class="flex h-full flex-col items-center justify-center px-8 text-center">
  <div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50">
    <svg class="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  </div>

  <h2 class="text-2xl font-semibold text-surface-800">How can we help you?</h2>
  <p class="mt-2 max-w-sm text-sm text-surface-500">
    I'm Spur, your AI support assistant. Ask me about orders, shipping, returns, or anything else about our store.
  </p>

  <div class="mt-8 flex flex-wrap justify-center gap-3">
    {#each suggestions as item}
      <button
        onclick={() => onSuggestedQuestion(item.label)}
        class="flex items-center gap-2 rounded-full border border-surface-200 bg-white px-5 py-2.5 text-sm font-medium text-surface-600 shadow-sm transition hover:border-primary-200 hover:text-primary-600 active:bg-surface-50"
      >
        <span>{item.icon}</span>
        <span>{item.label}</span>
      </button>
    {/each}
  </div>
</div>
