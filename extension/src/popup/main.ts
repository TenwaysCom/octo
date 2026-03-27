import { createApp } from "vue";
import "ant-design-vue/dist/reset.css";
import "./styles.css";
import App from "./App.vue";
import { installPopupUi } from "./install-ui.js";

const app = createApp(App);

installPopupUi(app);
app.mount("#app");
