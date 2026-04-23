import { UiButton } from "./UiButton.js";

export interface GitHubBranchCreateModalStateView {
  visible: boolean;
  stage: "preview" | "creating" | "success" | "error";
  repo: string;
  defaultBranchName: string;
  editedBranchName: string;
  workItemTitle: string;
  systemLabel: string;
  error: { errorCode: string; errorMessage: string } | null;
  result: { branchName: string; branchUrl: string } | null;
}

export function GitHubBranchCreateModal({
  state,
  onClose,
  onConfirm,
  onBranchNameChange,
}: {
  state: GitHubBranchCreateModalStateView;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onBranchNameChange: (value: string) => void;
}) {
  if (!state.visible) {
    return null;
  }

  return (
    <div className="bulk-modal-backdrop" data-test="github-branch-create-modal">
      <div className="bulk-modal" role="dialog" aria-modal="true" aria-labelledby="branch-modal-title">
        <div className="bulk-modal__header">
          <h3 id="branch-modal-title">创建 GitHub 分支</h3>
          <button className="bulk-modal__close" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="bulk-modal__body">
          {state.stage === "preview" && (
            <div className="branch-modal__form">
              <div className="branch-modal__field">
                <label className="branch-modal__label">GitHub 仓库</label>
                <div className="branch-modal__value">
                  <a
                    href={`https://github.com/${state.repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="branch-modal__link"
                  >
                    {state.repo}
                  </a>
                </div>
              </div>

              <div className="branch-modal__field">
                <label className="branch-modal__label">System</label>
                <div className="branch-modal__value">{state.systemLabel}</div>
              </div>

              <div className="branch-modal__field">
                <label className="branch-modal__label">工作项</label>
                <div className="branch-modal__value">{state.workItemTitle}</div>
              </div>

              <div className="branch-modal__field">
                <label className="branch-modal__label" htmlFor="branch-name-input">
                  分支名称
                </label>
                <input
                  id="branch-name-input"
                  type="text"
                  className="branch-modal__input"
                  value={state.editedBranchName}
                  onChange={(e) => onBranchNameChange(e.target.value)}
                  maxLength={50}
                  data-test="branch-name-input"
                />
                <div className="branch-modal__hint">
                  {state.editedBranchName.length}/50 字符
                </div>
              </div>
            </div>
          )}

          {state.stage === "creating" && (
            <div className="branch-modal__center">
              <p>正在创建分支...</p>
            </div>
          )}

          {state.stage === "success" && state.result && (
            <div className="branch-modal__success">
              <p className="branch-modal__success-title">✅ 分支创建成功</p>
              <p className="branch-modal__success-detail">
                分支{" "}
                <a
                  href={state.result.branchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="branch-modal__link"
                >
                  {state.result.branchName}
                </a>{" "}
                已在 {state.repo} 创建
              </p>
            </div>
          )}

          {state.stage === "error" && state.error && (
            <div className="branch-modal__error">
              <p className="branch-modal__error-title">创建失败</p>
              <p className="branch-modal__error-message">{state.error.errorMessage}</p>
            </div>
          )}
        </div>

        <div className="bulk-modal__footer">
          {state.stage === "preview" && (
            <>
              <UiButton variant="default" onClick={onClose}>
                取消
              </UiButton>
              <UiButton variant="primary" onClick={onConfirm}>
                确认创建
              </UiButton>
            </>
          )}
          {(state.stage === "success" || state.stage === "error") && (
            <UiButton onClick={onClose}>关闭</UiButton>
          )}
        </div>
      </div>
    </div>
  );
}
