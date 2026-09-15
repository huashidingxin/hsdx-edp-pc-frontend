<script setup lang="ts">
import type { VbenFormSchema } from '#/adapter/form';

import { computed, onMounted, ref } from 'vue';

import { ProfileBaseSetting } from '@vben/common-ui';

import { message } from 'antdv-next';

import { getUserInfoApi, updateProfileApi } from '#/api';

const profileBaseSettingRef = ref();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      fieldName: 'realName',
      component: 'Input',
      label: '姓名',
    },
    {
      fieldName: 'username',
      component: 'Input',
      label: '用户名',
      componentProps: {
        placeholder: '租户内唯一，可留空',
      },
    },
    {
      fieldName: 'mobile',
      component: 'Input',
      label: '手机号',
      componentProps: {
        placeholder: '租户内唯一，可留空',
      },
    },
    {
      fieldName: 'email',
      component: 'Input',
      label: '邮箱',
      componentProps: {
        disabled: true,
      },
    },
  ];
});

onMounted(async () => {
  const data = await getUserInfoApi();
  const info = data as Record<string, any>;
  profileBaseSettingRef.value
    .getFormApi()
    .setValues({
      email: info.email,
      mobile: info.mobile ?? '',
      realName: info.realName,
      username: info.username ?? '',
    });
});

async function handleSubmit(values: Record<string, any>) {
  try {
    await updateProfileApi({
      mobile: values.mobile || null,
      name: values.realName,
      username: values.username || null,
    });
    message.success('资料已更新');
  } catch {
    // 错误提示由请求拦截器统一处理
  }
}
</script>
<template>
  <ProfileBaseSetting
    ref="profileBaseSettingRef"
    :form-schema="formSchema"
    @submit="handleSubmit"
  />
</template>
