---
status: draft
owner: TBD
last_reviewed: 2026-05-22
scope: AI task input template for core business logic changes
update_required_when:
  - 调整 AI Coding 输入规范
  - 新增生命周期、运行时行为或 PR 要求
---

# AI Task Template

涉及核心业务逻辑时，任务输入建议包含以下信息。

```text
业务目标：
主对象：
关联对象：
生命周期节点：
触发入口：
涉及 hook：
已有扩展模块：
重复覆盖或交叉覆盖：
super 调用位置：
context flag：
正常流程：
异常流程：
不允许改变的旧行为：
运行时配置或数据库自动化：
第三方模块：
外部集成：
推荐测试：
需要更新的治理文档：
```

如果这些信息不完整，AI 应先从代码和 `docs/ai-dev/` 中补齐可发现部分，再开始修改。
