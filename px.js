// ------------------------------
// 剩余价值计算器（UI/交互增强版）
// 保持原有计算逻辑不变，主要增强：
// 1) 表单校验与交互提示
// 2) 到期日期快捷选项：1月 / 1季 / 1年（以“当前日期”为起点）
// 3) 桌面/移动端更友好（配合 Bootstrap + px.css）
// ------------------------------

let __ratesCache = null;
let __autoCalcTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  bindBasicInteractions();
  bindExpiryQuickButtons();
  fetchExchangeRates();
  bindAutoRecalculateWhenResultVisible();
});

function isMobileDevice() {
  const mobileKeywords = ['Android', 'webOS', 'iPhone', 'iPad', 'iPod', 'BlackBerry', 'Mobile'];
  return mobileKeywords.some(keyword => navigator.userAgent.includes(keyword));
}

function showToast(message) {
  const toastContainer = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'alert alert-primary fade show';
  toast.role = 'alert';
  toast.style.marginBottom = '5px';
  toast.innerHTML = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode === toastContainer) toastContainer.removeChild(toast);
  }, 5500);
}

function setResultMeta(text) {
  const el = document.getElementById('resultMeta');
  if (!el) return;
  el.textContent = text || '';
}

function setResultStale(stale, text) {
  const result = document.querySelector('.result');
  if (!result || result.style.display === 'none') return;
  result.classList.toggle('result-stale', !!stale);
  setResultMeta(text || (stale ? '输入已更改，结果将自动刷新…' : ''));
}

function bindBasicInteractions() {
  // 输入时清除错误样式；同时标记结果为“已过期”
  const ids = [
    'exchangeRate',
    'tradeExchangeRate',
    'purchasePrice',
    'tradePrice',
    'currentDate',
    'expiryDate',
    'purchaseCurrency',
    'tradeCurrency',
    'paymentFrequency'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = (el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
    el.addEventListener(evt, () => {
      el.classList.remove('is-invalid');
      setResultStale(true);
    });
  });

  // 按 Enter 触发计算（移动端键盘更友好）
  const form = document.getElementById('calculatorForm');
  if (form) {
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        // 避免提交刷新
        e.preventDefault();
        calculateRemainingValue(false);
      }
    });
  }
}

function bindAutoRecalculateWhenResultVisible() {
  const form = document.getElementById('calculatorForm');
  if (!form) return;

  const schedule = () => {
    clearTimeout(__autoCalcTimer);
    __autoCalcTimer = setTimeout(() => {
      const result = document.querySelector('.result');
      if (!result || result.style.display === 'none') return;
      calculateRemainingValue(true);
    }, 220);
  };

  // 任何输入变化都会触发一次“静默刷新”（只有结果区已展示时）
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
}

function bindExpiryQuickButtons() {
  const wrap = document.querySelector('.quick-expiry');
  if (!wrap) return;

  const buttons = Array.from(wrap.querySelectorAll('button[data-expiry]'));
  const expiryInput = document.getElementById('expiryDate');
  const currentInput = document.getElementById('currentDate');

  const clearActive = () => buttons.forEach(b => b.classList.remove('active'));
  const setExpiry = (code) => {
    const base = parseDateLocal(currentInput?.value);
    if (!base) {
      showToast('请先填写“当前日期”');
      currentInput?.classList.add('is-invalid');
      currentInput?.focus();
      return;
    }

    let target;
    switch (code) {
      case '1m': target = addMonthsSafe(base, 1); break;
      case '1q': target = addMonthsSafe(base, 3); break;
      case '1y': target = addMonthsSafe(base, 12); break;
      default: target = null;
    }

    if (!target) return;
    expiryInput.value = formatDateInputValue(target);
    expiryInput.classList.remove('is-invalid');
  };

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-expiry');
      clearActive();
      btn.classList.add('active');
      setExpiry(code);
      setResultStale(true);
    });
  });

  // 用户手动改到期日时，取消快捷按钮高亮
  if (expiryInput) {
    expiryInput.addEventListener('change', () => {
      clearActive();
    });
  }

  // 如果已选择快捷按钮，用户修改“当前日期”时自动联动更新到期日
  if (currentInput) {
    currentInput.addEventListener('change', () => {
      const active = buttons.find(b => b.classList.contains('active'));
      if (!active) return;
      setExpiry(active.getAttribute('data-expiry'));
      setResultStale(true);
    });
  }
}

