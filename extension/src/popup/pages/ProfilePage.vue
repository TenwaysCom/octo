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
    <a-divider style="margin: 12px 0" />
    <div v-if="identity.larkAvatar" class="profile-page__avatar">
      <img :src="identity.larkAvatar" alt="Lark Avatar" />
    </div>
    <a-form layout="vertical" class="profile-page__form">
      <a-form-item label="Master User ID">
        <a-input :value="identity.masterUserId || '-'" readonly />
      </a-form-item>
      <a-form-item label="Lark User Name">
        <a-input :value="identity.larkName || '-'" readonly />
      </a-form-item>
      <a-form-item label="Lark User ID">
        <a-input :value="identity.larkId || '-'" readonly />
      </a-form-item>
      <a-form-item label="Lark Email">
        <a-input :value="identity.larkEmail || '-'" readonly />
      </a-form-item>
      <a-form-item label="Meegle User Key">
        <a-input :value="identity.meegleUserKey || '-'" readonly />
      </a-form-item>
    </a-form>
    <LogPanel :entries="logs" @clear="$emit('clearLogs')" />
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
}>();
</script>

<style scoped>
.profile-page__form {
  display: grid;
  gap: 4px;
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
</style>
