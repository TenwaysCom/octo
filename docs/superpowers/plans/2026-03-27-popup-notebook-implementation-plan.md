# Popup Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the extension popup as a Vue + ant-design-vue two-page notebook with `主页 | 设置`, replacing the modal settings flow without changing auth or runtime protocols.

**Architecture:** Keep `usePopupApp()` as the single state/action entrypoint, but replace `settingsOpen` with notebook-page state and a settings snapshot lifecycle. `App.vue` becomes a shell that renders a notebook, a `HomePage` for the existing popup content, and a `SettingsPage` for the configuration form.

**Tech Stack:** Vue 3, ant-design-vue, Vitest, Vue Test Utils, WXT popup bundle

---

## File Structure

All file paths below are relative to the repository root.

### Create

- `extension/src/popup/components/PopupNotebook.vue`
  - Visible `主页 | 设置` notebook navigation built on ant-design-vue
- `extension/src/popup/components/PopupPage.vue`
  - Shared page container for titles, body spacing, and footer actions
- `extension/src/popup/components/PopupNotebook.test.ts`
  - Unit coverage for notebook labels and page switching events
- `extension/src/popup/pages/HomePage.vue`
  - Notebook home page that wraps the existing supported/unsupported content plus the log panel
- `extension/src/popup/pages/SettingsPage.vue`
  - Notebook settings page built from ant-design-vue form controls
- `extension/src/popup/pages/SettingsPage.test.ts`
  - Unit coverage for the settings form and footer actions
- `extension/src/popup/composables/use-popup-app.test.ts`
  - Unit coverage for notebook state and settings cancel/save behavior

### Modify

- `extension/src/popup/App.vue`
  - Replace modal flow with notebook pages
- `extension/src/popup/App.test.ts`
  - Update top-level popup rendering assertions for notebook pages
- `extension/src/popup/install-ui.ts`
  - Register the additional ant-design-vue components used by the notebook/settings page
- `extension/src/popup/install-ui.test.ts`
  - Lock the new UI component registration
- `extension/src/popup/composables/use-popup-app.ts`
  - Replace `settingsOpen` with notebook page state and settings snapshot helpers
- `extension/src/popup/types.ts`
  - Add the popup notebook page type and any small helper types needed by the new components
- `extension/src/popup/components/PopupShell.vue`
  - Keep the existing header, but let it work cleanly with notebook navigation and page-level actions
- `extension/src/popup/styles.css`
  - Adjust the popup-level frame and shared spacing so the new notebook layout feels intentional

### Delete

- `extension/src/popup/components/SettingsModal.vue`
  - Retire the modal-only settings implementation after `SettingsPage` is wired in

## Task 1: Register the new ant-design-vue controls

**Files:**
- Modify: `extension/src/popup/install-ui.ts`
- Modify: `extension/src/popup/install-ui.test.ts`
- Test: `extension/src/popup/install-ui.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `install-ui.test.ts` with assertions for the components the new popup depends on:

```ts
expect(app.component("ASegmented")).toBeTruthy();
expect(app.component("AForm")).toBeTruthy();
expect(app.component("AInput")).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test -- --run src/popup/install-ui.test.ts`
Expected: FAIL because the new ant-design-vue components are not registered yet

- [ ] **Step 3: Write minimal implementation**

Update `install-ui.ts` to register the smallest set of new UI plugins needed for the notebook/settings flow:

```ts
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
```

Keep the registry focused. Do not register `Modal`, because the whole point of this refactor is to leave the modal path behind.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- --run src/popup/install-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup/install-ui.ts extension/src/popup/install-ui.test.ts
git commit -m "wire the popup notebook ui components"
```

## Task 2: Move popup state from modal mode to notebook mode

**Files:**
- Create: `extension/src/popup/composables/use-popup-app.test.ts`
- Modify: `extension/src/popup/composables/use-popup-app.ts`
- Modify: `extension/src/popup/types.ts`
- Test: `extension/src/popup/composables/use-popup-app.test.ts`

