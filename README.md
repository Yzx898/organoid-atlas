# Organoid Atlas · 类器官文献图谱

一个部署到 GitHub Pages 的静态文献库。GitHub Actions 在每周二和周五北京时间 09:00（UTC 01:00）查询 Europe PMC，收录近八年的类器官、器官芯片相关论文。原始研究、综述和预印本分别展示，新增条目默认「待审核」。首页提供最新发表、重点期刊、病原体、药物筛选和 AI 赋能入口。

## 部署

1. 新建公开 GitHub 仓库，将本目录文件上传到仓库根目录，默认分支设为 `main`。
2. 在 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。
3. 在 **Actions → Update literature and deploy site → Run workflow** 手动运行一次，执行完整八年回溯。以后每周二和周五自动检索最近 60 天以覆盖数据库收录延迟，无需手动寻找或上传文献。再次手动运行会重新核查整个八年范围。GitHub 计划任务有可能延迟，具体时间以运行记录为准。
4. 每次手动修改网站文件或 `reviews.json` 并推送 `main`，页面会自动重新部署。文献数据在 `docs/data/articles.json`，首次回溯前它为空。

## 人工审核

打开 `docs/data/articles.json` 找到条目的 `key`（优先使用 `doi:...`，无 DOI 时使用 `pmid:...`）。在 `reviews.json` 增加覆盖项，例如：

```json
{
  "doi:10.1234/example": {
    "titleZh": "核对后的中文标题",
    "abstractZh": "人工核对的中文摘要速读",
    "takeaways": ["研究要点一", "研究要点二"],
    "tags": ["类器官", "器官芯片"],
    "reviewed": true
  }
}
```

`reviewed` 设为 `true` 时标为「已审核」。误收录文献可以加 `"hidden": true`。直接编辑 `articles.json` 的人工修改可能被下一次自动检索覆盖；长期修订请放在 `reviews.json`。

中文翻译草稿由独立的 `Translate literature drafts` 工作流每天北京时间 10:17 在标准 GitHub Actions 运行器上生成。该工作流下载 Apache 2.0 授权的 [Helsinki-NLP/opus-mt-en-zh](https://huggingface.co/Helsinki-NLP/opus-mt-en-zh) 开源模型，不使用付费翻译 API 或密钥。一次最多处理 80 篇或运行 45 分钟，后续每天继续补齐历史记录；新收录记录优先。译文存入 `docs/data/translations.json`，不改动英文元数据，页面仍标为「待审核」。没有摘要的论文只翻译标题，不生成研究要点。

「研究要点」是从原始英文摘要中选出的最多 3 句的译文，不是额外推断的新结论。医学术语和结论需要人工核对。`reviews.json` 中的人工修订优先于机器译文。

## 管理专题与期刊

直接编辑 `docs/config.json` 即可调整 `coreTerms` 检索词、各专题 `keywords` 与 `categories`、`journalWhitelist` 重点期刊名单。前端标签和专题匹配从题目、摘要、关键词文本自动计算。新增核心词后，可以在 GitHub Actions 手动运行一次完整八年回溯；日常增量无需手动操作。

重点期刊仅根据配置名单筛选，**不等同于实际 JIF≥8 或 JCR Q1**。JIF 和 JCR 数据通常需要授权，本站不编造这些指标。若管理员有合法授权的指标，可在 `journalMetrics` 按期刊填写 `jif`、`year`、`quartile` 和 `source`，页面才显示其来源和年份。

文献 `onlineDate` 使用 Europe PMC 的首次发表日期；作者单位、通讯作者在来源不能可靠提供时留空。原文 DOI 和可用的 Europe PMC 开放全文链接在卡片展示。

## 本地运行

```bash
python3 -m http.server 8000 --directory docs
```

访问 `http://localhost:8000`。首次完整回溯：`python3 scripts/update.py`。需要能够连接 `www.ebi.ac.uk`。文献来源：[Europe PMC Articles REST API](https://dev.europepmc.org/RestfulWebService)。
