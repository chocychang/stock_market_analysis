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
        if (item && typeof item === 'object') {
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

    put('status-title', data.status || '帳戶狀態尚未提供');
    put('status-detail', op.evaluated_at
      ? '此處為正式前瞻模擬紀錄；盤中估值與已完成收盤估值請依資料註記區分。'
      : '角色已建立，等待首次正式評估。尚未執行訊號掃描，也沒有因此回補過去成交。');
    put('updated-at', data.updated_at ? time(data.updated_at) : '尚未提供');
    put('evaluated-at', time(op.evaluated_at));
    put('data-version', data.version || '尚未提供');
    put('strategy-version', data.strategy_version || '策略版本尚未提供');
    if (data.valuation_note) put('valuation-note', data.valuation_note);

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

    if (!scans.length) empty('scan-results', '尚無訊號評估紀錄；不會把未掃描顯示為「沒有機會」。');
    else table('scan-results', ['股票', '評估結果', '原因'], scans.map(scan => [scan.ticker || '—', sideText(scan.action), scan.reason || '尚未提供原因']));
    put('universe', Array.isArray(data.universe) && data.universe.length
      ? `固定觀察名單：${data.universe.map(item => typeof item === 'string' ? item : item.ticker || '—').join('、')}。名單變更應另留生效紀錄。`
      : '固定觀察名單尚未提供。');

    if (!fills.length) empty('executions', '目前沒有模擬成交紀錄。');
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
      put('schedule-rule', `台灣${data.schedule.entry_time}評估新進場與持股；${data.schedule.review_next_calendar_day ? '隔日' : ''}${data.schedule.review_time}管理持股及既有待成交單。同一美股交易日不重複計算持有天數或買進同一訊號。`);
    }
    if (data.review) put('review', data.review);
    const closedCount = numeric(performance.closed_trade_count) ? performance.closed_trade_count : 0;
    put('performance-notes', !op.evaluated_at
      ? '帳戶目前僅完成初始化。零損益來自尚未交易，不能據此判定策略有效；歷史回測與比較績效尚未完成。'
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
  }

  fetch('./data/trader-x.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid account data');
      render(data);
    })
    .catch(() => {
      put('status-title', '帳戶資料載入失敗');
      put('status-detail', '無法核對最新帳戶狀態，請稍後重新整理。本頁不以預設金額代替缺少的資料。');
    });
})();
