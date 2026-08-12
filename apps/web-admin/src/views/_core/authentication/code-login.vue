<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, ref } from 'vue';

import { AuthenticationCodeLogin, z } from '@vben/common-ui';
import { $t } from '@vben/locales';
import Resource from "@/api/resource";
import {useAuthStore} from "@/store";

defineOptions({ name: 'CodeLogin' });

const $toast = inject('$toast')
const formRef = ref(null)
const authStore = useAuthStore();
const loading = ref(false);
const CODE_LENGTH = 4;
const handleSendCode = async  ()=>{
  try{
    const api = new Resource('verifications')
    const values = await formRef.value?.getFormApi().getValues()
    const {data} = await api.store({
      mobile: values.phoneNumber,
      scene: 'MOBILE_CODE_LOGIN'
    })
    if(data.code){
      $toast.success(data.code+'')
    }else{
      $toast.success('验证码发送成功')
    }
  }catch(e) {
    console.log(e)
  }
}
const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.mobile'),
      },
      fieldName: 'phoneNumber',
      label: $t('authentication.mobile'),
      rules: z
        .string()
        .min(1, { message: $t('authentication.mobileTip') })
        .refine((v) => /^\d{11}$/.test(v), {
          message: $t('authentication.mobileErrortip'),
        }),
    },
    {
      component: 'VbenPinInput',
      componentProps: {
        codeLength: CODE_LENGTH,
        createText: (countdown: number) => {
          const text =
            countdown > 0
              ? $t('authentication.sendText', [countdown])
              : $t('authentication.sendCode');
          return text;
        },
        handleSendCode:handleSendCode,
        placeholder: $t('authentication.code'),
      },
      fieldName: 'code',
      label: $t('authentication.code'),
      rules: z.string().length(CODE_LENGTH, {
        message: $t('authentication.codeTip', [CODE_LENGTH]),
      }),
    },
  ];
});
/**
 * 异步处理登录操作
 * Asynchronously handle the login process
 * @param values 登录表单数据
 */
async function handleLogin(values: Recordable<any>) {
  // eslint-disable-next-line no-console
  try{
    // const api = new Resource('auth/login')
    // const {data} = await api.store({
    //   type:2,
    //   mobile:values.phoneNumber,
    //   code:values.code
    // })

    await authStore.authLogin({
      type: 2,
      mobile: values.phoneNumber,
      code: values.code
    })
  }catch(e) {
    console.log(e)
  }
}
</script>

<template>
  <AuthenticationCodeLogin
    ref="formRef"
    :form-schema="formSchema"
    :loading="loading"
    @submit="handleLogin"
  />
</template>
