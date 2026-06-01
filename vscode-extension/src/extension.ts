import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  // Register the WebviewViewProvider for the chat panel
  const provider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          // Keep the webview alive when the panel is hidden so conversation
          // history is preserved across focus changes.
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Command: focus/open the chat panel
  context.subscriptions.push(
    vscode.commands.registerCommand('willow.openChat', () => {
      vscode.commands.executeCommand('willow.chatView.focus');
    })
  );

  // Notify the webview whenever the active editor or selection changes so
  // the context bar stays up to date.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      provider.notifyContextChange();
    }),
    vscode.window.onDidChangeTextEditorSelection(() => {
      provider.notifyContextChange();
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up — subscriptions are disposed automatically.
}
