<template>
  <PopupPage
    title="个人"
    subtitle="当前用户身份信息及授权状态。"
    data-test="profile-page"
  >
    <AuthStatusCard
      title="授权状态"
      :meegle-status="meegleStatus"
      :lark-status="larkStatus"
      :meegle-button-text="topMeegleButtonText"
      :lark-button-text="topLarkButtonText"
      :meegle-button-disabled="topMeegleButtonDisabled"
      :lark-button-disabled="topLarkButtonDisabled"
      @authorize-meegle="$emit('authorizeMeegle')"
      @authorize-lark="$emit('authorizeLark')"
    />
    <div class="profile-page__divider" />
    <div v-if="identity.larkAvatar" class="profile-page__avatar">
      <img :src="identity.larkAvatar" alt="Lark Avatar" />
    </div>
    <div class="profile-page__form">
      <label class="profile-page__field">
        <span class="profile-page__label">Master User ID</span>
        <input class="profile-page__input" :value="identity.masterUserId || '-'" readonly />
      </label>
      <label class="profile-page__field">
        <span class="profile-page__label">Lark User Name</span>
        <input class="profile-page__input" :value="identity.larkName || '-'" readonly />
      </label>
      <label class="profile-page__field">
        <span class="profile-page__label">Lark User ID</span>
        <input class="profile-page__input" :value="identity.larkId || '-'" readonly />
      </label>
      <label class="profile-page__field">
        <span class="profile-page__label">Lark Email</span>
        <input class="profile-page__input" :value="identity.larkEmail || '-'" readonly />
      </label>
      <label class="profile-page__field">
        <span class="profile-page__label">Meegle User Key</span>
        <input class="profile-page__input" :value="identity.meegleUserKey || '-'" readonly />
      </label>
    </div>
    <LogPanel :entries="logs" @clear="$emit('clearLogs')" @export="$emit('exportLogs')" />
  </PopupPage>
</template>

<script setup lang="ts">
import type { PopupStatusChip, PopupLogEntry } from "../types.js";
import PopupPage from "../components/PopupPage.vue";
import AuthStatusCard from "../components/AuthStatusCard.vue";
import LogPanel from "../components/LogPanel.vue";

defineProps<{
  identity: {
    masterUserId: string | null;
    larkId: string | null;
    larkEmail: string | null;
    larkName: string | null;
    larkAvatar: string | null;
    meegleUserKey: string | null;
  };
  meegleStatus: PopupStatusChip;
  larkStatus: PopupStatusChip;
  topMeegleButtonText: string;
  topLarkButtonText: string;
  topMeegleButtonDisabled: boolean;
  topLarkButtonDisabled: boolean;
  logs: PopupLogEntry[];
}>();

defineEmits<{
  authorizeMeegle: [];
  authorizeLark: [];
  clearLogs: [];
  exportLogs: [];
}>();
</script>

<style scoped>
.profile-page__form {
  display: grid;
  gap: 12px;
}

.profile-page__avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.profile-page__avatar img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
}

.profile-page__divider {
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgb(148 163 184 / 32%) 18%, rgb(148 163 184 / 32%) 82%, transparent 100%);
}

.profile-page__field {
  display: grid;
  gap: 6px;
}

.profile-page__label {
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.profile-page__input {
  width: 100%;
  min-height: 38px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #f8fafc;
  color: #475569;
  font: inherit;
  padding: 9px 12px;
}
</style>
