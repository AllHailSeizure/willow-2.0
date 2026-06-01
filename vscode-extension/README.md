# Synapse

Enables the transmission — Claude natively in VS Code for maximum effectiveness.

Synapse replaces GitHub Copilot with a Claude-native experience built around the idea that you and Claude should both be operating at full capacity together.

## Features

- **Sidebar chat panel** — chat with Claude directly in the VS Code activity bar
- **Context awareness** — the current file and selected text are automatically included in Claude's context
- **Streaming responses** — Claude's replies stream in token by token
- **Code block rendering** — code in responses is rendered with a monospace font and subtle background
- **Conversation history** — multi-turn conversation is maintained within a session

## Setup

1. Install the extension
2. Open VS Code Settings (`Ctrl+,`) and search for "Synapse"
3. Set **Synapse: Claude Api Key** to your [Anthropic API key](https://console.anthropic.com)
4. Click the Synapse icon in the activity bar to open the panel

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `synapse.claudeApiKey` | `""` | Anthropic API key (keep secret) |
| `synapse.model` | `claude-sonnet-4-6` | Claude model to use |

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
