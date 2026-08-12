<script lang="ts" setup>
import type { Recordable } from '@vben/types';

import { ref } from 'vue';
import Resource from "#/api/resource";

defineOptions({ name: 'ForgetPassword' });

const loading = ref(false);
const valid = ref(false);
const form = ref();
const $toast = inject('$toast');
const router = useRouter()

const phone = ref('');
const code = ref('');
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

// 手机号验证规则
const phoneRules = [
  (v: string) => !!v || '请输入手机号',
  (v: string) => /^1[3-9]\d{9}$/.test(v) || '请输入正确的手机号',
];

// 验证码验证规则
const codeRules = [
  (v: string) => !!v || '请输入验证码',
  (v: string) => /^\d{4,6}$/.test(v) || '验证码格式错误',
];

// 密码验证规则
const passwordRules = [
  (v: string) => !!v || '请输入新密码',
  (v: string) => v.length >= 8 || '密码至少6位',
];

// 确认密码验证规则
const confirmPasswordRules = [
  (v: string) => !!v || '请再次输入新密码',
  (v: string) => v === password.value || '两次输入的密码不一致',
];

// 判断手机号是否有效
function isPhoneValid() {
  return /^1[3-9]\d{9}$/.test(phone.value);
}

// 发送验证码
async function sendCode() {
  if (!isPhoneValid()) return;

  try {
    const api = new Resource('/sms')
    const {data} = await api.store({mobile:phone.value,scene:'PASSWORD_RESET'})
    countdown.value = 60;
    countdownTimer = setInterval(() => {
      countdown.value--;
      if (countdown.value <= 0) {
        clearInterval(countdownTimer!);
        countdownTimer = null;
      }
    }, 1000);
  }catch (e) {
    console.log(e)
  }

}

// 提交表单
async function handleSubmit() {
  const { valid: isValid } = await form.value?.validate();
  if (!isValid) return;

  loading.value = true;

  try {
    const value: Recordable<any> = {
      mobile: phone.value,
      code: code.value,
      password: password.value,
    };
    const api = new Resource('auth/password-reset')
    const {data} = await api.store(value)
    $toast.success('密码重置成功')
    router.push('/auth/login')
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-container class="fill-height">
    <v-card flat class="w-full">
      <!-- 标题 -->
      <v-card-title class="text-center pt-8 pb-4">
        <h1 class="text-h4 font-weight-bold">忘记密码</h1>
        <p class="text-body-2 text-medium-emphasis mt-2">请输入手机号重置密码</p>
      </v-card-title>

      <v-card-text>
        <v-form ref="form" v-model="valid" @submit.prevent="handleSubmit">
          <!-- 手机号 -->
          <v-text-field
            v-model="phone"
            :rules="phoneRules"
            label="手机号"
            placeholder="请输入手机号"
            prepend-inner-icon="mdi-cellphone"
            variant="outlined"
            class="mb-3"
            autocomplete="off"
          />

          <!-- 验证码 -->
          <v-text-field
            v-model="code"
            :rules="codeRules"
            label="验证码"
            placeholder="请输入验证码"
            prepend-inner-icon="mdi-shield-key"
            variant="outlined"
            class="mb-3"
            autocomplete="off"
          >
            <template #append-inner>
              <v-btn
                :disabled="countdown > 0 || !isPhoneValid()"
                color="primary"
                size="small"
                variant="text"
                @click="sendCode"
              >
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </v-btn>
            </template>
          </v-text-field>

          <!-- 新密码 -->
          <v-text-field
            v-model="password"
            :rules="passwordRules"
            label="新密码"
            placeholder="请输入新密码"
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            class="mb-3"
            autocomplete="off"
            @click:append-inner="showPassword = !showPassword"
          />

          <!-- 确认密码 -->
          <v-text-field
            v-model="confirmPassword"
            :rules="confirmPasswordRules"
            label="确认密码"
            placeholder="请再次输入新密码"
            prepend-inner-icon="mdi-lock-check"
            :append-inner-icon="showConfirmPassword ? 'mdi-eye' : 'mdi-eye-off'"
            :type="showConfirmPassword ? 'text' : 'password'"
            variant="outlined"
            class="mb-4"
            autocomplete="off"
            @click:append-inner="showConfirmPassword = !showConfirmPassword"
          />

          <!-- 提交按钮 -->
          <v-btn
            :loading="loading"
            :disabled="!valid"
            color="primary"
            size="large"
            type="submit"
            block
            variant="elevated"
          >
            重置密码
          </v-btn>
        </v-form>

        <!-- 返回登录 -->
        <div class="text-center mt-6">
          <router-link to="/auth/login" class="text-decoration-none text-primary">
            <v-icon start>mdi-arrow-left</v-icon>
            返回登录
          </router-link>
        </div>
      </v-card-text>
    </v-card>
  </v-container>
</template>
