declare module '#/store/app' {
  export const useAppStore: () => {
    loadSetting: () => Promise<void>;
    setting: Record<string, unknown>;
  };
}

declare module '#/store/socket' {
  export const useSocketStore: () => {
    connect: (options?: Record<string, unknown>) => void;
    disconnect: () => void;
    isConnected: boolean;
    subscribe: (channel: string, options?: Record<string, unknown>) => void;
  };

  export function registerMessageHandler(
    type: string,
    handler: (message: unknown) => void,
  ): void;
}

declare module '#/utils/file.js' {
  export function base64ToFile(
    base64String: string,
    filename?: string,
    mimetype?: string,
  ): File;
  export function blobUrlToFile(
    blobUrl: string,
    filename?: string,
    mimeType?: string,
  ): Promise<File | null>;
  export function calculateFileHash(file: Blob): Promise<string>;
  export function createObjectURL(file: Blob): string;
  export function formatSize(size: number): string | undefined;
  export function getInfo(
    url: string,
  ): Promise<null | { size: number; type: null | string }>;
  export function isBase64(value: string): boolean;
  export function videoUrlToBlobUrl(videoUrl: string): Promise<null | string>;
}

declare module '#/components/AppField.vue' {
  const component: import('vue').DefineComponent;
  export default component;
}

declare module '#/views/dashboard/index.vue' {
  const component: import('vue').DefineComponent;
  export default component;
}

declare module 'vue-cropper/dist/vue-cropper.es.js' {
  export const VueCropper: import('vue').DefineComponent;
}
