import type { App as VueApp } from "vue";
import {
  App as AntApp,
  ConfigProvider,
} from "ant-design-vue";

const popupUiPlugins = [
  AntApp,
  ConfigProvider,
] as const;

export function installPopupUi(app: VueApp) {
  for (const plugin of popupUiPlugins) {
    app.use(plugin);
  }

  return app;
}
