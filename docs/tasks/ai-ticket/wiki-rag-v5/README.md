# Wiki RAG v5 隔离实验结果

首轮实验完成。**字段接通和本问题族知识整理均有召回收益；本候选方案暂不直接上线。** 原命中没有掉出 Top20，但新增跨问题候选、同词匹配后的原文消费仍有缺口。真实模型重排、最终回答和线上效果未测。

需求、授权与后续状态以[任务记录](../2026-10-21-wiki-rag-vendor-bill-diagnosis.md)为准。

## 四组结果

| 固定样本 | A 当前代码＋K0 | B 字段接通＋K0 | C 当前代码＋K1 | D 字段接通＋K1 |
| --- | ---: | ---: | ---: | ---: |
| 旧回归：44条有预期页 | 35/44（79.5%） | 41/44（93.2%） | 35/44（79.5%） | 41/44（93.2%） |
| 本问题族开发问法：5条 | 3/5 | 3/5 | 5/5 | 5/5 |
| 独立真实查询：6条有历史参考 | 6/6 | 6/6 | 6/6 | 6/6 |
| 旧回归预期页覆盖（含一题多页） | 36/45 | 42/45 | 36/45 | 42/45 |

共65条问题：48条旧回归（44正例、4边界题）、5条开发问法、12条独立真实查询（6正例、6无已核对当前方案的边界题）。同一票的5种问法不算5个独立事件；独立正例仅6条且基线已全中，不能据此宣称泛化提升。边界题可以有历史资料，候选非空不是误答。

主指标 Hit@20 是至少一篇已核对预期文章进入真实 reader 前20；没有使用旧 unranked 工具的 term_groups 扩词。这些是冻结输入下的本地结果，不能当作线上命中率。旧题仅有问题文本，keywords／objects／environments为空；独立题复用历史真实提取输出并经过同一脱敏。四组每题输入完全相同。

B−A：旧回归增加6条命中（+13.6个百分点），开发集和独立正例未新增。C−A：开发集增加2条；旧回归和独立正例不变。D−B：开发集增加2条；D−C：旧回归增加6条。D−A没有旧命中掉出Top20。

## 本问题族的变化

| 问法 | A排名 | B排名 | C排名 | D排名 | D组模拟选中正确文章后的消费 |
| --- | ---: | ---: | ---: | ---: | --- |
| confirm vendor bill | 2 | 2 | 2 | 1 | 有知识正文和1份原文 |
| 供应商账单确认失败 | 未入20 | 未入20 | 1 | 1 | 保留历史参考，但知识正文与选中原文均为空 |
| Bill过账失败 | 未入20 | 未入20 | 1 | 1 | 有知识正文和1份原文 |
| Expected singleton: stock.move() | 1 | 1 | 1 | 1 | 有知识正文和1份原文 |
| _tw_purchase_original_currency_unit_price | 1 | 1 | 1 | 1 | 有知识正文和1份原文 |

**只有接通字段，不会自动产生中英文业务叫法。** K1在标题／首段补清业务问题，并增加真实开发问法、错误及函数作为 search_terms；故旧 reader 也能找回两个中文问题。组合方案进一步改善英文业务问法排名。

“供应商账单确认失败”在本轮没有模型扩词：文章已通过正文业务词命中，但原文主要为英文报错，既有原文选段没有找到这些中文词；按原有来源限定，知识正文也变为空。这是**召回通过、原文消费失败**，不是新的重排低分结论。没有绕过来源检查，也没有往查询注入预期文章的错误签名。真实 Ticket 含堆栈或模型扩词时的效果需另测。

## 回归、噪声及未通过项

旧回归新增命中：Q02、Q07、Q24、Q25、Q27、Q28；剩余漏检：Q01（Survey权限）、Q06（折扣未应用）、V01（付款条件再次审批），三条均原本未命中。既有命中没有掉出Top20。

5条预期页排名下降但仍在20内：Q09 1→2、Q12 2→3、Q17 16→17、Q18 3→5、N03 1→2。原因是其他页面增加元数据匹配后分数提高；本轮不改已冻结权重。它们不是Top20丢失，但仍需后续真实重排验证。

10条无预期答案页的边界题中，人工阅读新增候选的内容后确认以下4项属于不同问题；其他未标为预期的页面未自动判错：

| 题目 | D组新增候选／排名 | 判定依据 |
| --- | --- | --- |
| Q31 订单未同步到邮箱 | UK Shopify Salesperson为空／12 | 人员归属默认值不能解释邮件发送或接收 |
| Q32 Lark审批群不显示申请 | Mark Done／Approve历史／20 | Odoo审批生效和Lark群通知是不同链路；search_terms中的but也参与了匹配 |
| Q34 出库单DOA／lost字段需求 | 自动订单邮件语言／7 | 泛order词命中，邮件语言不回答出库原因标记功能 |
| H12 Pre-order默认仓库／数量合计新需求 | Demand／Quantity和余量处理历史／7 | 泛数量／仓库词重叠，旧出退库建议不能证明预订单新功能已交付 |

