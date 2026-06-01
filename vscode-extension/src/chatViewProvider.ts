import * as vscode from 'vscode';
import * as path from 'path';
import { streamChat, ChatMessage } from './claudeClient';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'willow.chatView';

  private _view?: vscode.WebviewView;
  private _conversationHistory: ChatMessage[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'send':
          await this._handleUserMessage(message.text);
          break;
        case 'clearHistory':
          this._conversationHistory = [];
          break;
      }
    });
  }

  public focus(): void {
    if (this._view) {
      this._view.show(true);
    }
  }

  public notifyContextChange(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'contextUpdate',
        label: this._getContextLabel(),
      });
    }
  }

  private async _handleUserMessage(userText: string): Promise<void> {
    if (!this._view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('willow');
    const apiKey: string = config.get('claudeApiKey') || '';
    const model: string = config.get('model') || 'claude-sonnet-4-6';

    if (!apiKey) {
      this._view.webview.postMessage({
        type: 'error',
        text:
          'No API key configured. Please set `willow.claudeApiKey` in VS Code Settings.',
      });
      return;
    }

    // Build context prefix (file + selection)
    const contextPrefix = this._buildContextPrefix();
    const fullUserText = contextPrefix
      ? `${contextPrefix}\n\n${userText}`
      : userText;

    // Add to history
    this._conversationHistory.push({ role: 'user', content: fullUserText });

    // Send "thinking" indicator
    this._view.webview.postMessage({ type: 'thinking' });

    try {
      let responseText = '';

      await streamChat(
        this._conversationHistory,
        model,
        apiKey,
        (token: string) => {
          responseText += token;
          this._view?.webview.postMessage({ type: 'token', text: token });
        }
      );

      // Add assistant response to history
      this._conversationHistory.push({
        role: 'assistant',
        content: responseText,
      });

      this._view.webview.postMessage({ type: 'done' });
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : String(err);
      this._view.webview.postMessage({
        type: 'error',
        text: `Error: ${errMsg}`,
      });
      // Remove the user message we added since the request failed
      this._conversationHistory.pop();
    }
  }

  private _buildContextPrefix(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return '';
    }

    const filePath = editor.document.uri.fsPath;
    const fileName = path.basename(filePath);
    const languageId = editor.document.languageId;
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    const parts: string[] = [];

    parts.push(`[Context]\nFile: ${fileName} (${languageId})\nPath: ${filePath}`);

    if (selectedText.trim()) {
      parts.push(
        `Selected text:\n\`\`\`${languageId}\n${selectedText}\n\`\`\``
      );
    }

    return parts.join('\n\n');
  }

  private _getContextLabel(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return 'No file open';
    }
    const fileName = path.basename(editor.document.uri.fsPath);
    const sel = editor.selection;
    const hasSelection = !sel.isEmpty;
    return hasSelection
      ? `${fileName} · selection: lines ${sel.start.line + 1}–${sel.end.line + 1}`
      : `${fileName}`;
  }

  private _getHtml(webview: vscode.Webview): string {
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'chat.css')
    );

    // Use a nonce for CSP
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Willow — Claude</title>
</head>
<body>
<div id="app">
  <div id="messages">
    <div id="empty-state">
      <div class="icon">💬</div>
      <p>Ask Claude anything. Your current file and selection are included automatically.</p>
    </div>
  </div>
  <div id="context-bar">Loading context…</div>
  <div id="input-area">
    <textarea
      id="prompt"
      rows="1"
      placeholder="Message Claude… (Enter to send, Shift+Enter for newline)"
    ></textarea>
    <button id="send-btn" title="Send (Enter)">Send</button>
  </div>
</div>