- [ ] **Step 1: Write the failing test**

Create a composable test that locks the new page state and the cancel/save semantics:

```ts
it("switches to settings and restores the saved snapshot on cancel", async () => {
  const popup = usePopupApp();

  await popup.initialize();
  popup.openSettings();
  popup.settingsForm.SERVER_URL = "http://changed.local";

  popup.closeSettings();

  expect(popup.activePage.value).toBe("home");
  expect(popup.settingsForm.SERVER_URL).toBe("http://localhost:3000");
});
```

Also add one test for the save path:

```ts
it("returns to home after save and refreshes auth state", async () => {
  // mock savePopupSettings + refreshAuthStates
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test -- --run src/popup/composables/use-popup-app.test.ts`
Expected: FAIL because `activePage` and settings snapshot behavior do not exist yet

- [ ] **Step 3: Write minimal implementation**

In `types.ts`, add the new notebook page type:

```ts
export type PopupNotebookPage = "home" | "settings";
```

In `use-popup-app.ts`:

- replace `settingsOpen` with `activePage`
- keep a snapshot of the last persisted settings values
- make `openSettings()` switch `activePage` to `"settings"`
- make `closeSettings()` restore the snapshot and switch back to `"home"`
- make `saveSettingsForm()` persist, refresh the snapshot, and switch back to `"home"`

Minimal shape:

```ts
const activePage = ref<PopupNotebookPage>("home");
let settingsSnapshot = createDefaultSettingsForm();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- --run src/popup/composables/use-popup-app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup/composables/use-popup-app.ts extension/src/popup/composables/use-popup-app.test.ts extension/src/popup/types.ts
git commit -m "move popup settings flow into notebook state"
```

## Task 3: Build the reusable notebook and settings page components

**Files:**
- Create: `extension/src/popup/components/PopupNotebook.vue`
- Create: `extension/src/popup/components/PopupPage.vue`
- Create: `extension/src/popup/components/PopupNotebook.test.ts`
- Create: `extension/src/popup/pages/SettingsPage.vue`
- Create: `extension/src/popup/pages/SettingsPage.test.ts`
- Modify: `extension/src/popup/components/PopupShell.vue`
- Test: `extension/src/popup/components/PopupNotebook.test.ts`
- Test: `extension/src/popup/pages/SettingsPage.test.ts`

- [ ] **Step 1: Write the failing tests**

For `PopupNotebook.test.ts`, cover labels and update events:

```ts
it("renders home and settings tabs and emits page changes", async () => {
  const wrapper = mount(PopupNotebook, {
    props: { modelValue: "home" },
  });

  await wrapper.get('[data-test="popup-tab-settings"]').trigger("click");
  expect(wrapper.emitted("update:modelValue")).toEqual([[ "settings" ]]);
});
```

For `SettingsPage.test.ts`, cover the page-level actions:

```ts
it("renders the existing settings fields and emits save/cancel", async () => {
  const wrapper = mount(SettingsPage, {
    props: {
      form: {
        SERVER_URL: "http://localhost:3000",
        MEEGLE_PLUGIN_ID: "MII_PLUGIN",
        meegleUserKey: "7538275242901291040",
        larkUserId: "",
      },
    },
  });

  expect(wrapper.text()).toContain("Server URL");
  expect(wrapper.text()).toContain("MEEGLE Plugin ID");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --dir extension test -- --run src/popup/components/PopupNotebook.test.ts src/popup/pages/SettingsPage.test.ts`
Expected: FAIL because the new components do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement `PopupNotebook.vue` as a thin segmented/tabs wrapper with stable test ids:

```vue
<a-segmented
  :value="modelValue"
  :options="options"
  @change="$emit('update:modelValue', $event)"
/>
```

Implement `PopupPage.vue` as a layout primitive with:

- title/subtitle region
- default slot for page body
- optional footer slot for actions

