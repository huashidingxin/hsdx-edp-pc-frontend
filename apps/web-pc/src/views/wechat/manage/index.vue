<script setup lang="ts">
/**
 * 公众号独立运营管理工作台（应用类型=公众号）。
 *
 * 与「图文同步」（把官网内容搬到微信）不同，这里直接管理公众号这一侧的资产：
 * 账号连接、自定义菜单、永久素材、草稿箱、已发布内容、粉丝用户、用户标签。
 * 这些都不是「内容投影」，而是微信侧的真实状态，操作会直接落到微信服务器。
 *
 * 入口挂在「应用中心」的应用卡片上（hidden=1），只有公众号类型应用可见。
 */
import { computed, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Tabs } from 'antdv-next';

import AccountPanel from './_components/AccountPanel.vue';
import AssetList from './_components/AssetList.vue';
import MenuEditor from './_components/MenuEditor.vue';
import TagList from './_components/TagList.vue';
import UserList from './_components/UserList.vue';

const props = defineProps({
  /** 嵌入应用卡片抽屉时由宿主指定应用 */
  appId: { type: [Number, String], default: null },
});

// 权限：发布删除走 cms.wechat.publish，其余写操作 cms.wechat.write。
// 页面级菜单权限已做第一道拦截；这里只控制按钮显隐。
let hasAccessByCodes: (codes: string[]) => boolean = () => true;
try {
  const access = useAccess();
  if (access.hasAccessByCodes) hasAccessByCodes = access.hasAccessByCodes;
} catch {
  // 不在权限上下文中时默认允许
}
const canWrite = computed(() => hasAccessByCodes(['cms.wechat.write']));
const canPublish = computed(() => hasAccessByCodes(['cms.wechat.publish']));

// 兼容应用卡片抽屉内可能传入的应用上下文（当前应用由 store 提供，接口自动带 X-Application-Id）。
void props.appId;

const activeTab = ref('account');
</script>

<template>
  <div class="wechat-manage p-4">
    <Tabs v-model:activeKey="activeTab" size="small" class="wechat-manage__tabs">
      <Tabs.TabPane key="account" tab="账号与连接">
        <AccountPanel :can-write="canWrite" />
      </Tabs.TabPane>
      <Tabs.TabPane key="menu" tab="自定义菜单">
        <MenuEditor :can-write="canWrite" />
      </Tabs.TabPane>
      <Tabs.TabPane key="material" tab="永久素材">
        <AssetList kind="material" :can-write="canWrite" />
      </Tabs.TabPane>
      <Tabs.TabPane key="draft" tab="草稿箱">
        <AssetList kind="draft" :can-write="canWrite" />
      </Tabs.TabPane>
      <Tabs.TabPane key="published" tab="已发布">
        <AssetList kind="published" :can-write="canPublish" />
      </Tabs.TabPane>
      <Tabs.TabPane key="user" tab="粉丝管理">
        <UserList :can-write="canWrite" />
      </Tabs.TabPane>
      <Tabs.TabPane key="tag" tab="用户标签">
        <TagList :can-write="canWrite" />
      </Tabs.TabPane>
    </Tabs>
  </div>
</template>

<style scoped>
.wechat-manage__tabs :deep(.ant-tabs-nav) {
  margin-bottom: 12px;
}
</style>
