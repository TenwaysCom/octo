#!/usr/bin/env node
/**
 * Meegle Summary & PM Analysis API 手工验收测试脚本
 *
 * 用法：
 *   cd server && node scripts/test-summary-api.js
 *
 * 需要配置下面的 TEST_CONFIG，或设置环境变量：
 *   - SERVER_BASE_URL
 *   - TEST_PROJECT_KEY
 *   - TEST_WORKITEM_TYPE    (story | production_bug)
 *   - TEST_WORKITEM_ID
 *   - TEST_MASTER_USER_ID
 *   - TEST_MEEGLE_BASE_URL
 *   - TEST_SUMMARY_FIELD_KEY
 */

const TEST_CONFIG = {
  serverBaseUrl: process.env.SERVER_BASE_URL || "http://localhost:3000",
  projectKey: process.env.TEST_PROJECT_KEY || "PROJ1",
  workItemTypeKey: process.env.TEST_WORKITEM_TYPE || "story",
  workItemId: process.env.TEST_WORKITEM_ID || "12345",
  masterUserId: process.env.TEST_MASTER_USER_ID || "",
  meegleBaseUrl: process.env.TEST_MEEGLE_BASE_URL || "https://project.larksuite.com",
  larkBaseUrl: process.env.TEST_LARK_BASE_URL || "https://open.larksuite.com",
  summaryFieldKey: process.env.TEST_SUMMARY_FIELD_KEY || "description",
};

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(title, detail = "", color = COLORS.blue) {
  console.log(`${color}${COLORS.bright}[${title}]${COLORS.reset} ${detail}`);
}

function logJson(label, obj) {
  console.log(`${COLORS.cyan}${label}:${COLORS.reset}`);
  console.log(JSON.stringify(obj, null, 2));
  console.log();
}

function logError(msg) {
  console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`);
}

function logSuccess(msg) {
  console.log(`${COLORS.green}✅ ${msg}${COLORS.reset}`);
}

function logWarn(msg) {
  console.log(`${COLORS.yellow}⚠️  ${msg}${COLORS.reset}`);
}

function separator() {
  console.log(`${COLORS.dim}${"=".repeat(70)}${COLORS.reset}\n`);
}

async function post(path, body) {
  const url = `${TEST_CONFIG.serverBaseUrl}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }

  return { status: response.status, data };
}

async function testGenerateSummary() {
  log("TEST 1", "POST /api/meegle/workitem/generate-summary", COLORS.blue);
  separator();

  const body = {
    projectKey: TEST_CONFIG.projectKey,
    workItemTypeKey: TEST_CONFIG.workItemTypeKey,
    workItemId: TEST_CONFIG.workItemId,
    masterUserId: TEST_CONFIG.masterUserId,
    baseUrl: TEST_CONFIG.meegleBaseUrl,
    larkBaseUrl: TEST_CONFIG.larkBaseUrl,
  };

  log("请求参数");
  logJson("body", body);

  const { status, data } = await post("/api/meegle/workitem/generate-summary", body);

  log("HTTP 状态", String(status), status === 200 ? COLORS.green : COLORS.red);
  logJson("响应", data);

  if (!data.ok) {
    logError("generate-summary 返回失败");
    if (data.error?.errorCode === "AUTH_EXPIRED") {
      logWarn("Meegle 认证已过期，需要先在插件中重新授权");
    }
    return null;
  }

  logSuccess("generate-summary 成功");

  if (data.markdown) {
    console.log(`${COLORS.cyan}生成的 Markdown 总结：${COLORS.reset}`);
    console.log(`${COLORS.dim}${"-".repeat(70)}${COLORS.reset}`);
    console.log(data.markdown);
    console.log(`${COLORS.dim}${"-".repeat(70)}${COLORS.reset}\n`);
  }

  if (data.workItemType) {
    log("workItemType", data.workItemType, COLORS.yellow);
  }
  if (data.prefilledSections?.length) {
    log("AI 已预填区块", data.prefilledSections.join(", "), COLORS.green);
  }
  if (data.emptySections?.length) {
    log("需人工填写区块", data.emptySections.join(", "), COLORS.yellow);
  }

  return data.markdown || null;
}

