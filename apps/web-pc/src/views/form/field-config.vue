<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

// P3-V06 合并页：表单列表与字段规则已合并到「表单管理」（/forms，component /form/list）。
// 本页保留为旧入口跳转（隐藏菜单 1043 后，旧书签/链接仍可到达合并页并定位到指定表单）。
const route = useRoute();
const router = useRouter();

onMounted(() => {
  const q = route.query.form_id;
  router.replace(q ? { path: '/forms', query: { form_id: q } } : '/forms');
});
</script>

<template>
  <div></div>
</template>
