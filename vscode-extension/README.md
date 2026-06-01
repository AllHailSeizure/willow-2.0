# Willow — Claude

A VS Code extension that replaces GitHub Copilot with a Claude-native chat panel.

## Features

- **Sidebar chat panel** — chat with Claude directly in the VS Code activity bar
- **Context awareness** — the current file and selected text are automatically included in Claude's context
- **Streaming responses** — Claude's replies stream in token by token
- **Code block rendering** — code in responses is rendered with a monospace font and syntax-highlighted background
- **Conversation history** — multi-turn conversation is maintained within a session

## Setup

1. Install the extension
2. Open VS Code Settings (`Ctrl+,`) and search for "Willow"
3. Set **Willow: Claude Api Key** to your [Anthropic API key](https://console.anthropic.com)
4. Click the chat icon in the activity bar to open the panel

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `willow.claudeApiKey` | `""` | Anthropic API key (keep secret) |
| `willow.model` | `claude-sonnet-4-6` | Claude model to use |

## Usage

- Type a message and press **Enter** to send
- Press **Shift+Enter** to insert a newline without sending
- The context bar at the bottom shows which file/selection is currently in context
- Select text in the editor before sending to include it in the prompt

## Development

```bash
cd vscode-extension
npm install
npm run build     # one-shot build
npm run watch     # rebuild on file changes
```