async function fetchExchangeRates() {
  try {
    const response = await fetch('exchange_rates.json', { cache: 'no-store' });
    const data = await response.json();
    const rates = data.rates;
    const date = data.date;
    __ratesCache = rates;

    document.getElementById('dataDate').value = date;

    updateExchangeRate(document.getElementById('purchaseCurrency'), rates, 'exchangeRate');
    updateExchangeRate(document.getElementById('tradeCurrency'), rates, 'tradeExchangeRate');

    document.getElementById('purchaseCurrency').addEventListener('change', function () {
      updateExchangeRate(this, rates, 'exchangeRate');
    });
    document.getElementById('tradeCurrency').addEventListener('change', function () {
      updateExchangeRate(this, rates, 'tradeExchangeRate');
    });

    // 默认填充“当前日期”为今天（本地时区）
    const currentDateEl = document.getElementById('currentDate');
    if (currentDateEl && !currentDateEl.value) {
      currentDateEl.value = formatDateInputValue(new Date());
    }
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    showToast('汇率数据加载失败，请刷新页面重试');
  }
}

function updateExchangeRate(currencyElement, rates, rateInputId) {
  const currency = currencyElement.value;
  const rate = currency === 'CNY' ? 1 : rates?.[currency];
  if (rate == null) {
    // 如果汇率文件里没有该币种，保留用户手动输入值，并给个提示
    showToast(`未找到 ${currency} 的汇率，请手动填写`);
    return;
  }
  document.getElementById(rateInputId).value = rate;
}

function parseDateLocal(yyyyMmDd) {
  if (!yyyyMmDd) return null;
  const parts = yyyyMmDd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  // 防止 2026-02-31 自动溢出到 3 月的情况
  if (dt.getFullYear() !== y || dt.getMonth() !== (m - 1) || dt.getDate() !== d) return null;
  return dt;
}

function formatDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addMonthsSafe(date, months) {
  // 例：1/31 + 1 个月 => 2 月最后一天
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  const target = new Date(y, m + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return target;
}

function readNumber(id) {
  const v = Number(document.getElementById(id)?.value);
  return Number.isFinite(v) ? v : NaN;
}

function markInvalid(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('is-invalid');
  try { el.focus(); } catch (_) {}
}

function validateInputs(values, silent) {
  const fail = (msg, id) => {
    if (!silent) showToast(msg);
    if (!silent && id) markInvalid(id);
    return { ok: false };
  };

  if (!Number.isFinite(values.exchangeRate) || values.exchangeRate <= 0) {
    return fail('请输入有效的“续费汇率”', 'exchangeRate');
  }
  if (!Number.isFinite(values.tradeExchangeRate) || values.tradeExchangeRate <= 0) {
    return fail('请输入有效的“交易汇率”', 'tradeExchangeRate');
  }
  if (!Number.isFinite(values.purchasePrice) || values.purchasePrice < 0) {
    return fail('请输入有效的“续费金额”', 'purchasePrice');
  }
  if (!Number.isFinite(values.tradePrice) || values.tradePrice < 0) {
    return fail('请输入有效的“交易金额”', 'tradePrice');
  }
  if (!values.currentDate) {
    return fail('请填写“当前日期”', 'currentDate');
  }
  if (!values.expiryDate) {
    return fail('请填写“到期日期”', 'expiryDate');
  }

  const remainingDays = Math.floor((values.expiryDate - values.currentDate) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(remainingDays)) {
    return fail('日期解析失败，请检查日期输入', 'expiryDate');
  }
  if (remainingDays <= 0) {
    return fail('“到期日期”必须晚于“当前日期”', 'expiryDate');
  }

  return { ok: true, remainingDays };
}

// 兼容 HTML onclick：calculateRemainingValue()
function calculateRemainingValue(silent = false) {
  const exchangeRate = readNumber('exchangeRate');
  const tradeExchangeRate = readNumber('tradeExchangeRate');
  const purchasePrice = readNumber('purchasePrice');
  const tradePrice = readNumber('tradePrice');
  const currentDate = parseDateLocal(document.getElementById('currentDate')?.value);
  const expiryDate = parseDateLocal(document.getElementById('expiryDate')?.value);
  const paymentFrequency = document.getElementById('paymentFrequency')?.value;

  const values = {
    exchangeRate,
    tradeExchangeRate,
    purchasePrice,
    tradePrice,
    currentDate,
    expiryDate,
    paymentFrequency
  };

  const check = validateInputs(values, !!silent);
  if (!check.ok) return;

  const remainingDays = check.remainingDays;
  const purchasePriceCNY = purchasePrice * exchangeRate;
  const tradePriceCNY = tradePrice * tradeExchangeRate;
  const remainingValue = calculateValueByFrequency(paymentFrequency, purchasePriceCNY, remainingDays);
  const premium = tradePriceCNY - remainingValue;

  const premiumPercentNum = (remainingValue === 0) ? 0 : (premium / remainingValue) * 100;
  const premiumPercentStr = Number.isFinite(premiumPercentNum) ? premiumPercentNum.toFixed(2) : '0.00';

  displayResults(purchasePriceCNY, tradePriceCNY, remainingValue, premium, premiumPercentStr, remainingDays, premiumPercentNum);
  setResultStale(false);
}

function calculateValueByFrequency(paymentFrequency, price, days) {
  let daysInPeriod;
  switch (paymentFrequency) {
    case 'yearly': daysInPeriod = 365; break;
    case 'halfyearly': daysInPeriod = 182.5; break;
    case 'quarterly': daysInPeriod = 91.25; break;
    case 'monthly': daysInPeriod = 30.44; break;
    case 'two-yearly': daysInPeriod = 730; break;
    case 'three-yearly': daysInPeriod = 1095; break;
    case 'five-yearly': daysInPeriod = 1825; break;
    default: daysInPeriod = 365;
  }
  return (price / daysInPeriod) * days;
}

function displayResults(purchasePrice, tradePrice, remainingValue, premium, premiumPercentStr, remainingDays, premiumPercentNum) {
  document.getElementById('resultPurchasePriceCNY').textContent = purchasePrice.toFixed(2);
  document.getElementById('resultTradePriceCNY').textContent = tradePrice.toFixed(2);
  document.getElementById('resultRemainingValueCNY').textContent = remainingValue.toFixed(2);
  document.getElementById('resultPremiumCNY').textContent = premium.toFixed(2);
  document.getElementById('resultPremiumPercent').textContent = premiumPercentStr + '%';

  const remainingMonths = Math.floor(remainingDays / 30);
  const remainingDay = remainingDays % 30;
  document.getElementById('resultRemainingDays').textContent = remainingDays;
  document.getElementById('resultRemainingMonths').textContent = remainingMonths;
  document.getElementById('resultRemainingDay').textContent = remainingDay;

  const advice = getAdvice(premiumPercentNum);
  document.getElementById('resultAdvice').textContent = advice;

  const meta = `已于 ${new Date().toLocaleString('zh-CN', { hour12: false })} 计算`;
  setResultMeta(meta);
  document.querySelector('.result').style.display = 'block';
}

function getAdvice(premiumPercent) {
  if (premiumPercent >= 10 && premiumPercent < 30) {
    return '卖家溢价少许，请三思而后行！';
  } else if (premiumPercent >= 30 && premiumPercent < 100) {
    return '存在高溢价，非刚需勿买！';
  } else if (premiumPercent >= 100) {
    return '此乃传家之宝乎？';
  } else if (premiumPercent <= -30 && premiumPercent > -50) {
    return '卖家血亏，快买，错过拍断大腿！';
  } else if (premiumPercent <= -10 && premiumPercent > -30) {
    return '卖家小亏，买了或许不赚但绝对不亏！';
  } else if (premiumPercent <= -50) {
    return '极端折价，可能存在问题，需谨慎！';
  } else {
    return '价格合理，良心卖家！';
  }
}

function takeScreenshot() {
  const resultSection = document.querySelector('.result');
  const screenshotResult = document.getElementById('screenshotResult');
  const loadingDiv = document.getElementById('loading');

  if (!resultSection || resultSection.style.display === 'none') {
    showToast('请先完成计算再分享');
    return;
  }

  const dataDate = document.getElementById('dataDate').value || '';
  const purchasePrice = document.getElementById('resultPurchasePriceCNY').textContent || '0.00';
  const remainingValue = document.getElementById('resultRemainingValueCNY').textContent || '0.00';
  const remainingDays = document.getElementById('resultRemainingDays').textContent || '0';
  const remainingMonths = document.getElementById('resultRemainingMonths').textContent || '0';
  const remainingDay = document.getElementById('resultRemainingDay').textContent || '0';
  const tradePrice = document.getElementById('resultTradePriceCNY').textContent || '0.00';
  const premium = document.getElementById('resultPremiumCNY').textContent || '0.00';
  const premiumPercent = document.getElementById('resultPremiumPercent').textContent || '0%';
  const advice = document.getElementById('resultAdvice').textContent || '暂无建议';
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });

  const markdownLines = [
    '# 剩余价值计算结果',
    dataDate ? `> 汇率数据日期：${dataDate}\n` : '',
    '',
    '| 项目 | 数值 |',
    '| --- | --- |',
    `| 续费金额（CNY） | ￥${purchasePrice} |`,
    `| 剩余价值（CNY） | ￥${remainingValue} |`,
    `| 剩余天数 | ${remainingDays} 天 (${remainingMonths} 个月余 ${remainingDay} 天) |`,
    `| 交易金额（CNY） | ￥${tradePrice} |`,
    `| 溢价金额（CNY） | ￥${premium} |`,
    `| 溢价幅度 | ${premiumPercent} |`,
    `| 购买建议 | ${advice || '暂无建议'} |`,
    '',
    `生成于：${generatedAt}`
  ].filter(Boolean);

  const markdownContent = markdownLines.join('\n');

  loadingDiv.style.display = 'none';
  screenshotResult.style.display = 'block';
  renderMarkdownPreview(screenshotResult, {
    dataDate,
    purchasePrice,
    remainingValue,
    remainingDays,
    remainingMonths,
    remainingDay,
    tradePrice,
    premium,
    premiumPercent,
    advice,
    generatedAt,
    markdownContent
  });

  // 默认尝试复制（保留原行为），同时提供按钮手动复制
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(markdownContent).then(() => {
      showToast('Markdown 内容已复制到剪切板');
    }).catch(() => {
      showToast('自动复制失败，可点击“复制 Markdown”按钮重试');
    });
  } else {
    showToast('当前环境不支持自动复制，请点击“查看 Markdown 源”手动复制');
  }
}

