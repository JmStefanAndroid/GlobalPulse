const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreArticle, matchesBoard, deduplicate, safeUrl, DEFAULT_BOARDS, SOURCES } = require('../electron/news.cjs');
const { translateText, translateArticle } = require('../electron/translate.cjs');
test('利率和通胀新闻获得重点评分并提供依据', () => {
    const result = scoreArticle({ title: 'Federal Reserve signals interest rate cut as inflation falls', summary: '', publishedAt: new Date().toISOString() });
    assert.ok(result.score >= 70);
    assert.ok(result.reasons.includes('货币政策'));
});
test('非重要消息不满足默认阈值', () => {
    assert.ok(scoreArticle({ title: 'A new park opens today', summary: '', publishedAt: new Date().toISOString() }).score < 40);
});
test('英文关键词按单词边界匹配，不把 warning 或 scared 当成 war', () => {
    const result = scoreArticle({ title: 'Housing warning: woman scared of heating costs', summary: '', publishedAt: new Date().toISOString() });
    assert.ok(!result.reasons.includes('地缘风险'));
    assert.equal(matchesBoard({ title: 'Chairman explains email', summary: '' }, { keywords: 'AI' }), false);
});
test('自定义板块匹配中英文关键词', () => {
    assert.equal(matchesBoard({ title: 'Military exercise', summary: '' }, { keywords: '军事,military' }), true);
    assert.equal(matchesBoard({ title: '天气预报', summary: '' }, { keywords: '军事,military' }), false);
    assert.equal(matchesBoard({ title: '市场观察', summary: '', group: 'finance' }, DEFAULT_BOARDS[0]), true);
});
test('重复标题去重，禁止不安全外链', () => {
    assert.equal(deduplicate([{ title: 'Breaking: news!' }, { title: 'Breaking news' }]).length, 1);
    assert.equal(safeUrl('javascript:alert(1)'), '');
    assert.equal(safeUrl('file:///etc/passwd'), '');
    assert.equal(safeUrl('https://www.bbc.com/news'), 'https://www.bbc.com/news');
});
test('独立出版方不止一家', () => {
    assert.ok(new Set(SOURCES.map(s => new URL(s.url).hostname)).size >= 4);
});

test('翻译成功：发送标题摘要并合并中文分段', async () => {
    const requests = [];
    const fetcher = async (url, options) => {
        assert.equal(url.origin, 'https://translate.googleapis.com');
        assert.equal(url.searchParams.get('tl'), 'zh-CN');
        assert.equal(url.searchParams.get('sl'), 'auto');
        assert.ok(options.signal instanceof AbortSignal);
        const text = url.searchParams.get('q');
        requests.push(text);
        return { ok: true, json: async () => [text === 'Market news' ? [['市场'], ['消息']] : [['经济增长']]] };
    };
    const result = await translateArticle({ title: 'Market news', summary: 'Economic growth', settings: { interval: 60 }, readIds: ['private-id'] }, fetcher);
    assert.deepEqual(requests, ['Market news', 'Economic growth']);
    assert.deepEqual(result, { titleZh: '市场消息', summaryZh: '经济增长', translationStatus: 'done' });
});

test('翻译失败：拒绝请求错误、异常响应和非中文结果', async t => {
    const cases = [
        ['网络失败', async () => { throw new Error('模拟断网'); }, /模拟断网/],
        ['接口限流', async () => ({ ok: false, status: 429 }), /中文翻译服务暂不可用/],
        ['格式异常', async () => ({ ok: true, json: async () => ({}) }), /翻译服务返回格式异常/],
        ['译文为空', async () => ({ ok: true, json: async () => [[['']]] }), /未能生成中文译文/],
        ['仍为英文', async () => ({ ok: true, json: async () => [[['Market news']]] }), /未能生成中文译文/]
    ];
    for (const [name, fetcher, message] of cases) {
        await t.test(name, async () => {
            await assert.rejects(translateText('Market news', fetcher), message);
            await assert.rejects(translateArticle({ title: 'Market news', summary: '' }, fetcher), message);
        });
    }
});

test('完整译文缓存直接复用，不发起请求', async () => {
    let calls = 0;
    const fetcher = async () => { calls++; throw new Error('不应访问网络'); };
    const result = await translateArticle({ title: 'Market news', summary: 'Economic growth', titleZh: '市场消息', summaryZh: '经济增长' }, fetcher);
    assert.equal(calls, 0);
    assert.deepEqual(result, { titleZh: '市场消息', summaryZh: '经济增长', translationStatus: 'done' });
    assert.equal(await translateText('', fetcher), '');
    assert.equal(calls, 0);
});

test('部分译文缓存只请求缺失字段，失败后可重试并复用结果', async () => {
    const article = { title: 'Market news', summary: 'Economic growth', titleZh: '市场消息', translationStatus: 'failed' };
    const requests = [];
    const fetcher = async url => {
        requests.push(url.searchParams.get('q'));
        return { ok: true, json: async () => [[['经济增长']]] };
    };
    const result = await translateArticle(article, fetcher);
    assert.deepEqual(requests, ['Economic growth']);
    assert.deepEqual(result, { titleZh: '市场消息', summaryZh: '经济增长', translationStatus: 'done' });
    assert.deepEqual(await translateArticle({ ...article, ...result }, fetcher), result);
    assert.deepEqual(requests, ['Economic growth']);
});