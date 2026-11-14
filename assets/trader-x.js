(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const put = (id, value) => { byId(id).textContent = value; };
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
  const money = value => numeric(value) ? usd.format(value) : '資料不足';
  const amount = value => numeric(value) ? number.format(value) : '—';
  const pct = value => numeric(value) ? `${(value * 100).toFixed(2)}%` : '尚無資料';
  const time = value => {
    if (!value) return '尚未執行';
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : `${new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(date)} 台灣`;
  };
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const empty = (id, text) => byId(id).append(element('p', text, 'empty-state'));
  const sideText = value => ({ BUY: '買進', SELL: '賣出', HOLD: '持有', WATCH: '觀察', NO_TRADE: '不交易', NO_ORDER: '不下單', PENDING: '待處理' }[String(value).toUpperCase()] || value || '—');
  const signedClass = value => numeric(value) ? value > 0 ? 'positive' : value < 0 ? 'negative' : '' : '';
  const valuationLabel = value => ['close', 'regular-session-close'].includes(value) ? '正常盤日K收盤估值' : value === 'intraday' ? '盤中估值，非收盤績效' : '估值口徑待核對';
  const reboundPage = document.body.dataset.strategyKind === 'rebound';
  const passText = value => value === true ? '通過' : value === false ? '未通過' : '未核實';
  const plain = value => value === null || value === undefined ? '未提供' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const safeSource = value => {
    try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed : null; } catch { return null; }
  };

  function ruleLines(checks, isRebound) {
    if (!checks) return ['尚無可核對的規則數值。'];
    if (checks.metrics === null && checks.conditions === null) return ['尚無可核對的規則數值。'];
    if (checks.metrics && checks.conditions) {
      const m = checks.metrics, c = checks.conditions;
      const lines = isRebound ? [
        `前一日回撤 ${pct(m.prior_drawdown_fraction)} ≥ 15%：${passText(c.prior_drawdown_at_least_15_percent)}`,
        `訊號日收盤 ${amount(m.signal_close)} > 前一日最高 ${amount(m.prior_high)}：${passText(c.close_above_prior_high)}`,
        `訊號日成交量 ${amount(m.signal_volume)} ≥ 前20日均量 ${amount(m.prior20_average_volume)}：${passText(c.volume_at_least_prior20_average)}`
      ] : [`訊號日收盤 ${amount(m.signal_close)} > 前20日最高 ${amount(m.prior20_high)}：${passText(c.close_above_prior20_high)}`];
      if (isRebound && typeof c.positive_prior20_average_volume === 'boolean') lines.push(`均量資料有效（>0）：${passText(c.positive_prior20_average_volume)}`);
      if (numeric(m.atr14)) lines.push(`ATR14 ${amount(m.atr14)}；初始停損距離 ${amount(m.stop_distance)}`);
      return lines;
    }
    if (Array.isArray(checks)) return checks.map(check => {
      if (!check || typeof check !== 'object') return plain(check);
      const label = check.label || check.name || check.rule || '規則';
      return `${label}：${plain(check.actual ?? check.value)} ${check.operator || check.op || ''} ${plain(check.threshold ?? check.expected)}；${passText(check.passed ?? check.matched ?? check.met)}`;
    });
    return Object.entries(checks).map(([key, value]) => `${key}：${plain(value)}`);
  }

  function ruleNode(checks, isRebound) {
    const node = element('div', undefined, 'rule-lines');
    for (const line of ruleLines(checks, isRebound)) node.append(element('p', line));
    return node;
  }

  function sourceNode(row) {
    const node = element('div');
    const candidates = [row.source_url, row.history_source_url, row.volume_source_url, ...(Array.isArray(row.source_urls) ? row.source_urls : [])];
    const seen = new Set();
    for (const value of candidates) {
      const parsed = safeSource(typeof value === 'string' ? value : value?.url);
      if (!parsed || seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      const link = element('a', parsed.hostname, 'source-link');
      link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      node.append(link);
    }
    if (!seen.size) node.append(element('span', '尚無來源', 'muted'));
    return node;
  }

  function accountHref(value) {
    if (typeof value !== 'string') return null;
    if (/^(?:\.\/)?trader-x(?:-rebound)?\.html$/.test(value)) return `./${value.replace(/^\.\//, '')}`;
    const parsed = safeSource(value);
    return parsed?.hostname === 'chocychang.github.io' && /^\/stock_market_analysis\/trader-x(?:-rebound)?\.html$/.test(parsed.pathname) ? parsed.href : null;
  }

  function renderComparison(data) {
    const comparison = data.strategy_comparison;
    if (!comparison || !Array.isArray(comparison.accounts) || !comparison.accounts.length) {
      put('comparison-status', '共同期間基準尚無可核對資料，未顯示報酬比較。');
      empty('comparison-table', '尚未提供兩個帳本的共同期間快照。');
      return;
    }
    const status = { 'baseline-only': '僅基準快照', updated: '共同期間已更新', incomplete: '資料不完整' }[comparison.status] || '狀態待核對';
    put('comparison-status', `${status}｜共同起點：${comparison.started_at ? time(comparison.started_at) : '未核對'}｜資料截點：${comparison.as_of ? time(comparison.as_of) : '未核對'}｜${valuationLabel(comparison.valuation_type)}`);
    table('comparison-table', ['帳本', '基準NAV（USD）', '本次NAV（USD）', '共同期報酬', '本次曝險', '估值與持股'], comparison.accounts.map(account => {
      const node = element('div'), href = accountHref(account.href);
      if (href) { const link = element('a', account.name || '未命名帳本'); link.href = href; node.append(link); }
      else node.append(element('span', account.name || '未命名帳本'));
      const basePositions = Array.isArray(account.baseline_positions) ? account.baseline_positions : null;
      const positions = basePositions?.length ? `基準持股：${basePositions.map(position => `${position.ticker || '—'} ${amount(position.shares)}股`).join('、')}` : basePositions && numeric(account.baseline_nav_usd) ? '基準無持股' : '基準持股未核對';
      return [
        { node }, money(account.baseline_nav_usd), money(account.nav_usd),
        { text: pct(comparison.status === 'incomplete' ? null : account.return_fraction), className: comparison.status === 'incomplete' ? '' : signedClass(account.return_fraction) },
        pct(account.exposure),
        { text: account.valuation_at ? time(account.valuation_at) : '估值時間未核對', note: `${numeric(account.position_count) ? `${account.position_count}檔持股` : '檔數未核對'}；${positions}` }
      ];
    }));
    put('comparison-note', `${comparison.note || '共同起點的持股與曝險不同，不能只依短期報酬判定入場策略優劣。'} 尚未實作共同期間收盤最大回撤與SPY對照。`);
  }

  function renderPool(data, scans, isRebound) {
    const evaluation = data.universe_evaluation || {};
    const declared = Array.isArray(evaluation.tickers) ? evaluation.tickers : Array.isArray(data.universe) ? data.universe : [];
    const tickers = [...new Set(declared.map(value => typeof value === 'string' ? value : value?.ticker).filter(Boolean))];
    const grouped = new Map();
    for (const row of scans) if (row.ticker && /^[A-Z][A-Z0-9.-]{0,11}$/.test(row.ticker)) grouped.set(row.ticker, { ...(grouped.get(row.ticker) || {}), ...row });
    for (const ticker of grouped.keys()) if (!tickers.includes(ticker)) tickers.push(ticker);
    const rows = tickers.map(ticker => grouped.get(ticker) || { ticker, scanned: false, signal_matched: null, not_bought_reason: '本次尚未掃描，不能判斷是否符合。' });
    const coverage = evaluation.coverage || {};
    const total = numeric(coverage.total) ? coverage.total : rows.length;
    const scanned = numeric(coverage.scanned) ? coverage.scanned : rows.filter(row => row.scanned === true).length;
    const notScanned = numeric(coverage.not_scanned) ? coverage.not_scanned : rows.filter(row => row.scanned === false).length;
    const unknown = rows.filter(row => typeof row.scanned !== 'boolean').length;
    put('pool-selection-note', evaluation.selection_note || '名單以既有帳戶資料為準；沒有逐檔掃描標記的舊紀錄，保留為狀態待核對。');
    put('pool-revision', evaluation.revision || '尚未提供');
    put('pool-effective-at', evaluation.effective_at ? time(evaluation.effective_at) : '尚未提供');
    put('pool-as-of', evaluation.as_of ? time(evaluation.as_of) : '尚未提供');
    put('pool-coverage', `選股池 ${total} 檔｜已掃描 ${scanned} 檔｜未掃描 ${notScanned} 檔${unknown ? `｜舊紀錄未標示 ${unknown} 檔` : ''}。未掃描不等於未觸發，也不等於沒有買點。`);
    put('universe', tickers.length ? `本版名單：${tickers.join('、')}。新增股票只對生效時間後的評估適用。` : '尚未提供選股名單。');

    function draw() {
      const search = byId('pool-search').value.trim().toUpperCase();
      const filter = byId('pool-filter').value;
      const selected = rows.filter(row => row.ticker.toUpperCase().includes(search) && (
        filter === 'all' || filter === 'scanned' && row.scanned === true ||
        filter === 'not_scanned' && row.scanned === false ||
        filter === 'matched' && row.scanned === true && row.signal_matched === true ||
        filter === 'not_matched' && row.scanned === true && row.signal_matched === false ||
        filter === 'not_bought' && Boolean(row.not_bought_reason)
      ));
      byId('scan-results').replaceChildren();
      put('pool-result-count', `顯示 ${selected.length} / ${rows.length} 檔`);
      if (!selected.length) { empty('scan-results', rows.length ? '沒有符合目前搜尋或篩選的股票。' : '尚無選股池資料；不會以空清單宣稱已完成掃描。'); return; }
      table('scan-results', ['股票／掃描狀態', '資料日／取得時間', '訊號結果', '未買原因／本次動作', '規則實際數值', '資料來源'], selected.map(row => {
        const scanLabel = row.scanned === true ? '已掃描' : row.scanned === false ? '未掃描' : '舊紀錄待核對';
        const matched = row.scanned !== true ? '尚不能判斷' : row.signal_matched === true ? '已觸發' : row.signal_matched === false ? '未觸發' : '資料不足';
        const result = element('div'); result.append(element('span', matched, `scan-badge${row.signal_matched === true && row.scanned === true ? ' matched' : ''}`));
        if (row.action) result.append(element('span', sideText(row.action), 'cell-note'));
        return [
          { text: row.ticker, note: scanLabel },
          { text: row.signal_session || row.data_session || '未提供資料日', note: row.history_retrieved_at ? time(row.history_retrieved_at) : '取得時間未提供' },
          { node: result },
          row.not_bought_reason || row.reason || (row.scanned === false ? '尚未掃描，尚無交易判斷。' : '未提供，請核對本次成交與待處理動作。'),
          { node: ruleNode(row.rule_checks, isRebound) }, { node: sourceNode(row) }
        ];
      }));
    }
    byId('pool-search').addEventListener('input', draw);
    byId('pool-filter').addEventListener('change', draw);
    draw();
    const other = scans.filter(row => !row.ticker || !/^[A-Z][A-Z0-9.-]{0,11}$/.test(row.ticker));
    if (other.length) for (const row of other) byId('run-actions').append(element('p', `${row.ticker || '帳戶'}｜${sideText(row.action)}：${row.reason || '未提供說明'}`));
    else empty('run-actions', '沒有其他帳戶層級紀錄。');
  }

  function table(id, headers, rows) {
    const grid = element('table');
    const head = element('thead');
    const tr = element('tr');
    for (const header of headers) {
      const th = element('th', header);
      th.scope = 'col';
      tr.append(th);
    }
    head.append(tr);
    grid.append(head);
    const body = element('tbody');
    for (const row of rows) {
      const line = element('tr');
      for (const item of row) {
        const cell = element('td');
        if (item?.node) cell.append(item.node);
        else if (item && typeof item === 'object') {
          cell.append(element('span', item.text, item.className));
          if (item.note) cell.append(element('span', item.note, 'cell-note'));
        } else cell.textContent = item;
        line.append(cell);
      }
      body.append(line);
    }
    grid.append(body);
    byId(id).append(grid);
  }

  function render(data) {
    const positions = Array.isArray(data.positions) ? data.positions : [];
    const pending = Array.isArray(data.pending_orders) ? data.pending_orders : [];
    const fills = Array.isArray(data.latest_executions) ? data.latest_executions : [];
    const scans = Array.isArray(data.scan_results) ? data.scan_results : [];
    const performance = data.performance || {};
    const rules = data.rules || {};
    const op = data.operational_status || {};
    const isRebound = data.strategy_kind === 'rebound' || reboundPage;
    const diagnosticOnly = data.universe_evaluation?.evaluation_type === 'diagnostic-only' || op.status === 'configuration-and-diagnostic-completed';
    const strategyLabel = data.strategy_label || (isRebound ? '跌深反彈實驗' : '順勢突破');
    put('strategy-eyebrow', `TRADER X / ${strategyLabel}`);
    put('page-title', isRebound ? '交易X 跌深反彈實驗室' : '交易X 波段交易實驗室');
    put('strategy-intro', isRebound
      ? '觀察明顯下跌後，價格與成交量是否出現反轉訊號。使用獨立虛擬帳本，與順勢突破策略分開驗證。'
      : '依事先固定的突破條件進場，先計算風險，再決定買幾股。選股池逐檔留下掃描與未買原因。');
    put('entry-rule', isRebound
      ? '以前一完成交易日為訊號日：前一日相對此前20日高點回撤至少15%，訊號日收盤高於前一日最高價，且訊號日成交量達此前20日均量。三條件須同時成立。'
      : '檢查上一個完整正常交易日的收盤價，是否嚴格高於此前20個交易日最高價。股票名單與規則先固定，再觀察未來結果。');

    put('status-title', data.status || '帳戶狀態尚未提供');
    put('status-detail', diagnosticOnly
      ? `選股池中的資料診斷並非買單；帳戶估值截點請依下方估值註記與逐股時間核對。${op.evaluated_at ? '' : '尚未執行正式交易評估；已掃描數量與缺資料原因另列。'}`
      : op.evaluated_at
      ? '此處為正式前瞻模擬紀錄；盤中估值與已完成收盤估值請依資料註記區分。'
      : '角色已建立，等待首次正式評估。尚未執行訊號掃描，也沒有因此回補過去成交。');
    put('updated-at', data.updated_at ? time(data.updated_at) : '尚未提供');
    put('evaluated-at', time(op.evaluated_at));
    put('data-version', data.version || '尚未提供');
    put('strategy-version', data.strategy_version || '策略版本尚未提供');
    if (data.valuation_note) put('valuation-note', data.valuation_note);
    renderComparison(data);

    const holdingsCount = positions.filter(position => numeric(position.shares) && position.shares > 0).length;
    const metrics = [
      ['初始本金', money(data.capital_usd), '獨立虛擬資金'],
      ['剩餘現金', money(data.cash_usd), '尚未投入的資金'],
      ['帳戶總資產', money(data.nav_usd), '現金＋可核對的持股估值'],
      ['累計損益', money(data.pnl_usd), `帳戶報酬 ${pct(performance.return)}`, data.pnl_usd],
      ['已實現損益', money(data.realized_pnl_usd), '已賣出部位的損益', data.realized_pnl_usd],
      ['未實現損益', money(data.unrealized_pnl_usd), '仍持有部位的帳面損益', data.unrealized_pnl_usd],
      ['持股檔數', `${holdingsCount} 檔`, numeric(rules.max_positions) ? `上限 ${rules.max_positions} 檔，不必湊滿` : '以當期配置為準'],
      ['資金曝險', pct(performance.exposure), '持股市值占帳戶總資產']
    ];
    for (const [label, value, note, signed] of metrics) {
      const card = element('div', undefined, 'metric');
      card.append(element('span', label, 'metric-label'), element('b', value, signedClass(signed)), element('small', note));
      byId('metrics').append(card);
    }
    put('position-count', `${holdingsCount} 檔持股`);

    if (!holdingsCount) empty('positions', '目前沒有持股。尚未成交不代表策略已通過驗證。');
    else table('positions', ['股票／股數', '平均成本', '估值／時間', '市值', '未實現損益', '退出參考', '持有交易日'], positions.filter(p => p.shares > 0).map(p => [
      { text: p.ticker || '—', note: `${amount(p.shares)} 股` },
      money(p.average_cost),
      { text: money(p.mark_price), note: p.mark_at ? time(p.mark_at) : '缺少估值時間' },
      money(p.market_value_usd),
      { text: money(p.unrealized_pnl_usd), className: signedClass(p.unrealized_pnl_usd) },
      { text: `停損 ${money(p.stop_reference)}`, note: `目標 ${money(p.target_reference)}` },
      { text: numeric(p.holding_sessions) ? `${p.holding_sessions} 日` : '待核對', note: p.entry_session ? `首次進場 ${p.entry_session}` : '' }
    ]));

    if (!pending.length) empty('pending', '無待處理委託。');
    else for (const order of pending) {
      const node = element('div', undefined, 'pending-item');
      node.append(element('strong', `${order.ticker || '—'}｜${sideText(order.side)}｜${order.status || '待處理'}`));
      if (order.reason) node.append(element('p', order.reason));
      if (order.decision_at) node.append(element('p', `固定決策時間：${time(order.decision_at)}`));
      if (numeric(order.shares)) node.append(element('p', `候選股數：${amount(order.shares)} 股；尚未成交`));
      byId('pending').append(node);
    }

    renderPool(data, scans, isRebound);

    if (!fills.length) empty('executions', diagnosticOnly ? '本次沒有新增模擬成交；既有交易請查看上一份正式交易報告。' : '本次沒有新增模擬成交；歷史紀錄以帳本與報告為準。');
    else table('executions', ['成交時間', '股票／動作', '股數', '模擬單價', '佣金', '已實現損益', '理由'], fills.map(fill => [
      time(fill.executed_at || fill.quote_at || fill.at),
      { text: fill.ticker || '—', note: sideText(fill.side) },
      amount(fill.shares), money(fill.fill_price ?? fill.price), money(fill.fees_usd ?? fill.commission_usd),
      { text: money(fill.realized_pnl_usd), className: signedClass(fill.realized_pnl_usd) },
      fill.reason || '詳見本次報告'
    ]));

    if (numeric(rules.per_trade_risk) && numeric(rules.total_risk) && numeric(rules.max_positions) && numeric(rules.max_concentration)) {
      put('risk-rule', `每筆預計停損風險${pct(rules.per_trade_risk)}，全帳戶合計${pct(rules.total_risk)}以內；最多${rules.max_positions}檔，單股金額上限${pct(rules.max_concentration)}。股數依停損距離與可用現金計算。`);
    }
    if ([rules.stop_atr_multiple, rules.atr_period, rules.target_r_multiple, rules.max_holding_sessions].every(numeric)) {
      put('exit-rule', `初始停損距離為${rules.stop_atr_multiple}倍ATR${rules.atr_period}，獲利目標為${rules.target_r_multiple}倍初始風險，最長持有${rules.max_holding_sessions}個交易日。退出條件成立可提早賣出。`);
    }
    if (data.schedule?.entry_time && data.schedule?.review_time) {
      put('schedule-rule', `台灣${data.schedule.entry_time}評估新進場與持股；${data.schedule.review_next_calendar_day ? '隔日' : ''}${data.schedule.review_time}${data.schedule.review_new_buys ? '也可獨立評估新買進、賣出與待成交單' : '管理持股及既有待成交單'}。同一美股交易日不重複計算持有天數或買進同一訊號。`);
    }
    if (data.review) put('review', data.review);
    const closedCount = numeric(performance.closed_trade_count) ? performance.closed_trade_count : 0;
    put('performance-notes', !op.evaluated_at
      ? `${strategyLabel}帳戶尚無正式交易評估或成交。${diagnosticOnly ? '本次資料診斷的掃描覆蓋率另列。' : ''}零損益來自尚未交易，不能據此判定策略有效；歷史回測與比較績效尚未完成。`
      : `已平倉交易 ${closedCount} 筆${numeric(performance.win_rate) ? `，勝率 ${pct(performance.win_rate)}` : '，勝率尚無可用數據'}。樣本數與觀察期間必須一起閱讀；本頁不把前瞻模擬當成歷史回測。`);
    const limitations = Array.isArray(data.limitations) && data.limitations.length ? data.limitations : [
      '每天兩次評估，無法保證捕捉兩次檢查之間的價格變化，也不能事後假設已在停損價成交。',
      '報價不足時保留待處理狀態；缺少持股估值時，帳戶總資產可能不完整。',
      '價格、成本與成交模型都有侷限；本版規則尚未證明可獲利。'
    ];
    for (const note of limitations) byId('limitations').append(element('li', String(note)));
    if (typeof data.latest_report === 'string' && /^reports\/trader-x-[a-zA-Z0-9_.-]+\.html$/.test(data.latest_report)) {
      byId('latest-report').href = `./${data.latest_report}`;
      byId('latest-report').hidden = false;
    }
    if (typeof data.previous_trading_report === 'string' && /^reports\/trader-x-[a-zA-Z0-9_.-]+\.html$/.test(data.previous_trading_report) && data.previous_trading_report !== data.latest_report) {
      byId('previous-trading-report').href = `./${data.previous_trading_report}`;
      byId('previous-trading-report').hidden = false;
      if (data.previous_trading_evaluated_at) put('previous-trading-at', `（正式評估：${time(data.previous_trading_evaluated_at)}）`);
    }
  }

  const feed = document.body.dataset.feed || './data/trader-x.json';
  if (!/^\.\/data\/trader-x(?:-rebound)?\.json$/.test(feed)) {
    put('status-title', '帳戶資料路徑無效');
    put('status-detail', '請核對本頁設定，未載入其他來源的帳戶資料。');
    return;
  }
  fetch(feed, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid account data');
      if (data.strategy_kind && data.strategy_kind !== (reboundPage ? 'rebound' : 'breakout')) throw new Error('Account strategy does not match page');
      render(data);
    })
    .catch(() => {
      put('status-title', '帳戶資料載入失敗');
      put('status-detail', '無法核對最新帳戶狀態，請稍後重新整理。本頁不以預設金額代替缺少的資料。');
    });
})();
