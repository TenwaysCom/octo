import type { App as VueApp } from "vue";
import {
  App as AntApp,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Form,
  Input,
  Segmented,
  Tag,
} from "ant-design-vue";

const popupUiPlugins = [
  AntApp,
  Button,
  Card,
  ConfigProvider,
  Empty,
  Form,
  Input,
  Segmented,
  Tag,
] as const;

export function installPopupUi(app: VueApp) {
  for (const plugin of popupUiPlugins) {
    app.use(plugin);
  }

  return app;
}
