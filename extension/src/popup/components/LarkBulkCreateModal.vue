<template>
  <div
    v-if="visible"
    class="bulk-modal-backdrop"
    data-test="lark-bulk-create-modal"
  >
    <div class="bulk-modal">
      <div class="bulk-modal__header">
        <h3>批量创建 MEEGLE TICKET</h3>
        <button class="bulk-modal__close" @click="$emit('close')">关闭</button>
      </div>

      <div v-if="stage === 'error' && bulkError" class="bulk-modal__body" data-test="lark-bulk-create-modal-error">
        <p class="bulk-modal__error-title">无法继续</p>
        <p v-if="bulkError.errorCode" class="bulk-modal__error-code">错误码: {{ bulkError.errorCode }}</p>
        <p class="bulk-modal__error-message">{{ bulkError.errorMessage }}</p>
      </div>

      <div v-else-if="stage === 'preview'" class="bulk-modal__body">
        <p class="bulk-modal__summary">
          本次将创建 {{ preview?.eligibleRecords.length ?? 0 }} 条，已跳过
          {{ preview?.skippedRecords.length ?? 0 }} 条。
        </p>
        <table class="bulk-modal__table">
          <thead>
            <tr>
              <th>编号</th>
              <th>Issue 类型</th>
              <th>Title</th>
              <th>Priority</th>
              <th>记录 ID</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="record in preview?.eligibleRecords ?? []"
              :key="record.recordId"
            >
              <td>{{ record.issueNumber }}</td>
              <td>{{ record.issueType }}</td>
              <td class="bulk-modal__title-cell">{{ record.title }}</td>
              <td>{{ record.priority }}</td>
              <td>{{ record.recordId }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="stage === 'executing'" class="bulk-modal__body">
        <p>创建中...</p>
      </div>

      <div v-else-if="stage === 'result'" class="bulk-modal__body">
        <template v-if="result?.ok">
          <p class="bulk-modal__summary">
            创建完成: 成功 {{ result.summary.created }}，失败
            {{ result.summary.failed }}，跳过 {{ result.summary.skipped }}
          </p>
          <div v-if="result.createdRecords.length" class="bulk-modal__section">
            <h4>已创建</h4>
            <ul>
              <li v-for="record in result.createdRecords" :key="record.recordId">
                编号 {{ record.issueNumber }} · Issue 类型 {{ record.issueType }} ·
                {{ record.recordId }} · {{ record.title }}
                <template v-if="record.meegleLink">
                  ·
                  <a :href="record.meegleLink" target="_blank" rel="noreferrer">Meegle</a>
                </template>
              </li>
            </ul>
          </div>
          <div v-if="result.failedRecords.length" class="bulk-modal__section">
            <h4>失败</h4>
            <ul>
              <li v-for="record in result.failedRecords" :key="record.recordId">
                编号 {{ record.issueNumber }} · Issue 类型 {{ record.issueType }} ·
                {{ record.recordId }} · {{ record.errorMessage }}
              </li>
            </ul>
          </div>
        </template>
        <p v-else>
          创建失败: {{ result?.error.errorMessage }}
        </p>
      </div>

      <div class="bulk-modal__footer">
        <button v-if="stage === 'preview'" @click="$emit('confirm')">确认创建</button>
        <button v-else @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  LarkBaseBulkCreateResultPayload,
  LarkBaseBulkPreviewResultPayload,
} from "../../types/lark.js";

defineProps<{
  visible: boolean;
  stage: "hidden" | "preview" | "executing" | "result" | "error";
  preview: Extract<LarkBaseBulkPreviewResultPayload, { ok: true }> | null;
  result: LarkBaseBulkCreateResultPayload | null;
  bulkError: { errorCode?: string; errorMessage: string } | null;
}>();

defineEmits<{
  close: [];
  confirm: [];
}>();
</script>

<style scoped>
.bulk-modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(15 23 42 / 28%);
  padding: 16px;
}

.bulk-modal {
  width: min(720px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid #dbe4f0;
  box-shadow: 0 20px 50px rgb(15 23 42 / 20%);
  overflow: hidden;
}

.bulk-modal__header,
.bulk-modal__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e5edf7;
}

.bulk-modal__footer {
  border-bottom: none;
  border-top: 1px solid #e5edf7;
}

.bulk-modal__body {
  padding: 16px;
  display: grid;
  gap: 12px;
  max-height: 360px;
  overflow: auto;
}

.bulk-modal__summary {
  margin: 0;
  color: #334155;
}

.bulk-modal__table {
  width: 100%;
  border-collapse: collapse;
}

.bulk-modal__table th,
.bulk-modal__table td {
  padding: 8px 10px;
  border-bottom: 1px solid #e5edf7;
  text-align: left;
  vertical-align: top;
}

.bulk-modal__title-cell {
  min-width: 320px;
  max-width: 560px;
  white-space: normal;
  word-break: break-word;
}

.bulk-modal__section h4 {
  margin: 0 0 6px;
}

.bulk-modal__section ul {
  margin: 0;
  padding-left: 16px;
}

.bulk-modal__close {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.bulk-modal__error-title {
  margin: 0 0 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: #b91c1c;
}

.bulk-modal__error-code {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: #64748b;
  font-family: ui-monospace, monospace;
}

.bulk-modal__error-message {
  margin: 0;
  color: #334155;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
