import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("desktopRuntime", {
  getInfo() {
    return {
      shell: "electron",
      platform: process.platform,
      versions: {
        chrome: process.versions.chrome,
        electron: process.versions.electron,
        node: process.versions.node,
      },
    };
  },
});
