<script lang="ts" setup>
import type { NotificationItem } from '@vben/layouts';

import { computed, ref, watch } from 'vue';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { VBEN_DOC_URL, VBEN_GITHUB_URL } from '@vben/constants';
import { useWatermark } from '@vben/hooks';
import { BookOpenText, CircleHelp, MdiGithub } from '@vben/icons';
import {
  BasicLayout,
  LockScreen,
  Notification,
  UserDropdown,
} from '@vben/layouts';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

import AppProject from '#/components/AppProject.vue'
import {useAppStore} from '#/store'
import Resource from "#/api/resource";

const appStore = useAppStore();

const notifications = ref<NotificationItem[]>([
  {
    avatar: 'https://avatar.vercel.sh/vercel.svg?text=VB',
    date: '3小时前',
    isRead: true,
    message: '描述信息描述信息描述信息',
    title: '收到了 14 份新周报',
  },
  {
    avatar: 'https://avatar.vercel.sh/1',
    date: '刚刚',
    isRead: false,
    message: '描述信息描述信息描述信息',
    title: '朱偏右 回复了你',
  },
  {
    avatar: 'https://avatar.vercel.sh/1',
    date: '2024-01-01',
    isRead: false,
    message: '描述信息描述信息描述信息',
    title: '曲丽丽 评论了你',
  },
  {
    avatar: 'https://avatar.vercel.sh/satori',
    date: '1天前',
    isRead: false,
    message: '描述信息描述信息描述信息',
    title: '代办提醒',
  },
]);

const userStore = useUserStore();
const authStore = useAuthStore();
const accessStore = useAccessStore();

const { destroyWatermark, updateWatermark } = useWatermark();
const showDot = computed(() =>
  notifications.value.some((item) => !item.isRead),
);

const menus = computed(() => [
  {
    handler: () => {
      projectDialog.value = true
    },
    // icon: 'mdi-briefcase-outline',
    text: appStore.defaultProject?.name || '全部项目',
  },
  {
    handler: () => {
      passwordDialog.value = true;
    },
    icon: 'mdi-lock-outline',
    text: '修改密码',
  },
]);

const passwordDialog = ref(false);
const passwordForm = ref();
const passwordLoading = ref(false);
const passwordData = ref({
  old_password: '',
  new_password: '',
  confirm_password: '',
});
const showOldPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);

const passwordRules = [
  (v: string) => !!v || '请输入密码',
  (v: string) => v.length >= 8 || '密码至少8位',
];

const confirmPasswordRules = [
  (v: string) => !!v || '请确认密码',
  (v: string) => v === passwordData.value.new_password || '两次密码不一致',
];

async function handlePasswordSubmit() {
  const { valid } = await passwordForm.value?.validate();
  if (!valid) return;

  passwordLoading.value = true;
  try {
    const api = new Resource('auth/password');
    await api.store(passwordData.value);
    passwordDialog.value = false;
    passwordData.value = {
      old_password: '',
      new_password: '',
      confirm_password: '',
    };
  } finally {
    passwordLoading.value = false;
  }
}

const avatar = computed(() => {
  return userStore.userInfo?.avatar ?? preferences.app.defaultAvatar;
});

async function handleLogout() {
  await authStore.logout(false);
}

function handleNoticeClear() {
  notifications.value = [];
}

function handleMakeAll() {
  notifications.value.forEach((item) => (item.isRead = true));
}
watch(
  () => preferences.app.watermark,
  async (enable) => {
    if (enable) {
      await updateWatermark({
        content: `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
      });
    } else {
      destroyWatermark();
    }
  },
  {
    immediate: true,
  },
);

const projectDialog = ref(false)
</script>

<template>
  <div>
  <BasicLayout @clear-preferences-and-logout="handleLogout">
    <template #notification>
<!--      <Notification-->
<!--        :dot="showDot"-->
<!--        :notifications="notifications"-->
<!--        @clear="handleNoticeClear"-->
<!--        @make-all="handleMakeAll"-->
<!--        @read="handleRead"-->
<!--      />-->
    </template>
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.name"
        :description="appStore.defaultProject.role?.display_name"
        @logout="handleLogout"
      />
    </template>
    <template #extra>
      <AuthenticationLoginExpiredModal
        v-model:open="accessStore.loginExpired"
        :avatar
      >
        <LoginForm />
      </AuthenticationLoginExpiredModal>


    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
    <app-project v-model="projectDialog"></app-project>

    <!-- 修改密码弹窗 -->
    <v-dialog v-model="passwordDialog" max-width="450">
      <v-card>
        <v-card-title class="text-h5 pa-4 pb-2">修改密码</v-card-title>
        <v-card-text class="pa-4 pt-2">
          <v-form ref="passwordForm" @submit.prevent="handlePasswordSubmit">
            <v-text-field
              v-model="passwordData.old_password"
              :rules="passwordRules"
              label="原密码"
              placeholder="请输入原密码"
              prepend-inner-icon="mdi-lock"
              :append-inner-icon="showOldPassword ? 'mdi-eye' : 'mdi-eye-off'"
              :type="showOldPassword ? 'text' : 'password'"
              variant="outlined"
              class="mb-3"
              @click:append-inner="showOldPassword = !showOldPassword"
            />
            <v-text-field
              v-model="passwordData.new_password"
              :rules="passwordRules"
              label="新密码"
              placeholder="请输入新密码"
              prepend-inner-icon="mdi-lock-plus"
              :append-inner-icon="showNewPassword ? 'mdi-eye' : 'mdi-eye-off'"
              :type="showNewPassword ? 'text' : 'password'"
              variant="outlined"
              class="mb-3"
              @click:append-inner="showNewPassword = !showNewPassword"
            />
            <v-text-field
              v-model="passwordData.confirm_password"
              :rules="confirmPasswordRules"
              label="确认密码"
              placeholder="请再次输入新密码"
              prepend-inner-icon="mdi-lock-check"
              :append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
              :type="showConfirmPassword ? 'text' : 'password'"
              variant="outlined"
              class="mb-3"
              @click:append-inner="showConfirmPassword = !showConfirmPassword"
            />
          </v-form>
        </v-card-text>
        <v-card-actions class="pa-4 pt-0">
          <v-spacer />
          <v-btn variant="outlined" @click="passwordDialog = false">取消</v-btn>
          <v-btn color="primary" variant="elevated" :loading="passwordLoading" @click="handlePasswordSubmit">
            确定
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
<style>
[id^="radix-vue-dropdown-menu-content-"]>div>[role="menuitem"]:nth-child(3) {
  position: relative;
  max-width:300px;
  padding-right: 30px!important;
  font-weight:bold;
  color:#1565C0;
  background-color: #E3F2FD;
  //line-height:1.5;

  &::after{
    position: absolute;
    top: 65%;
    right: 0;
    content: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24'%3E%3Cpath fill='%231565C0' d='M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'/%3E%3C/svg%3E");
    transform: translateY(-50%);
  }
}
</style>