这4项在**模拟打1分选中**后，现有 service 均能保留为 historical_reference，并取得原文片段；说明来源存在和泛词相似不能完全保证问题意图一致。此探针不代表真实模型会选它们，更不是已测得的错误回答率。[条件过滤探针](noise-filter-probe.json)保留全部结果。

因此“新增误匹配已处理”和“仅中文业务问法可取得有效原文上下文”两项尚未通过。继续方向应先处理宽泛词带来的跨问题匹配、以及业务问法与英文原文的证据关联；另立后续实验，不在本轮偷偷增加停用词、调权重或降低0.7阈值。H12已被本轮观察，若据此调优，应转开发题并另补独立题。

## 实现与隔离边界

- K0包括此前raw、traceback尾500及调查页修复；Wiki和Ontology同时复制冻结。K0、K1全部raw字节一致，Ontology字节一致。
- B／D只在隔离代码中让concept search_terms加入元数据组×3，summary加入正文组×2；同组同一词只计一次，标题×4。Ontology规则不变。
- 元数据独有命中时返回完整首段、摘要及限制；限制超预算则返回空，摘要不是原始证据。正文原有预算拒绝不会被新回退绕过。
- K1只改一篇Vendor Bill调查文章；37篇已有search_terms逐页核对字段、内容及来源后保持原样。[核对表](existing-search-terms-audit.json)记录哈希和字段。
- 写作维护规范形成[候选补丁](maintenance-skill-candidate.patch)，未安装到共用Skill；无后台任务、全库猜词、新依赖或UI。
- 应用源码、共用知识库、数据库、运行阈值与部署均未修改。本轮代码及知识改动以[代码补丁](code-candidate.patch)、[知识补丁](knowledge-candidate.patch)供审阅，未应用到工作区业务源码。

## 验证与首轮记录

| 验证 | 结果 | 实际范围 |
| --- | --- | --- |
| 单元与mock集成 | 163项，5文件通过 | 隔离快照中的reader、wiki-evidence、Wiki QA service、Ticket Wiki入口、Shadow消费 |
| 静态构建 | 通过 | 隔离candidate server的TypeScript build |
| 四组真实reader | 260次检索完成 | 65题×4组，不调用网络或模型；实际selectEvidence及service条件消费 |
| 首轮保护 | 通过 | 首轮与复核分别保存；输入和预期未改；两轮全部候选顺序及预期页排名完全一致 |
| 真实模型重排Top5、回答 | 未测 | 所有分数1仅用于条件mock，不代表模型分数或答案正确率 |
| live E2E、部署运行验证 | 未执行 | 没有部署／重启／数据库写入或历史任务重算 |

首轮后静态复查新增测试，发现“适用范围与待确认”章节未被新元数据回退保留。修正完整范围／限制保留及K1摘要的YAML引号后复核；没有参考独立逐题结果补词或调权。两轮排名相同，34份候选摘录哈希变化，修正记录见[静态修正](static-corrections.md)。

旧48条的预期文章及来源存在，当前摘要／边界已核对；部分文章已链接同票较新的raw版本，映射见[gold核对](gold-audit.json)。冻结的旧来源路径仍存在，不更换查询或预期。Q24的业务短语Order confirmation被现有redactSupportText转换为[REFERENCE]，该冻结脱敏输入对四组相同；本轮没有修改脱敏规则，结果不等同旧工具未脱敏全文搜索。

## 复跑与证据

快照保留在 `/tmp/octo-wiki-rag-v5`：baseline／candidate代码、K0／K1知识，以及首轮candidate-first代码。它们是本机临时实验资料，未将原始知识或平台日志打包进任务文档；若临时目录被清除，需恢复哈希一致的快照才能重跑，不能用届时新库冒充旧基线。

在仓库根目录运行（输出名须为新文件名）：

```bash
LOG_LEVEL=silent node --import ./server/node_modules/tsx/dist/loader.mjs server/examples/wiki-retrieval-eval/replay.mts /tmp/octo-wiki-rag-v5 docs/tasks/ai-ticket/wiki-rag-v5 rerun-new.json
python3 server/examples/wiki-retrieval-eval/summarize.py docs/tasks/ai-ticket/wiki-rag-v5
pnpm --dir /tmp/octo-wiki-rag-v5/candidate/server exec vitest run src/adapters/filesystem/wiki-knowledge-reader.test.ts src/domain/wiki-evidence.test.ts src/application/services/wiki-qa.service.test.ts src/application/services/lark-ticket-wiki-qa.test.ts src/application/services/lark-ticket-shadow-summary.service.test.ts
pnpm --dir /tmp/octo-wiki-rag-v5/candidate/server build
```

回放先校验输入、源码和知识清单，结束后再校验；不匹配直接拒绝。[逐题排名CSV](ranks.csv)、[变化清单](changes.json)、[冻结样本](cases.json)、[基线哈希](freeze.json)、[候选哈希](candidate-freeze.json)、[验证记录](verification.json)可直接审阅。首轮和复核完整结果分别压缩保存为 `first-run.json.gz`、`verification-run.json.gz`，保留所有候选的字段命中、知识／原文长度、限制、条件mock消费结果及未测阶段。
