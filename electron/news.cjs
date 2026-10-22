const Parser = require('rss-parser');
const { createHash } = require('node:crypto');

const SOURCES = [
    { id: 'bbc', name: '英国广播公司 · 全球', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', group: 'world' },
    { id: 'bbc-business', name: '英国广播公司 · 商业', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', group: 'finance' },
    { id: 'cnbc', name: '美国消费者新闻与商业频道 · 财经', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', group: 'finance' },
    { id: 'guardian', name: '卫报 · 国际', url: 'https://www.theguardian.com/world/rss', group: 'world' },
    { id: 'guardian-business', name: '卫报 · 商业', url: 'https://www.theguardian.com/business/rss', group: 'finance' },
    { id: 'cnbc-markets', name: '美国消费者新闻与商业频道 · 市场', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', group: 'finance' },
    { id: 'cnbc-economy', name: '美国消费者新闻与商业频道 · 经济', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', group: 'finance' },
    { id: 'cna', name: '亚洲新闻台 · 商业', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936', group: 'finance' },
    { id: 'npr', name: '美国全国公共广播电台 · 商业', url: 'https://feeds.npr.org/1006/rss.xml', group: 'finance' },
    { id: 'dw', name: '德国之声 · 国际', url: 'https://rss.dw.com/rdf/rss-en-world', group: 'world' },
    { id: 'aljazeera', name: '半岛电视台 · 国际', url: 'https://www.aljazeera.com/xml/rss/all.xml', group: 'world' },
    { id: 'rthk-finance', name: '香港电台 · 财经', url: 'https://rthk.hk/rthk/news/rss/c_expressnews_cfinance.xml', group: 'finance' },
    { id: 'rthk-world', name: '香港电台 · 国际', url: 'https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml', group: 'world' },
    { id: 'fed', name: '美联储 · 官方', url: 'https://www.federalreserve.gov/feeds/press_all.xml', group: 'finance' },
    { id: 'un', name: '联合国 · 中文', url: 'https://news.un.org/feed/subscribe/zh/news/all/rss.xml', group: 'world' }
];
const DEFAULT_BOARDS = [
    { id: 'stocks', name: '股票', keywords: 'stock,market,interest rate,inflation,fed,tariff,earnings,economy,oil,bank,trade,gdp,股票,股市,利率,通胀,关税,经济,石油,央行,制裁', preset: 'stocks' }
];
const RULES = [
    { label: '货币政策', weight: 30, words: ['interest rate', 'rate cut', 'rate hike', 'federal reserve', 'central bank', '利率', '降息', '加息', '央行'] },
    { label: '宏观与贸易', weight: 24, words: ['inflation', 'tariff', 'recession', 'gdp', 'sanction', 'trade war', '通胀', '关税', '衰退', '制裁'] },
    { label: '地缘风险', weight: 26, words: ['war', 'missile', 'invasion', 'nuclear', 'strike', 'military', '战争', '导弹', '袭击', '军事', '核'] },
    { label: '市场与企业', weight: 20, words: ['earnings', 'stock', 'stocks', 'shares', 'bankruptcy', 'sell-off', 'crash', 'oil', '财报', '股票', '破产', '暴跌', '石油'] },
    { label: '经济与资产', weight: 22, words: ['economy', 'economic', 'jobs', 'employment', 'bond', 'bonds', 'yield', 'dollar', 'gold', 'currency', 'unemployment', '经济', '經濟', '就业', '就業', '债券', '債券', '黄金', '黃金', '汇率', '匯率', '加息', '減息'] },
    { label: '产业与监管', weight: 20, words: ['semiconductor', 'chip', 'chips', 'artificial intelligence', 'merger', 'acquisition', 'antitrust', 'regulator', 'export', '芯片', '晶片', '人工智能', '并购', '併購', '监管', '監管', '出口', '业绩', '業績'] }
];
function plain(text = '') {
    return String(text).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function safeUrl(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
function keywordMatch(text, word) {
    if (/^[a-z0-9\s-]+$/i.test(word)) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
    }
    return text.includes(word);
}
function scoreArticle(article) {
    const text = `${article.title} ${article.summary} ${article.titleZh || ''} ${article.summaryZh || ''}`.toLowerCase();
    const reasons = RULES.filter(rule => rule.words.some(word => keywordMatch(text, word)));
    const age = Date.now() - Date.parse(article.publishedAt);
    const freshness = age >= 0 && age < 6 * 3600000 ? 12 : age >= 0 && age < 24 * 3600000 ? 6 : 0;
    return { score: Math.min(99, 18 + freshness + reasons.reduce((sum, r) => sum + r.weight, 0)), reasons: reasons.map(r => r.label) };
}
function matchesBoard(article, board) {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    const words = board.keywords.split(/[,，\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);
    return (board.preset === 'stocks' && (article.group === 'finance' || article.reasons?.some(r => ['货币政策', '宏观与贸易', '地缘风险', '经济与资产', '产业与监管'].includes(r)))) || words.some(word => keywordMatch(text, word));
}
function deduplicate(articles) {
    const seen = new Set();
    return articles.filter(a => {
        const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
    });
}
async function fetchSource(source) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'GlobalPulse/1.0 (RSS Reader)', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    if (xml.length > 5_000_000) throw new Error('Feed 超过大小限制');
    const feed = await new Parser().parseString(xml);
    return feed.items.slice(0, 150).map(item => {
        const url = safeUrl(item.link);
        const date = Date.parse(item.isoDate || item.pubDate || '');
        const article = {
            id: createHash('sha256').update(url || `${source.id}:${item.title}`).digest('hex').slice(0, 20),
            title: plain(item.title), summary: plain(item.contentSnippet || item.content || item.description).slice(0, 650),
            url, sourceId: source.id, source: source.name, group: source.group,
            publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
            fetchedAt: new Date().toISOString()
        };
        return { ...article, ...scoreArticle(article) };
    }).filter(a => a.title && a.url);
}
async function collect(previous = [], oldStatuses = []) {
    const results = await Promise.allSettled(SOURCES.map(fetchSource));
    const statuses = SOURCES.map((s, i) => ({
        ...s, ok: results[i].status === 'fulfilled',
        count: results[i].status === 'fulfilled' ? results[i].value.length : 0,
        error: results[i].status === 'rejected' ? '来源连接失败或响应超时，将在下次更新重试' : null,
        checkedAt: new Date().toISOString(),
        lastSuccess: results[i].status === 'fulfilled' ? new Date().toISOString() : oldStatuses.find(x => x.id === s.id)?.lastSuccess || null
    }));
    const fresh = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const cached = new Map(previous.map(a => [a.id, a]));
    const articles = deduplicate([...fresh.map(a => {
        const old = cached.get(a.id);
        return old && old.title === a.title && old.summary === a.summary ? { ...old, ...a, titleZh: old.titleZh, summaryZh: old.summaryZh, translationStatus: old.translationStatus } : a;
    }), ...previous]).filter(a => Date.now() - Date.parse(a.publishedAt || a.fetchedAt) < 7 * 86400000)
        .map(a => ({ ...a, source: SOURCES.find(s => s.id === a.sourceId)?.name || a.source, ...scoreArticle(a) }))
        .sort((a, b) => Date.parse(b.publishedAt || b.fetchedAt) - Date.parse(a.publishedAt || a.fetchedAt)).slice(0, 3000);
    return { articles, statuses };
}
module.exports = { SOURCES, DEFAULT_BOARDS, scoreArticle, matchesBoard, deduplicate, safeUrl, collect };