<script nonce="${nonce}">
(function() {
  // VS Code webview API
  const vscode = acquireVsCodeApi();

  // DOM refs
  const messagesEl = document.getElementById('messages');
  const emptyState = document.getElementById('empty-state');
  const promptEl = document.getElementById('prompt');
  const sendBtn = document.getElementById('send-btn');
  const contextBar = document.getElementById('context-bar');

  let isStreaming = false;
  let currentAssistantBubble = null;
  let currentAssistantRaw = '';

  // ── Utility ────────────────────────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Very lightweight markdown renderer:
   * - Fenced code blocks with optional language
   * - Inline \`code\`
   * - Bold **text**
   * - Italic *text*
   * Everything else is HTML-escaped and line-breaks preserved.
   */
  function renderMarkdown(raw) {
    const parts = [];
    // Split on fenced code blocks
    const codeBlockRe = /\`\`\`(\\w*)?\\n?([\\s\\S]*?)\`\`\`/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRe.exec(raw)) !== null) {
      // Text before this code block
      if (match.index > lastIndex) {
        parts.push(renderInline(raw.slice(lastIndex, match.index)));
      }
      const lang = match[1] || '';
      const code = match[2];
      parts.push(
        '<div class="code-block-wrapper">' +
          (lang ? '<span class="code-lang-label">' + escapeHtml(lang) + '</span>' : '') +
          '<pre><code>' + escapeHtml(code) + '</code></pre>' +
        '</div>'
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < raw.length) {
      parts.push(renderInline(raw.slice(lastIndex)));
    }

    return parts.join('');
  }

  function renderInline(text) {
    // Escape HTML first
    let out = escapeHtml(text);
    // Inline code
    out = out.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    // Bold
    out = out.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    // Italic (single * not preceded/followed by *)
    out = out.replace(/(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)/g, '<em>$1</em>');
    // Line breaks → <br>
    out = out.replace(/\\n/g, '<br>');
    return out;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hideEmptyState() {
    if (emptyState) {
      emptyState.style.display = 'none';
    }
  }

  function addUserBubble(text) {
    hideEmptyState();
    const div = document.createElement('div');
    div.className = 'message user';
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function addThinkingBubble() {
    const div = document.createElement('div');
    div.className = 'message thinking';
    div.id = 'thinking-bubble';
    div.textContent = 'Claude is thinking…';
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function removeThinkingBubble() {
    const el = document.getElementById('thinking-bubble');
    if (el) el.remove();
  }

  function createAssistantBubble() {
    hideEmptyState();
    const div = document.createElement('div');
    div.className = 'message assistant';
    messagesEl.appendChild(div);
    return div;
  }

  function addErrorBubble(text) {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.style.color = 'var(--vscode-errorForeground, #f48771)';
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  // ── Context bar update ──────────────────────────────────────
  function updateContextBar() {
    // We can't query VS Code directly from webview JS, so we just
    // show a static label. The extension side updates it via postMessage.
    // (Initialized via a message on load.)
  }

  // ── Send logic ──────────────────────────────────────────────

  function sendMessage() {
    if (isStreaming) return;
    const text = promptEl.value.trim();
    if (!text) return;

    isStreaming = true;
    sendBtn.disabled = true;
    promptEl.value = '';
    promptEl.style.height = 'auto';

    addUserBubble(text);
    vscode.postMessage({ type: 'send', text });
  }

  // ── Event listeners ─────────────────────────────────────────

  sendBtn.addEventListener('click', sendMessage);

  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  promptEl.addEventListener('input', () => {
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + 'px';
  });

  // ── Messages from extension ─────────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'thinking':
        removeThinkingBubble();
        addThinkingBubble();
        currentAssistantBubble = null;
        currentAssistantRaw = '';
        break;

      case 'token':
        removeThinkingBubble();
        if (!currentAssistantBubble) {
          currentAssistantBubble = createAssistantBubble();
        }
        currentAssistantRaw += msg.text;
        currentAssistantBubble.innerHTML = renderMarkdown(currentAssistantRaw);
        scrollToBottom();
        break;

      case 'done':
        removeThinkingBubble();
        if (currentAssistantBubble) {
          currentAssistantBubble.innerHTML = renderMarkdown(currentAssistantRaw);
        }
        currentAssistantBubble = null;
        currentAssistantRaw = '';
        isStreaming = false;
        sendBtn.disabled = false;
        promptEl.focus();
        scrollToBottom();
        break;

      case 'error':
        removeThinkingBubble();
        addErrorBubble(msg.text);
        currentAssistantBubble = null;
        currentAssistantRaw = '';
        isStreaming = false;
        sendBtn.disabled = false;
        promptEl.focus();
        scrollToBottom();
        break;

      case 'contextUpdate':
        if (contextBar) {
          contextBar.textContent = msg.label || 'No file open';
        }
        break;
    }
  });

  // Focus input on load
  promptEl.focus();
})();
</script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
