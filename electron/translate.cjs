// 仅向翻译服务发送公共新闻标题和摘要，不发送设置或已读记录。
async function translateText(text, fetcher = fetch) {
    if (!text) return '';
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    for (const [key, value] of Object.entries({ client: 'gtx', sl: 'auto', tl: 'zh-CN', dt: 't', q: text })) url.searchParams.set(key, value);
    const response = await fetcher(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('中文翻译服务暂不可用');
    const result = await response.json();
    if (!Array.isArray(result?.[0])) throw new Error('翻译服务返回格式异常');
    const translated = result[0].map(part => part[0] || '').join('').trim();
    if (!translated || (/[a-z]{3}/i.test(text) && !/[\u3400-\u9fff]/u.test(translated))) throw new Error('未能生成中文译文');
    return translated;
}
async function translateArticle(article, fetcher = fetch) {
    const [titleZh, summaryZh] = await Promise.all([
        article.titleZh || translateText(article.title, fetcher),
        article.summaryZh || translateText(article.summary, fetcher)
    ]);
    return { titleZh, summaryZh, translationStatus: 'done' };
}
function chineseArticle(article) {
    return {
        title: article.titleZh || '正在翻译这条消息…',
        summary: article.translationStatus === 'failed' ? '中文翻译暂不可用，稍后自动重试。' : article.summaryZh || (article.summary ? '摘要正在翻译，请稍候。' : '来源未提供摘要。')
    };
}
module.exports = { translateText, translateArticle, chineseArticle };