async function testApplySummary(markdown) {
  if (!markdown) {
    logWarn("跳过 apply-summary（缺少 markdown）");
    return;
  }

  log("TEST 2", "POST /api/meegle/workitem/apply-summary", COLORS.blue);
  separator();

  const body = {
    projectKey: TEST_CONFIG.projectKey,
    workItemTypeKey: TEST_CONFIG.workItemTypeKey,
    workItemId: TEST_CONFIG.workItemId,
    masterUserId: TEST_CONFIG.masterUserId,
    baseUrl: TEST_CONFIG.meegleBaseUrl,
    summaryFieldKey: TEST_CONFIG.summaryFieldKey,
    summaryMarkdown: markdown,
  };

  log("请求参数");
  logJson("body", { ...body, summaryMarkdown: markdown.slice(0, 80) + "..." });

  const { status, data } = await post("/api/meegle/workitem/apply-summary", body);

  log("HTTP 状态", String(status), status === 200 ? COLORS.green : COLORS.red);
  logJson("响应", data);

  if (!data.ok) {
    logError("apply-summary 返回失败");
    if (data.error?.errorCode === "AUTH_EXPIRED") {
      logWarn("Meegle 认证已过期，需要先在插件中重新授权");
    }
    return;
  }

  logSuccess(`apply-summary 成功，已写入字段 ${data.summaryFieldKey}`);
}

async function testPMAnalysisMock() {
  log("TEST 3", "POST /api/pm/analysis/run (Mock 模式，无 masterUserId)", COLORS.blue);
  separator();

  const body = {
    projectKeys: [TEST_CONFIG.projectKey],
    timeWindowDays: 14,
  };

  log("请求参数");
  logJson("body", body);

  const { status, data } = await post("/api/pm/analysis/run", body);

  log("HTTP 状态", String(status), status === 200 ? COLORS.green : COLORS.red);
  logJson("响应", data);

  if (!data.ok) {
    logError("pm-analysis (mock) 返回失败");
    return;
  }

  logSuccess("pm-analysis (mock) 成功");
  log("Summary", data.summary, COLORS.yellow);

  if (data.totals) {
    console.log(`${COLORS.cyan}统计数字：${COLORS.reset}`);
    Object.entries(data.totals).forEach(([key, val]) => {
      console.log(`  ${key}: ${val}`);
    });
    console.log();
  }

  if (data.slaAnalysis) {
    console.log(`${COLORS.cyan}SLA 分析：${COLORS.reset}`);
    console.log(`  总数: ${data.slaAnalysis.total}`);
    console.log(`  达标: ${data.slaAnalysis.met}`);
    console.log(`  超期: ${data.slaAnalysis.breached}`);
    console.log();
  }

  if (data.blockers?.length) {
    log("阻塞项", `${data.blockers.length} 个`, COLORS.red);
    data.blockers.slice(0, 3).forEach((b) => {
      console.log(`  - ${b.id} (${b.projectKey}, ${b.status}, ${b.ageDays}天)`);
    });
    if (data.blockers.length > 3) console.log(`  ... 还有 ${data.blockers.length - 3} 个`);
    console.log();
  }

  if (data.staleItems?.length) {
    log("滞留项", `${data.staleItems.length} 个`, COLORS.yellow);
    data.staleItems.slice(0, 3).forEach((s) => {
      console.log(`  - ${s.id} (${s.projectKey}, ${s.status}, ${s.ageDays}天)`);
    });
    if (data.staleItems.length > 3) console.log(`  ... 还有 ${data.staleItems.length - 3} 个`);
    console.log();
  }
}