Implement `SettingsPage.vue` on top of `PopupPage.vue` using:

- `a-form`
- `a-form-item`
- `a-input`
- `a-button`

Keep the field names exactly aligned with `PopupSettingsForm`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir extension test -- --run src/popup/components/PopupNotebook.test.ts src/popup/pages/SettingsPage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup/components/PopupNotebook.vue extension/src/popup/components/PopupPage.vue extension/src/popup/components/PopupNotebook.test.ts extension/src/popup/pages/SettingsPage.vue extension/src/popup/pages/SettingsPage.test.ts extension/src/popup/components/PopupShell.vue
git commit -m "build the popup notebook and settings page"
```

## Task 4: Rewire `App.vue` around notebook pages and retire the modal path

**Files:**
- Create: `extension/src/popup/pages/HomePage.vue`
- Modify: `extension/src/popup/App.vue`
- Modify: `extension/src/popup/App.test.ts`
- Modify: `extension/src/popup/styles.css`
- Delete: `extension/src/popup/components/SettingsModal.vue`
- Test: `extension/src/popup/App.test.ts`

- [ ] **Step 1: Write the failing test**

Update `App.test.ts` so the top-level popup is described in notebook terms rather than modal terms:

```ts
it("renders the home page by default and switches to settings via the shell action", async () => {
  const wrapper = mountApp();

  await flushPromises();
  expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(false);

  await wrapper.get('[data-test="popup-shell-settings"]').trigger("click");

  expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(true);
  expect(wrapper.find('[data-test="settings-modal"]').exists()).toBe(false);
});
```

Also keep one assertion that the existing supported-page content still renders inside the home page:

```ts
expect(wrapper.get('[data-test="home-page"]').text()).toContain("分析当前页面");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir extension test -- --run src/popup/App.test.ts`
Expected: FAIL because `App.vue` still renders the modal path and has no notebook pages

- [ ] **Step 3: Write minimal implementation**

Create `HomePage.vue` to host:

- the current supported/unsupported view switch
- the existing `LogPanel`

Then rework `App.vue` so it renders:

```vue
<PopupShell :subtitle="headerSubtitle" @settings="openSettings">
  <PopupNotebook v-model="activePage" />
  <HomePage v-if="activePage === 'home'" ... />
  <SettingsPage v-else ... />
</PopupShell>
```

Use the existing `LarkPageView`, `MeeglePageView`, and `UnsupportedPageView` inside `HomePage.vue` so the current page-aware content survives the refactor.

Delete `SettingsModal.vue` once nothing imports it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir extension test -- --run src/popup/App.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/popup/App.vue extension/src/popup/App.test.ts extension/src/popup/pages/HomePage.vue extension/src/popup/styles.css extension/src/popup/components/SettingsModal.vue
git commit -m "rebuild the popup around notebook pages"
```

## Task 5: Run the focused popup regression pass

**Files:**
- Verify only: `extension/src/popup/**/*`

- [ ] **Step 1: Run the focused popup tests**

Run:

```bash
pnpm --dir extension test -- --run \
  src/popup/install-ui.test.ts \
  src/popup/composables/use-popup-app.test.ts \
  src/popup/components/PopupNotebook.test.ts \
  src/popup/pages/SettingsPage.test.ts \
  src/popup/App.test.ts
```

Expected: PASS

- [ ] **Step 2: Run the full extension test suite**

Run: `pnpm --dir extension test`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `pnpm --dir extension build`
Expected: PASS with a fresh popup bundle and no modal-related import failures

- [ ] **Step 4: Manual sanity check**

Run: `pnpm --dir extension dev`

Verify in the browser:

- popup opens on `主页`
- right-top `设置` switches to the settings page
- settings `取消 / 保存` behave correctly
- supported-page content still appears in `主页`

- [ ] **Step 5: Commit**

```bash
git add extension
git commit -m "polish and verify the popup notebook refactor"
```
