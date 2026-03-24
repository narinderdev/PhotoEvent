type DesktopRuntimeInfo = {
  shell: "electron";
  platform: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
};

declare global {
  interface Window {
    desktopRuntime?: {
      getInfo: () => DesktopRuntimeInfo;
    };
  }
}

export {};
