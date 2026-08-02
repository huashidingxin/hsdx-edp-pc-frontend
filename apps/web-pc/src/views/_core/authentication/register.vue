<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, h, ref } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationRegister, z} from '@vben/common-ui';
import { $t } from '@vben/locales';
import Resource from '#/api/resource';
import {message} from 'antdv-next'

defineOptions({ name: 'Register' });

const loading = ref(false);
const router = useRouter();
const CODE_LENGTH = 4;
const regRef = ref<InstanceType<typeof AuthenticationRegister> | null>(null);

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: $t('authentication.mobileTip'),
        maxlength: 11,
      },
      fieldName: 'mobile',
      label: $t('authentication.mobile'),
      rules: z
        .string()
        .min(1, { message: $t('authentication.mobileTip') })
        .regex(/^1[3-9]\d{9}$/, { message: $t('authentication.mobileErrortip') }),
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
        placeholder: $t('authentication.code'),
        handleSendCode: getSmsCode,
      },
      fieldName: 'code',
      label: $t('authentication.code'),
      rules: z.string().length(CODE_LENGTH, {
        message: $t('authentication.codeTip', [CODE_LENGTH]),
      }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.password'),
      },
      fieldName: 'password',
      label: $t('authentication.password'),
      renderComponentContent() {
        return {
          strengthText: () => $t('authentication.passwordStrength'),
        };
      },
      rules: z.string().min(1, { message: $t('authentication.passwordTip') }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.confirmPassword'),
      },
      dependencies: {
        rules(values) {
          const { password } = values;
          return z
            .string({ required_error: $t('authentication.passwordTip') })
            .min(1, { message: $t('authentication.passwordTip') })
            .refine((value) => value === password, {
              message: $t('authentication.confirmPasswordTip'),
            });
        },
        triggerFields: ['password'],
      },
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
    },
    {
      component: 'VbenCheckbox',
      fieldName: 'agreePolicy',
      renderComponentContent: () => ({
        default: () =>
          h('span', [
            $t('authentication.agree'),
            h(
              'a',
              {
                class: 'vben-link ml-1 ',
                href: '',
              },
              `${$t('authentication.privacyPolicy')} & ${$t('authentication.terms')}`,
            ),
          ]),
      }),
      rules: z.boolean().refine((value) => !!value, {
        message: $t('authentication.agreeTip'),
      }),
    },
  ];
});


// 获取短信验证码
async function getSmsCode() {
  const formApi = regRef.value?.getFormApi();
  if (!formApi) return false;
  const { mobile } = await formApi.getValues()
  // 验证手机号
  if (!mobile || !/^1[3-9]\d{9}$/.test(mobile)) {
    console.error('手机号格式错误');
    message.error('手机号格式错误')
    return false;
  }

  try {
    const api = new Resource('sms');
    await api.store({
      mobile,
      scene: 'REGISTER', // 注册场景
    });
    console.log('验证码已发送');
  } catch (e: any) {
    console.error(e.message || '验证码发送失败');
    throw e; // 抛出错误，让 VbenPinInput 知道发送失败
  }
}

// 提交注册
async function handleSubmit(value: Recordable<any>) {
  try {
    loading.value = true;
    const api = new Resource('auth/register');
    await api.store(value);
    console.log('注册成功');
    // 注册成功跳转登录
    router.replace('/auth/login');
  } catch (e: any) {
    console.error(e.message || '注册失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthenticationRegister ref="regRef" :form-schema="formSchema" :loading="loading" @submit="handleSubmit" />
</template>
