<script lang="ts">
  import Sidebar from '$lib/components/Sidebar.svelte';
  import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
  import ChatMessage from '$lib/components/ChatMessage.svelte';
  import MessageComposer from '$lib/components/MessageComposer.svelte';
  import { chatApi } from '$lib/api/chat';
  import { ApiError } from '$lib/api/client';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import type { Conversation, Message } from '$lib/types';

  let conversations = $state<Conversation[]>([]);
  let messagesByConversation = $state<Record<string, Message[]>>({});
  let activeConversationId = $state<string | null>(null);
  let sidebarOpen = $state(false);
  let isTyping = $state(false);
  let showWelcome = $state(true);
  let isLoadingMessages = $state(false);
  let isLoadingConversations = $state(true);
  let failedMessage = $state<{ text: string; messageId: string; body: string; retryAfter: number } | null>(null);
  let retryCountdown = $state(0);

  let activeConversation = $derived(
    conversations.find((c) => c.id === activeConversationId) ?? null
  );

  let activeMessages = $derived(
    activeConversationId ? messagesByConversation[activeConversationId] ?? [] : []
  );

  // ── API helpers ──

  async function loadConversations() {
    isLoadingConversations = true;
    try {
      const res = await chatApi.getConversations();
      conversations = res.data;
    } catch {
      // Silently fail — conversations will be empty
    } finally {
      isLoadingConversations = false;
    }
  }

  async function loadMessages(convId: string) {
    isLoadingMessages = true;
    try {
      const res = await chatApi.getMessages(convId);
      if (!conversations.find((c) => c.id === convId)) {
        conversations = [res.data.conversation, ...conversations];
      }
      messagesByConversation[convId] = res.data.messages;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        activeConversationId = null;
        showWelcome = true;
        syncUrl(null);
      }
    } finally {
      isLoadingMessages = false;
    }
  }

  // ── Initialization ──

  if (browser) {
    const urlId = new URL(window.location.href).searchParams.get('c');
    if (urlId) {
      activeConversationId = urlId;
      showWelcome = false;
      loadMessages(urlId);
    }
    loadConversations();
  }

  // ── URL sync ──

  function syncUrl(id: string | null) {
    if (!browser) return;
    if (id) {
      goto('/?c=' + id, { replaceState: true, noScroll: true });
    } else {
      goto('/', { replaceState: true, noScroll: true });
    }
  }

  // ── Actions ──

  function startNewChat() {
    showWelcome = true;
    activeConversationId = null;
    failedMessage = null;
    retryCountdown = 0;
    isTyping = false;
    syncUrl(null);
    sidebarOpen = false;
  }

  async function selectConversation(id: string) {
    showWelcome = false;
    activeConversationId = id;
    failedMessage = null;
    retryCountdown = 0;
    isTyping = false;
    syncUrl(id);
    sidebarOpen = false;

    if (!messagesByConversation[id]) {
      await loadMessages(id);
    }
  }

  async function handleSuggestedQuestion(q: string) {
    await sendMessage(q);
  }

  async function sendMessage(text: string) {
    const sessionId = activeConversationId ?? undefined;
    isTyping = true;
    failedMessage = null;

    const userMsg: Message = {
      id: `opt-${Date.now()}`,
      conversationId: activeConversationId ?? '',
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    if (activeConversationId) {
      messagesByConversation[activeConversationId] = [...activeMessages, userMsg];
    } else {
      const optimisticId = `new-${Date.now()}`;
      conversations = [
        { id: optimisticId, title: 'New conversation', createdAt: new Date().toISOString() },
        ...conversations,
      ];
      activeConversationId = optimisticId;
      showWelcome = false;
      syncUrl(optimisticId);
      messagesByConversation[optimisticId] = [{ ...userMsg, conversationId: optimisticId }];
    }

    try {
      const result = await chatApi.sendMessage(text, sessionId);
      const newId = result.sessionId;

      if (!sessionId) {
        const optimisticId = activeConversationId!;
        await loadConversations();
        activeConversationId = newId;
        syncUrl(newId);
        const existing = messagesByConversation[optimisticId] ?? [];
        messagesByConversation[newId] = [
          ...existing,
          {
            id: `ai-${Date.now()}`,
            conversationId: newId,
            role: 'agent',
            content: result.reply,
            timestamp: new Date().toISOString(),
          },
        ];
        delete messagesByConversation[optimisticId];
      } else {
        messagesByConversation[newId] = [
          ...activeMessages,
          {
            id: `ai-${Date.now()}`,
            conversationId: newId,
            role: 'agent',
            content: result.reply,
            timestamp: new Date().toISOString(),
          },
        ];
      }
    } catch (e) {
      const errorBody = e instanceof Error ? e.message : 'Something went wrong';
      const statusCode = e instanceof ApiError ? e.status : 0;
      const retryAfter = e instanceof ApiError
        ? parseInt(e.headers?.['retry-after'] ?? '0', 10)
        : 0;

      if (!sessionId && activeConversationId) {
        const optimisticId = activeConversationId;
        conversations = conversations.filter((c) => c.id !== optimisticId);
        delete messagesByConversation[optimisticId];
        activeConversationId = null;
        showWelcome = true;
        syncUrl(null);
      }

      if (activeConversationId) {
        const ra = statusCode === 429 && isFinite(retryAfter) && retryAfter > 0
          ? Math.max(30, retryAfter)
          : 0;
        failedMessage = { text, messageId: userMsg.id, body: errorBody, retryAfter: ra };
        if (ra > 0) {
          retryCountdown = ra;
          isTyping = true;
        }
      }
    } finally {
      if (!failedMessage || failedMessage.retryAfter === 0) {
        isTyping = false;
      }
    }
  }

  function retryMessage(msgId: string) {
    if (!failedMessage || failedMessage.messageId !== msgId) return;
    const text = failedMessage.text;
    failedMessage = null;
    retryCountdown = 0;
    if (msgId && activeConversationId && messagesByConversation[activeConversationId]) {
      const msgs = messagesByConversation[activeConversationId];
      const idx = msgs.findIndex(m => m.id === msgId);
      if (idx >= 0) {
        messagesByConversation[activeConversationId] = [...msgs.slice(0, idx), ...msgs.slice(idx + 1)];
      }
    }
    sendMessage(text);
  }

  // ── Scroll behaviour ──

  let messageContainer: HTMLDivElement | undefined = $state();
  let isNearBottom = $state(true);

  function checkScroll() {
    if (!messageContainer) return;
    const threshold = 80;
    const dist = messageContainer.scrollHeight - messageContainer.scrollTop - messageContainer.clientHeight;
    isNearBottom = dist < threshold;
  }

  function scrollToBottom() {
    if (!messageContainer) return;
    messageContainer.scrollTop = messageContainer.scrollHeight;
    isNearBottom = true;
  }

  $effect(() => {
    if (activeMessages.length && isNearBottom) {
      requestAnimationFrame(scrollToBottom);
    }
  });

  $effect(() => {
    if (!isTyping && isNearBottom) {
      requestAnimationFrame(scrollToBottom);
    }
  });

  $effect(() => {
    if (retryCountdown > 0) {
      const id = setInterval(() => {
        retryCountdown--;
      }, 1000);
      return () => clearInterval(id);
    }
  });

  // When countdown hits 0 for a rate-limit error, switch to "Retry Message" state
  $effect(() => {
    if (retryCountdown === 0 && failedMessage && failedMessage.retryAfter > 0) {
      failedMessage = { ...failedMessage, retryAfter: 0 };
      isTyping = false;
    }
  });
</script>

<div class="flex h-screen bg-surface-50">
  <!-- Sidebar: always visible on desktop -->
  <Sidebar
    {conversations}
    activeId={activeConversationId ?? ''}
    loading={isLoadingConversations}
    onNewChat={startNewChat}
    onSelect={selectConversation}
    class="hidden lg:flex"
  />

  <!-- Sidebar: overlay on mobile/tablet -->
  {#if sidebarOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40 bg-black/40 lg:hidden" onclick={() => sidebarOpen = false}></div>
    <div class="fixed inset-y-0 left-0 z-50 w-[260px] lg:hidden">
      <button
        onclick={() => sidebarOpen = false}
        aria-label="Close sidebar"
        class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-surface-400 transition hover:bg-surface-100 hover:text-surface-600"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <Sidebar
        {conversations}
        activeId={activeConversationId ?? ''}
        loading={isLoadingConversations}
        onNewChat={startNewChat}
        onSelect={selectConversation}
      />
    </div>
  {/if}

  <div class="flex flex-1 flex-col">
    <!-- Header -->
    <header class="flex items-center justify-between border-b border-surface-100 bg-white px-4 py-3 lg:px-6 lg:py-3.5">
      <div class="flex items-center gap-3">
        <button
          onclick={() => sidebarOpen = true}
          aria-label="Open sidebar"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 lg:hidden"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div>
          <h1 class="text-sm font-semibold text-surface-800">Spur AI Support</h1>
          <div class="flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
            <span class="text-xs text-surface-400">Online</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        {#if activeConversation}
          <span class="hidden truncate text-sm text-surface-500 sm:block">{activeConversation.title}</span>
        {/if}
        {#if activeConversation}
          <button
            onclick={startNewChat}
            aria-label="New conversation"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 lg:hidden"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        {/if}
      </div>
    </header>

    <!-- Content -->
    <div class="relative flex flex-1 flex-col overflow-hidden">
      {#if isLoadingMessages}
        <div class="flex flex-1 items-center justify-center">
          <div class="flex items-center gap-2 text-sm text-surface-400">
            <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading conversation...
          </div>
        </div>
      {:else if showWelcome && !activeConversationId}
        <div class="flex-1">
          <WelcomeScreen onSuggestedQuestion={handleSuggestedQuestion} />
        </div>
      {:else if activeMessages.length > 0}
        <div
          bind:this={messageContainer}
          onscroll={checkScroll}
          class="flex-1 space-y-3 overflow-y-auto px-6 py-5"
        >
          {#each activeMessages as msg (msg.id)}
            <ChatMessage message={msg} />
          {/each}

          {#if failedMessage}
            <div class="flex justify-end text-xs">
              {#if failedMessage.retryAfter > 0}
                <div class="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                  <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  <span>{failedMessage.body} You can try again in <strong>{retryCountdown}s</strong>.</span>
                </div>
              {:else}
                <div class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-600">
                  <svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <span>Your previous message wasn't processed.</span>
                  <button
                    onclick={() => retryMessage(failedMessage.messageId)}
                    class="shrink-0 rounded-md bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-200"
                  >Retry Message</button>
                </div>
              {/if}
            </div>
          {/if}

          {#if isTyping && !failedMessage}
            <div class="flex items-start gap-2">
              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                S
              </div>
              <div class="flex items-center gap-1 rounded-2xl rounded-bl-md border border-surface-100 bg-white px-4 py-3 shadow-sm">
                <span class="h-2 w-2 animate-bounce rounded-full bg-surface-300" style="animation-delay: 0s"></span>
                <span class="h-2 w-2 animate-bounce rounded-full bg-surface-300" style="animation-delay: 0.15s"></span>
                <span class="h-2 w-2 animate-bounce rounded-full bg-surface-300" style="animation-delay: 0.3s"></span>
              </div>
            </div>
          {/if}
        </div>
      {:else if activeConversationId}
        <div class="flex flex-1 items-center justify-center text-sm text-surface-400">
          No messages yet
        </div>
      {:else}
        <div class="flex-1">
          <WelcomeScreen onSuggestedQuestion={handleSuggestedQuestion} />
        </div>
      {/if}

      <!-- Scroll-to-bottom button -->
      {#if !isNearBottom && activeMessages.length > 0}
        <button
          onclick={scrollToBottom}
          aria-label="Scroll to latest"
          class="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full border border-surface-200 bg-white px-4 py-2 text-xs font-medium text-surface-500 shadow-lg transition hover:text-primary-600"
        >
          <span class="flex items-center gap-1.5">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            Scroll to end
          </span>
        </button>
      {/if}

      {#key activeConversationId}
        <MessageComposer onSend={sendMessage} disabled={isTyping} />
      {/key}
    </div>
  </div>
</div>
