#!/usr/bin/env node
/**
 * Extension build validator
 * Checks for common Chrome extension packaging issues
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";

const distDir = "./dist";
let hasErrors = false;
let hasWarnings = false;

function error(msg) {
  console.error(`❌ ${msg}`);
  hasErrors = true;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
  hasWarnings = true;
}

function success(msg) {
  console.log(`✓ ${msg}`);
}

function checkFile(filepath) {
  const full = join(distDir, filepath);
  if (!existsSync(full)) {
    error(`Missing file: ${filepath}`);
    return false;
  }
  return true;
}

function checkManifest() {
  console.log("\n[1] Checking manifest.json...");

  const manifestPath = join(distDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    error("manifest.json not found in dist/");
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    success("manifest.json is valid JSON");
  } catch (e) {
    error(`manifest.json parse error: ${e.message}`);
    return null;
  }

  // Required fields
  const required = ["manifest_version", "name", "version"];
  for (const field of required) {
    if (!manifest[field]) {
      error(`manifest.json missing required field: ${field}`);
    } else {
      success(`${field}: ${manifest[field]}`);
    }
  }

  // Check manifest_version
  if (manifest.manifest_version !== 3) {
    warn(`manifest_version should be 3 (current: ${manifest.manifest_version})`);
  }

  // Check background service worker
  if (manifest.background?.service_worker) {
    checkFile(manifest.background.service_worker);
    success(`service_worker: ${manifest.background.service_worker}`);
  }

  // Check popup
  if (manifest.action?.default_popup) {
    checkFile(manifest.action.default_popup);
    success(`popup: ${manifest.action.default_popup}`);
  }

  // Check content scripts
  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) {
      checkFile(js);
      success(`content_script: ${js}`);
    }
    if (!cs.matches || cs.matches.length === 0) {
      error(`content_script missing "matches" pattern`);
    }
  }

  // Check web accessible resources
  for (const war of manifest.web_accessible_resources || []) {
    for (const res of war.resources || []) {
      if (res.includes("*")) continue;
      checkFile(res);
    }
  }

  // Check permissions
  const dangerousPerms = ["<all_urls>", "debugger"];
  for (const perm of manifest.permissions || []) {
    if (dangerousPerms.includes(perm)) {
      warn(`Permission "${perm}" may trigger extra review`);
    }
  }

  return manifest;
}

function checkJsImports() {
  console.log("\n[2] Checking ES module imports...");

  const jsFiles = [];
  function collectJs(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collectJs(full);
      } else if (entry.name.endsWith(".js")) {
        jsFiles.push(full);
      }
    }
  }
  collectJs(distDir);

  const importPattern = /from\s+["'](\.[^"']+)(["'];)/g;
  let importErrors = 0;

  for (const file of jsFiles) {
    const content = readFileSync(file, "utf-8");
    const relPath = relative(distDir, file);
    let match;

    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      if (!importPath.endsWith(".js") && !importPath.endsWith(".mjs")) {
        error(`${relPath}: Import "${importPath}" missing .js extension`);
        importErrors++;
      }
    }
  }

  if (importErrors === 0) {
    success("All imports have proper extensions");
  }
}

function checkChromeApiUsage(manifest) {
  console.log("\n[3] Checking Chrome API usage...");

  const jsFiles = [];
  function collectJs(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collectJs(full);
      } else if (entry.name.endsWith(".js")) {
        jsFiles.push(full);
      }
    }
  }
  collectJs(distDir);

  const permissions = new Set(manifest?.permissions || []);
  const contentScriptFiles = new Set(
    (manifest?.content_scripts || []).flatMap(cs => cs.js || [])
  );

  // APIs that require specific permissions
  const apiPerms = {
    "chrome.tabs": ["tabs"],
    "chrome.storage": ["storage"],
    "chrome.scripting": ["scripting"],
    "chrome.webRequest": ["webRequest"],
    "chrome.cookies": ["cookies"],
    "chrome.history": ["history"],
    "chrome.bookmarks": ["bookmarks"],
    "chrome.notifications": ["notifications"],
    "chrome.alarms": ["alarms"],
  };

  // APIs not available in content scripts
  const backgroundOnlyApis = [
    "chrome.tabs.query",
    "chrome.tabs.create",
    "chrome.tabs.sendMessage",
    "chrome.scripting",
    "chrome.storage.local", // sync is ok, local needs background
  ];

  for (const file of jsFiles) {
    const content = readFileSync(file, "utf-8");
    const relPath = relative(distDir, file);
    const isContentScript = contentScriptFiles.has(relPath);

    // Check for background-only APIs in content scripts
    if (isContentScript) {
      for (const api of backgroundOnlyApis) {
        if (content.includes(api)) {
          warn(`${relPath}: Content script uses background-only API "${api}"`);
        }
      }
    }

    // Check for APIs requiring permissions
    for (const [api, requiredPerms] of Object.entries(apiPerms)) {
      if (content.includes(api)) {
        for (const perm of requiredPerms) {
          if (!permissions.has(perm)) {
            error(`${relPath}: Uses "${api}" but missing permission "${perm}"`);
          }
        }
      }
    }
  }

  if (!hasErrors && !hasWarnings) {
    success("API usage looks correct");
  }
}

function checkRequiredFiles() {
  console.log("\n[4] Checking required files...");

  const required = ["manifest.json"];
  for (const f of required) {
    checkFile(f);
  }

  // Check popup if action exists
  const manifestPath = join(distDir, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (manifest.action?.default_popup) {
      checkFile(manifest.action.default_popup);
    }
  }
}

function checkSyntax() {
  console.log("\n[5] Basic syntax check...");

  const jsFiles = [];
  function collectJs(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        collectJs(full);
      } else if (entry.name.endsWith(".js")) {
        jsFiles.push(full);
      }
    }
  }
  collectJs(distDir);

  // Basic checks for common issues
  const issues = [];

  for (const file of jsFiles) {
    const content = readFileSync(file, "utf-8");
    const relPath = relative(distDir, file);

    // Check for obvious syntax errors (simplified)
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      error(`${relPath}: Unbalanced braces ({: ${openBraces}, }: ${closeBraces})`);
    }

    // Check for undeclared chrome usage (should have @types/chrome)
    if (content.includes("chrome.") && !content.includes("import")) {
      // Standalone file using chrome API - OK in extension context
    }
  }

  if (!hasErrors) {
    success("Basic syntax check passed");
  }
}

function main() {
  console.log("Validating extension build...");

  if (!existsSync(distDir)) {
    error("dist/ directory not found. Run 'npm run build' first.");
    process.exit(1);
  }

  const manifest = checkManifest();
  checkJsImports();
  if (manifest) {
    checkChromeApiUsage(manifest);
  }
  checkRequiredFiles();
  checkSyntax();

  console.log("");
  if (hasErrors) {
    console.error("❌ Validation failed!");
    process.exit(1);
  } else if (hasWarnings) {
    console.warn("⚠️  Validation passed with warnings");
    process.exit(0);
  } else {
    console.log("✓ All checks passed!");
  }
}

main();