import type { KimiChatSessionSummary } from "../../types/acp-kimi.js";
import { PopupPage } from "../components/PopupPage.js";
import { UiButton } from "../components/UiButton.js";
import { UiCard } from "../components/UiCard.js";

export function ChatPlaceholderPage({
  busy,
  sessionId,
  draftMessage,
  historyOpen,
  historyLoading,
  historyItems,
  onDraftMessageChange,
  onResetSession,
  onOpenHistory,
  onCloseHistory,
  onLoadHistorySession,
  onDeleteHistorySession,
  onStopGeneration,
}: {
  busy: boolean;
  sessionId: string | null;
  draftMessage: string;
  historyOpen: boolean;
  historyLoading: boolean;
  historyItems: KimiChatSessionSummary[];
  onDraftMessageChange: (value: string) => void;
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
      subtitle="assistant-ui 集成留给下一任务；当前先保留 React 页面壳层和工具栏结构。"
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
        <UiCard title="聊天页面占位">
          <p className="chat-placeholder__notice">
            当前任务只负责切换到 React 壳层。真正的 assistant-ui 聊天主体会在后续任务接入。
          </p>
          <div className="chat-placeholder__meta">
            <span>Session: {sessionId || "未创建"}</span>
            <span>Status: {busy ? "生成中" : "空闲"}</span>
          </div>
          <label className="chat-placeholder__draft">
            <span>临时草稿预览</span>
            <textarea
              value={draftMessage}
              placeholder="下一任务会在这里接入真正的聊天输入区。"
              onChange={(event) => onDraftMessageChange(event.target.value)}
            />
          </label>
        </UiCard>

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
                      <span>{item.updatedAt || "无更新时间"}</span>
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
      </div>
    </PopupPage>
  );
}
