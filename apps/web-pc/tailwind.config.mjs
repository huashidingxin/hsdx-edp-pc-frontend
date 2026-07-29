// export { default } from '@vben/tailwind-config';
import preset from '@vben/tailwind-config'; // 引入 Vben 的预设配置

export default {
  presets: [preset], // 关键：保留 Vben 的基础配置
  theme: {
    extend: {
      gridTemplateColumns: {
        '15': 'repeat(15, minmax(0, 1fr))',
        '24': 'repeat(24, minmax(0, 1fr))',
      },
    },
  },
  safelist: [
    'grid-cols-15',
    'grid-cols-24',
  ],
};
