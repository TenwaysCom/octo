import type {
  KimiChatSessionSummary,
  KimiChatTranscriptEntry,
} from "../../types/acp-kimi.js";
import { PopupAssistantThread } from "../components/assistant-ui/PopupAssistantThread.js";
import { PopupPage } from "../components/PopupPage.js";
import { UiButton } from "../components/UiButton.js";
import { UiCard } from "../components/UiCard.js";

export function ChatPage({
  busy,
  sessionId,
  transcript,
  draftMessage,
  historyOpen,
  historyLoading,
  historyItems,
  onDraftMessageChange,
  onSendMessage,
  onResetSession,
  onOpenHistory,
  onCloseHistory,
  onLoadHistorySession,
  onDeleteHistorySession,
  onStopGeneration,
}: {
  busy: boolean;
  sessionId: string | null;
  transcript: KimiChatTranscriptEntry[];
  draftMessage: string;
  historyOpen: boolean;
  historyLoading: boolean;
  historyItems: KimiChatSessionSummary[];
  onDraftMessageChange: (value: string) => void;
  onSendMessage: (value: string) => void | Promise<void>;
  onResetSession: () => void;
  onOpenHistory: () => void;
  onCloseHistory: () => void;
  onLoadHistorySession: (sessionId: string) => void | Promise<void>;
  onDeleteHistorySession: (sessionId: string) => void | Promise<void>;
  onStopGeneration: () => void;
}) {
  return (
    <PopupPage
      title="聊天"
      subtitle="assistant-ui 已接入到 React 聊天页，并继续复用现有 popup controller 管理会话与历史。当前 thoughts 和工具调用已经映射到 assistant-ui 原生 reasoning/tool-call parts。"
      actions={(
        <div className="chat-placeholder__toolbar">
          <UiButton onClick={historyOpen ? onCloseHistory : onOpenHistory}>
            {historyOpen ? "关闭历史" : "历史"}
          </UiButton>
          <UiButton onClick={onResetSession}>新会话</UiButton>
          {busy ? <UiButton onClick={onStopGeneration}>停止</UiButton> : null}
        </div>
      )}
    >
      <div className="chat-placeholder" data-test="chat-page">
        {historyOpen ? (
          <UiCard title="历史会话">
            {historyLoading ? <p className="chat-placeholder__notice">加载中...</p> : null}
            {!historyLoading && historyItems.length === 0 ? (
              <p className="chat-placeholder__notice">暂无历史会话</p>
            ) : null}
            {!historyLoading && historyItems.length > 0 ? (
              <div className="chat-placeholder__history-list">
                {historyItems.map((item) => (
                  <div key={item.sessionId} className="chat-placeholder__history-item">
                    <div className="chat-placeholder__history-copy">
                      <strong>{item.title || item.sessionId}</strong>
                      <span>
                        {item.updatedAt ? formatSessionUpdatedAt(item.updatedAt) : "无更新时间"}
                      </span>
                    </div>
                    <div className="chat-placeholder__toolbar">
                      <UiButton size="sm" onClick={() => onLoadHistorySession(item.sessionId)}>
                        打开
                      </UiButton>
                      <UiButton
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteHistorySession(item.sessionId)}
                      >
                        删除
                      </UiButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </UiCard>
        ) : null}

        <PopupAssistantThread
          busy={busy}
          draftMessage={draftMessage}
          sessionId={sessionId}
          transcript={transcript}
          onDraftMessageChange={onDraftMessageChange}
          onSendMessage={onSendMessage}
          onStopGeneration={onStopGeneration}
        />
      </div>
    </PopupPage>
  );
}

function formatSessionUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return updatedAt;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