async function testPMAnalysisReal() {
  if (!TEST_CONFIG.masterUserId) {
    logWarn("跳过 pm-analysis (真实数据模式)：未配置 masterUserId");
    return;
  }

  log("TEST 4", "POST /api/pm/analysis/run (真实数据模式)", COLORS.blue);
  separator();

  const body = {
    projectKeys: [TEST_CONFIG.projectKey],
    timeWindowDays: 14,
    masterUserId: TEST_CONFIG.masterUserId,
    baseUrl: TEST_CONFIG.meegleBaseUrl,
  };

  log("请求参数");
  logJson("body", body);

  const { status, data } = await post("/api/pm/analysis/run", body);

  log("HTTP 状态", String(status), status === 200 ? COLORS.green : COLORS.red);

  if (status !== 200) {
    logJson("响应", data);
    logError("pm-analysis (real) 请求失败");
    return;
  }

  // 只打印摘要，避免大量 workitem 刷屏
  if (data.ok) {
    logSuccess("pm-analysis (real) 成功");
    log("Summary", data.summary, COLORS.yellow);

    if (data.totals) {
      console.log(`${COLORS.cyan}统计数字：${COLORS.reset}`);
      Object.entries(data.totals).forEach(([key, val]) => {
        console.log(`  ${key}: ${val}`);
      });
      console.log();
    }

    if (data.slaAnalysis?.breachedItems?.length) {
      log("SLA 超期项", `${data.slaAnalysis.breachedItems.length} 个`, COLORS.red);
      data.slaAnalysis.breachedItems.slice(0, 5).forEach((item) => {
        console.log(`  - ${item.id} ${item.name || ""} (${item.projectKey}, 已耗时${item.elapsedHours}h, 目标${item.slaTargetHours}h)`);
      });
      if (data.slaAnalysis.breachedItems.length > 5) {
        console.log(`  ... 还有 ${data.slaAnalysis.breachedItems.length - 5} 个`);
      }
      console.log();
    }

    if (data.blockers?.length) {
      log("阻塞项", `${data.blockers.length} 个`, COLORS.red);
    }
    if (data.staleItems?.length) {
      log("滞留项", `${data.staleItems.length} 个`, COLORS.yellow);
    }
  } else {
    logJson("响应", data);
    logError("pm-analysis (real) 返回业务错误");
  }
}

async function main() {
  console.log(`
${COLORS.bright}${COLORS.blue}╔══════════════════════════════════════════════════════════════════════╗
║     Meegle Summary & PM Analysis API 手工验收测试脚本               ║
╚══════════════════════════════════════════════════════════════════════╝${COLORS.reset}
`);

  console.log(`${COLORS.dim}当前配置：${COLORS.reset}`);
  console.log(`  Server URL: ${TEST_CONFIG.serverBaseUrl}`);
  console.log(`  Project:    ${TEST_CONFIG.projectKey}`);
  console.log(`  Workitem:   ${TEST_CONFIG.workItemTypeKey} #${TEST_CONFIG.workItemId}`);
  console.log(`  Meegle:     ${TEST_CONFIG.meegleBaseUrl}`);
  console.log(`  User ID:    ${TEST_CONFIG.masterUserId || "(未设置，真实模式将跳过)"}`);
  console.log(`  Summary FK: ${TEST_CONFIG.summaryFieldKey}`);
  console.log();

  if (!TEST_CONFIG.masterUserId) {
    logWarn("masterUserId 未设置，真实数据模式测试将被跳过");
    console.log(`${COLORS.dim}提示：设置环境变量 TEST_MASTER_USER_ID=xxx 或修改脚本中的 TEST_CONFIG${COLORS.reset}\n`);
  }

  try {
    // Test 1: generate-summary
    const markdown = await testGenerateSummary();
    separator();

    // Test 2: apply-summary（可选，用 Test 1 生成的 markdown）
    await testApplySummary(markdown);
    separator();

    // Test 3: pm-analysis mock mode
    await testPMAnalysisMock();
    separator();

    // Test 4: pm-analysis real mode
    await testPMAnalysisReal();
    separator();

    logSuccess("所有测试执行完毕");
  } catch (err) {
    logError(`脚本执行异常: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
