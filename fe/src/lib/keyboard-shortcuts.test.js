import assert from "node:assert/strict";
import test from "node:test";
import { KEYBOARD_SHORTCUTS, isEditableShortcutTarget, shouldHandleKeyboardShortcut } from "./keyboard-shortcuts.js";

test("recognizes a slash shortcut outside editable elements", () => {
  assert.equal(shouldHandleKeyboardShortcut({ key: "/", target: { tagName: "BUTTON" } }, "/"), true);
});

test("does not capture shortcuts while the user is editing text or using a modified key", () => {
  assert.equal(isEditableShortcutTarget({ tagName: "INPUT" }), true);
  assert.equal(isEditableShortcutTarget({ isContentEditable: true }), true);
  assert.equal(shouldHandleKeyboardShortcut({ key: "/", target: { tagName: "TEXTAREA" } }, "/"), false);
  assert.equal(shouldHandleKeyboardShortcut({ key: "/", ctrlKey: true, target: { tagName: "DIV" } }, "/"), false);
});

test("allows an explicit escape action to run from an editable element", () => {
  assert.equal(shouldHandleKeyboardShortcut(
    { key: "Escape", target: { tagName: "INPUT" } },
    "Escape",
    { allowInEditableTarget: true },
  ), true);
});

test("handles Space for a focused PR but leaves text editing alone", () => {
  assert.equal(shouldHandleKeyboardShortcut({ key: " ", target: { tagName: "TR" } }, " "), true);
  assert.equal(shouldHandleKeyboardShortcut({ key: " ", target: { tagName: "TEXTAREA" } }, " "), false);
});

test("documents the Meegle g shortcut", () => {
  assert.deepEqual(KEYBOARD_SHORTCUTS.find(({ key }) => key === "g")?.pages, ["Meegle"]);
});
