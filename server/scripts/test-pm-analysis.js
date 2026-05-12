#!/usr/bin/env node
/**
 * PM Analysis API 手工验收测试脚本
 *
 * 用法：
 *   cd server && node scripts/test-pm-analysis.js
 *
 * 环境变量：
 *   - SERVER_BASE_URL      服务端地址，默认 http://localhost:3000
 *   - TEST_PROJECT_KEY     Meegle 项目 key
 *   - TEST_MASTER_USER_ID  用户主身份 ID（真实模式需要）
 *   - TEST_MEEGLE_BASE_URL Meegle 实例地址
 */

const TEST_CONFIG = {
  serverBaseUrl: process.env.SERVER_BASE_URL || "http://localhost:3000",
  projectKey: process.env.TEST_PROJECT_KEY || "PROJ1",
  masterUserId: process.env.TEST_MASTER_USER_ID || "",
  meegleBaseUrl: process.env.TEST_MEEGLE_BASE_URL || "https://project.larksuite.com",
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

function printAnalysisResult(data) {
  if (!data.ok) {
    logJson("响应", data);
    logError("返回业务错误");
    return;
  }

  logSuccess("分析成功");
  separator();

  // Summary
  console.log(`${COLORS.bright}${COLORS.yellow}📊 分析摘要${COLORS.reset}`);
  console.log(`  ${data.summary}`);
  console.log();

  // Totals
  if (data.totals) {
    console.log(`${COLORS.bright}${COLORS.cyan}📈 统计数字${COLORS.reset}`);
    Object.entries(data.totals).forEach(([key, val]) => {
      const label = {
        staleLarkTicketCount: "滞留 Lark Ticket",
        staleMeegleWorkitemCount: "滞留 Meegle Workitem",
        pendingReviewLarkTicketCount: "待评审 Lark Ticket",
        reviewPendingPrCount: "待 Review PR",
        slaBreachedCount: "SLA 超期",
      }[key] || key;
      console.log(`  ${label}: ${val}`);
    });
    console.log();
  }

  // Suggested Actions
  if (data.suggestedActions?.length) {
    console.log(`${COLORS.bright}${COLORS.green}💡 建议行动${COLORS.reset}`);
    data.suggestedActions.forEach((action) => {
      console.log(`  • ${action}`);
    });
    console.log();
  }

  // Blockers
  if (data.blockers?.length) {
    console.log(`${COLORS.bright}${COLORS.red}🚧 阻塞项 (${data.blockers.length})${COLORS.reset}`);
    data.blockers.forEach((b) => {
      console.log(`  - ${b.id} | ${b.projectKey} | ${b.status} | ${b.ageDays}天`);
    });
    console.log();
  }

  // Stale Items
  if (data.staleItems?.length) {
    console.log(`${COLORS.bright}${COLORS.yellow}⏰ 滞留项 (${data.staleItems.length})${COLORS.reset}`);
    data.staleItems.slice(0, 5).forEach((s) => {
      console.log(`  - ${s.id} | ${s.projectKey} | ${s.status} | ${s.ageDays}天`);
    });
    if (data.staleItems.length > 5) {
      console.log(`  ... 还有 ${data.staleItems.length - 5} 个`);
    }
    console.log();
  }

  // SLA Analysis
  if (data.slaAnalysis) {
    console.log(`${COLORS.bright}${COLORS.cyan}⏱️  SLA 分析${COLORS.reset}`);
    console.log(`  总数: ${data.slaAnalysis.total}`);
    console.log(`  达标: ${data.slaAnalysis.met}`);
    console.log(`  超期: ${data.slaAnalysis.breached}`);

    if (data.slaAnalysis.breachedItems?.length) {
      console.log();
      console.log(`  ${COLORS.red}超期详情：${COLORS.reset}`);
      data.slaAnalysis.breachedItems.slice(0, 5).forEach((item) => {
        console.log(
          `    - ${item.id} ${item.name || ""} | ${item.projectKey} | 已耗时${item.elapsedHours}h / 目标${item.slaTargetHours}h`,
        );
      });
      if (data.slaAnalysis.breachedItems.length > 5) {
        console.log(`    ... 还有 ${data.slaAnalysis.breachedItems.length - 5} 个`);
      }
    }
    console.log();
  }

  // Missing Descriptions
  if (data.missingDescriptionItems?.length) {
    console.log(`${COLORS.bright}${COLORS.yellow}📝 描述待补全 (${data.missingDescriptionItems.length})${COLORS.reset}`);
    data.missingDescriptionItems.forEach((item) => {
      console.log(`  - ${item.id} | ${item.projectKey} | ${item.reason}`);
    });
    console.log();
  }
}

async function testMockMode() {
  log("TEST 1", "Mock 模式（不带 masterUserId）", COLORS.blue);
  separator();

  const body = {
    projectKeys: [TEST_CONFIG.projectKey],
    timeWindowDays: 14,
  };

  log("请求参数");
  logJson("body", body);

  const { status, data } = await post("/api/pm/analysis/run", body);

  log("HTTP 状态", String(status), status === 200 ? COLORS.green : COLORS.red);
  console.log();

  if (status === 200) {
    printAnalysisResult(data);
  } else {
    logJson("响应", data);
    logError("HTTP 请求失败");
  }
}

async function testRealMode() {
  if (!TEST_CONFIG.masterUserId) {
    logWarn("跳过真实数据模式：未配置 TEST_MASTER_USER_ID");
    console.log(`${COLORS.dim}提示：export TEST_MASTER_USER_ID=your-user-id 后再运行${COLORS.reset}\n`);
    return;
  }

  log("TEST 2", "真实数据模式（带 masterUserId）", COLORS.blue);
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
  console.log();

  if (status === 200) {
    printAnalysisResult(data);
  } else {
    logJson("响应", data);
    logError("HTTP 请求失败");
  }
}

async function main() {
  console.log(`
${COLORS.bright}${COLORS.blue}╔══════════════════════════════════════════════════════════════════════╗
║           PM Analysis API 手工验收测试脚本                           ║
╚══════════════════════════════════════════════════════════════════════╝${COLORS.reset}
`);

  console.log(`${COLORS.dim}当前配置：${COLORS.reset}`);
  console.log(`  Server URL: ${TEST_CONFIG.serverBaseUrl}`);
  console.log(`  Project:    ${TEST_CONFIG.projectKey}`);
  console.log(`  Meegle:     ${TEST_CONFIG.meegleBaseUrl}`);
  console.log(`  User ID:    ${TEST_CONFIG.masterUserId || "(未设置，真实模式将跳过)"}`);
  console.log();

  try {
    await testMockMode();
    separator();

    await testRealMode();
    separator();

    logSuccess("测试执行完毕");
  } catch (err) {
    logError(`脚本执行异常: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
