<script lang="ts" setup>
import type { FormProps } from 'antdv-next';

import { computed, reactive, ref, watch } from 'vue';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useWatermark } from '@vben/hooks';
import { BasicLayout, LockScreen, UserDropdown } from '@vben/layouts';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { Form, FormItem, InputPassword, message, Modal } from 'antdv-next';

import { changePasswordApi } from '#/api';
import AppWorkspaceSelector from '#/components/AppWorkspaceSelector.vue';
import { useAuthStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

const userStore = useUserStore();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const { destroyWatermark, updateWatermark } = useWatermark();

const passwordFormRef = ref();
const passwordModalOpen = ref(false);
const passwordSubmitting = ref(false);
const passwordForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
});

const passwordRules: FormProps['rules'] = {
  old_password: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: async (_rule: unknown, value: string) => {
        if (value !== passwordForm.new_password) {
          return Promise.reject(new Error('两次输入的新密码不一致'));
        }
        return Promise.resolve();
      },
      trigger: 'blur',
    },
  ],
};

const menus = [
  {
    handler: openPasswordModal,
    icon: 'lucide:key-round',
    text: '修改密码',
  },
];

const avatar = computed(() => {
  return userStore.userInfo?.avatar ?? preferences.app.defaultAvatar;
});

const currentRoleName = computed(() => {
  const roles = userStore.userInfo?.roles;
  if (Array.isArray(roles) && roles.length) {
    return roles.map((r: any) => r.display_name || r.name || r).join(', ');
  }
  return userStore.userInfo?.role_name || userStore.userInfo?.role || '';
});

async function handleLogout() {
  await authStore.logout(false);
}

function resetPasswordForm() {
  passwordForm.old_password = '';
  passwordForm.new_password = '';
  passwordForm.confirm_password = '';
  passwordFormRef.value?.clearValidate?.();
}

function openPasswordModal() {
  resetPasswordForm();
  passwordModalOpen.value = true;
}

async function submitPasswordChange() {
  try {
    await passwordFormRef.value?.validate();
  } catch {
    return;
  }

  passwordSubmitting.value = true;
  try {
    await changePasswordApi({ ...passwordForm });
    message.success('密码修改成功，请重新登录');
    passwordModalOpen.value = false;
    await authStore.logout(false);
  } catch (error: any) {
    message.error(error?.message || '密码修改失败');
  } finally {
    passwordSubmitting.value = false;
  }
}

watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
  }),
  async ({ enable, content }) => {
    if (enable) {
      await updateWatermark({
        content:
          content ||
          `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
      });
    } else {
      destroyWatermark();
    }
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <BasicLayout @clear-preferences-and-logout="handleLogout" @logout="handleLogout">
    <template #header-left-1>
      <AppWorkspaceSelector />
    </template>
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.name"
        :description="currentRoleName"
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
      <Modal
        v-model:open="passwordModalOpen"
        title="修改密码"
        :confirm-loading="passwordSubmitting"
        ok-text="确认修改"
        cancel-text="取消"
        @ok="submitPasswordChange"
        @cancel="resetPasswordForm"
      >
        <Form
          ref="passwordFormRef"
          :model="passwordForm"
          :rules="passwordRules"
          layout="vertical"
        >
          <FormItem label="旧密码" name="old_password">
            <InputPassword
              v-model:value="passwordForm.old_password"
              autocomplete="current-password"
              placeholder="请输入旧密码"
            />
          </FormItem>
          <FormItem label="新密码" name="new_password">
            <InputPassword
              v-model:value="passwordForm.new_password"
              autocomplete="new-password"
              placeholder="请输入至少 8 位新密码"
            />
          </FormItem>
          <FormItem label="确认新密码" name="confirm_password">
            <InputPassword
              v-model:value="passwordForm.confirm_password"
              autocomplete="new-password"
              placeholder="请再次输入新密码"
            />
          </FormItem>
        </Form>
      </Modal>
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
</template>
