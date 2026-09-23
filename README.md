# Organoid Atlas · 类器官文献图谱

一个部署到 GitHub Pages 的静态文献库。GitHub Actions 在每周二和周五北京时间 09:00（UTC 01:00）查询 Europe PMC，收录近八年的类器官、器官芯片相关论文。原始研究、综述和预印本分别展示，新增条目默认「待审核」。

## 部署

1. 新建公开 GitHub 仓库，将本目录文件上传到仓库根目录，默认分支设为 `main`。
2. 在 **Settings → Pages → Build and deployment** 中把 Source 设为 **GitHub Actions**。
3. 在 **Actions → Update literature and deploy site → Run workflow** 手动运行一次，执行首次八年回溯。以后每周二和周五定时运行。GitHub 计划任务有可能延迟，具体时间以运行记录为准。
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

中文翻译和研究要点目前由人工审核后写入；自动生成需要另行确定所用的 AI 服务、费用和密钥配置。没有生成内容时页面只显示原文摘要，不伪造翻译或要点。

## 本地运行

```bash
python3 -m http.server 8000 --directory docs
```

访问 `http://localhost:8000`。首次完整回溯：`python3 scripts/update.py`。需要能够连接 `www.ebi.ac.uk`。文献来源：[Europe PMC Articles REST API](https://dev.europepmc.org/RestfulWebService)。
