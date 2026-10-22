const { collect } = require('../electron/news.cjs');
collect().then(result => {
    console.table(result.statuses.map(s => ({ source: s.name, online: s.ok, count: s.count, error: s.error || '' })));
    console.log(`去重后 ${result.articles.length} 条；重要消息 ${result.articles.filter(a => a.score >= 40).length} 条`);
    if (!result.statuses.some(s => s.ok)) process.exitCode = 1;
}).catch(error => { console.error(error); process.exitCode = 1; });