function renderMarkdownPreview(container, payload) {
  const rows = [
    ['续费金额（CNY）', `￥${payload.purchasePrice}`],
    ['剩余价值（CNY）', `￥${payload.remainingValue}`],
    ['剩余天数', `${payload.remainingDays} 天 (${payload.remainingMonths} 个月余 ${payload.remainingDay} 天)`],
    ['交易金额（CNY）', `￥${payload.tradePrice}`],
    ['溢价金额（CNY）', `￥${payload.premium}`],
    ['溢价幅度', `${payload.premiumPercent}`],
    ['购买建议', payload.advice || '暂无建议']
  ];

  const tbody = rows.map(([k, v]) => (
    `<tr><td>${escapeHtml(String(k))}</td><td>${escapeHtml(String(v))}</td></tr>`
  )).join('');

  const btnId = `btnCopyMd_${Date.now()}`;

  container.innerHTML = `
    <div class="share-block">
      <div class="share-actions">
        <div class="font-weight-bold">分享预览</div>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="${btnId}">复制 Markdown</button>
      </div>
      <div class="markdown-preview">
        <h3>剩余价值计算结果</h3>
        ${payload.dataDate ? `<blockquote>汇率数据日期：${escapeHtml(String(payload.dataDate))}</blockquote>` : ''}
        <div class="table-responsive">
          <table class="table table-sm table-bordered mb-2">
            <thead>
              <tr><th style="width: 45%">项目</th><th>数值</th></tr>
            </thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
        <div class="text-muted small">生成于：${escapeHtml(String(payload.generatedAt))}</div>
      </div>
      <details class="mt-2">
        <summary class="small text-muted">查看 Markdown 源</summary>
        <pre class="mt-2 mb-0"><code class="language-markdown">${escapeHtml(payload.markdownContent)}</code></pre>
      </details>
    </div>
  `;

  const btn = document.getElementById(btnId);
  if (btn) {
    btn.addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload.markdownContent).then(() => {
          showToast('Markdown 内容已复制到剪切板');
        }).catch(() => {
          showToast('复制失败，请展开“查看 Markdown 源”手动复制');
        });
      } else {
        showToast('当前环境不支持自动复制，请展开“查看 Markdown 源”手动复制');
      }
    });
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
