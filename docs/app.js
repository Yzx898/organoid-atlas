const state = { articles: [], section: 'research', search: '', topic: 'all', status: 'all', limit: 20 };
const $ = selector => document.querySelector(selector);
const el = (tag, className, value) => { const node = document.createElement(tag); if (className) node.className = className; if (value != null) node.textContent = value; return node; };
function addText(parent, tag, className, value) { const node = el(tag, className, value); parent.append(node); return node; }
function safeUrl(value) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; } }

function renderCard(article, index) {
  const card = el('article', 'article-card');
  addText(card, 'div', 'article-number', String(index + 1).padStart(2, '0'));
  const main = el('div', 'article-main');
  const title = addText(main, 'h3');
  const link = addText(title, 'a', '', article.titleZh || article.title || '未提供题目');
  link.href = safeUrl(article.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
  if (article.titleZh) addText(main, 'p', 'english-title', article.title);
  const meta = el('div', 'article-meta');
  [article.journal || '期刊待核实', article.date || '日期待核实', article.authors || '作者待核实'].forEach(item => addText(meta, 'span', '', item));
  main.append(meta);
  if (article.abstractZh) { const p = addText(main, 'p', 'abstract'); addText(p, 'strong', '', '中文摘要 · '); p.append(document.createTextNode(article.abstractZh)); }
  if (article.abstract) { const p = addText(main, 'p', 'abstract'); addText(p, 'strong', '', 'Original abstract · '); p.append(document.createTextNode(article.abstract)); }
  if (article.takeaways?.length) { const ul = el('ul', 'takeaways'); article.takeaways.forEach(point => addText(ul, 'li', '', point)); main.append(ul); }
  const tags = el('div', 'tags'); (article.tags || []).forEach(tag => addText(tags, 'span', 'tag' + (tag === '器官芯片' ? ' chip' : ''), tag)); main.append(tags);
  card.append(main);
  const side = el('div', 'article-side');
  addText(side, 'span', article.reviewed ? 'state checked' : 'state', article.reviewed ? '✓ 已审核' : '◷ 待审核');
  const source = addText(side, 'a', '', '查看原文 ↗'); source.href = safeUrl(article.url); source.target = '_blank'; source.rel = 'noopener noreferrer';
  card.append(side); return card;
}

function render() {
  const q = state.search.trim().toLocaleLowerCase();
  const filtered = state.articles.filter(a => a.section === state.section && !a.hidden && (state.topic === 'all' || (a.tags || []).includes(state.topic)) && (state.status === 'all' || Boolean(a.reviewed) === (state.status === 'reviewed')) && (!q || [a.title, a.titleZh, a.authors, a.journal, a.abstract, a.abstractZh].some(v => (v || '').toLocaleLowerCase().includes(q))));
  $('#resultCount').textContent = `符合条件：${filtered.length} 篇`;
  const container = $('#articles'); container.replaceChildren();
  if (!filtered.length) addText(container, 'p', 'empty', state.articles.length ? '没有符合条件的文献，请调整筛选条件。' : '暂未收录文献，请在 GitHub Actions 首次运行“Update literature and deploy site”。');
  else container.append(...filtered.slice(0, state.limit).map(renderCard));
  $('#more').hidden = filtered.length <= state.limit;
}

async function init() {
  try {
    const response = await fetch('data/articles.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.articles = (data.articles || []).sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    $('#updatedAt').textContent = data.updatedAt || '等待首次检索';
    $('#totalCount').textContent = state.articles.filter(a => !a.hidden).length;
    $('#researchCount').textContent = state.articles.filter(a => !a.hidden && a.section === 'research').length;
    ['research','review','preprint'].forEach((s,i) => { document.querySelectorAll('.filter span')[i].textContent = state.articles.filter(a => !a.hidden && a.section === s).length; });
    render();
  } catch (error) { $('#articles').replaceChildren(addText(document.createDocumentFragment(), 'p', 'empty', '文献数据暂时无法载入，请稍后重试。')); $('#resultCount').textContent = '数据载入失败'; console.error(error); }
}
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.filter').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); }); state.section = button.dataset.section; state.limit = 20; render(); }));
$('#search').addEventListener('input', e => { state.search = e.target.value; state.limit = 20; render(); });
$('#topic').addEventListener('change', e => { state.topic = e.target.value; state.limit = 20; render(); });
$('#status').addEventListener('change', e => { state.status = e.target.value; state.limit = 20; render(); });
$('#more').addEventListener('click', () => { state.limit += 20; render(); });
init();
