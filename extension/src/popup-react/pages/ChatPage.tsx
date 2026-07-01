import type {
  KimiChatSessionSummary,
  KimiChatTranscriptEntry,
} from "../../types/acp-kimi.js";
import { Clock, FolderOpen, Trash2 } from "lucide-react";
import { PopupAssistantThread } from "../components/assistant-ui/PopupAssistantThread.js";
import { PopupPage } from "../components/PopupPage.js";
import { Button } from "../components/ui/button.js";

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
    >
      <div className="chat-placeholder" data-test="chat-page">
        {historyOpen ? (
          <div className="flex flex-col gap-2 rounded-[22px] border border-slate-200/80 bg-white/92 p-3 shadow-sm">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-slate-900">历史会话</h3>
              <span className="text-[11px] text-slate-400">{historyItems.length} 个会话</span>
            </div>

            {historyLoading ? (
              <div className="py-6 text-center text-sm text-slate-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-400" />
                <p className="mt-2">加载中...</p>
              </div>
            ) : null}

            {!historyLoading && historyItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                <Clock size={20} className="mx-auto mb-2 text-slate-300" />
                <p>暂无历史会话</p>
              </div>
            ) : null}

            {!historyLoading && historyItems.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {historyItems.map((item) => (
                  <div
                    key={item.sessionId}
                    className="group flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition hover:border-slate-200 hover:bg-slate-100/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {item.title || item.sessionId}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {item.updatedAt ? formatSessionUpdatedAt(item.updatedAt) : "无更新时间"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-60 transition group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label="打开"
                        title="打开会话"
                        onClick={() => onLoadHistorySession(item.sessionId)}
                      >
                        <FolderOpen size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                        aria-label="删除"
                        title="删除会话"
                        onClick={() => onDeleteHistorySession(item.sessionId)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <PopupAssistantThread
          busy={busy}
          draftMessage={draftMessage}
          sessionId={sessionId}
          transcript={transcript}
          historyOpen={historyOpen}
          onDraftMessageChange={onDraftMessageChange}
          onSendMessage={onSendMessage}
          onStopGeneration={onStopGeneration}
          onResetSession={onResetSession}
          onToggleHistory={() => (historyOpen ? onCloseHistory() : onOpenHistory())}
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
