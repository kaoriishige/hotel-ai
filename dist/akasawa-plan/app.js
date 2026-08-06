const DIRECTION_EXAMPLES = [
  {
    id: 1,
    title: "♨️ 【源泉かけ流しぬる湯】加温加水なし38〜40℃天然ぬる湯と至福の長湯・静養プラン",
    text: "体温に近い源泉かけ流し天然ぬる湯に浸かり、副交感神経を優位にして心身の疲労を完全にリセットしたい温泉愛好家・静養希望者をターゲットにした高満足度プランを企画したい。"
  },
  {
    title: "🐱 【看板猫のおもてなし】「猫のいる静養宿」でのんびり癒やしの時間プラン",
    text: "ロビーや館内で愛らしい看板猫たちとふれあい、箒川のせせらぎを聴きながら何もしない贅沢なリセット時間を過ごしたい猫好き・ソロ旅・ご夫婦向けプランを企画したい。"
  },
  {
    title: "🍖 【地物味覚×ジンギスカン】赤沢風 鹿×豚ジンギスカンと季節の山菜・川魚プラン",
    text: "屋外ウッドデッキや食事処で楽しむ名物「赤沢風 鹿×豚ジンギスカン鍋」と、塩原の新鮮な川魚・山菜を味わう美食家・ファミリー向け宿泊プランを企画したい。"
  },
  {
    title: "🌿 【箒川の一軒宿×湯治】塩原大自然と隠れ家空間で過ごすデジタルデトックス",
    text: "川の対岸に佇む静寂の一軒宿で、箒川の四季折々の風景を眺めながら静かに温泉手当・湯治と美食を楽しむ休日プランを企画したい。"
  }
];

let TARGET_HOTELS = [];

let generatedPlans = {
  yearRoundPlan: null,
  shortTermPlan: null
};

// DOM要素
const el = {
  directionButtons: document.getElementById('direction-buttons'),
  directionInput: document.getElementById('direction-input'),
  customNotes: document.getElementById('custom-notes'),
  generateBtn: document.getElementById('generate-btn'),
  loader: document.getElementById('loader'),
  statusBadge: document.getElementById('status-badge'),
  placeholderView: document.getElementById('placeholder-view'),
  outputContent: document.getElementById('output-content'),

  // レポート出力先
  marketAnalysis: document.getElementById('market-analysis'),
  pricingStrategy: document.getElementById('pricing-strategy'),
  planName: document.getElementById('plan-name'),
  aiKeywords: document.getElementById('ai-keywords'),
  planCatch: document.getElementById('plan-catch'),
  planDescPreview: document.getElementById('plan-desc-preview'),
  planDesc: document.getElementById('plan-desc'),
  sheetRoom: document.getElementById('sheet-room'),
  sheetMeal: document.getElementById('sheet-meal'),
  sheetPerks: document.getElementById('sheet-perks'),
  sheetCoupon: document.getElementById('sheet-coupon'),

  targetHotelsContainer: document.getElementById('target-hotels-container'),
  planTabs: document.getElementById('plan-tabs')
};

// 1. クイック方向性ボタンの初期化とターゲットホテル初期化
function initDirections() {
  el.directionButtons.innerHTML = DIRECTION_EXAMPLES.map(dir => `
    <button class="direction-btn" data-id="${dir.id}">${dir.title}</button>
  `).join('');

  el.directionButtons.addEventListener('click', e => {
    const btn = e.target.closest('.direction-btn');
    if (!btn) return;

    // アクティブ切り替え
    document.querySelectorAll('.direction-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // テキスト挿入
    const id = parseInt(btn.dataset.id, 10);
    const selected = DIRECTION_EXAMPLES.find(d => d.id === id);
    if (selected) {
      el.directionInput.value = selected.text;
    }
  });

  // ターゲットホテル初期化
  if (el.targetHotelsContainer) {
    fetch('/shared/target_hotels.json')
      .then(res => res.json())
      .then(data => {
        TARGET_HOTELS = data;
        el.targetHotelsContainer.innerHTML = TARGET_HOTELS.map(hotel => `
          <div class="target-hotel-card">
            <div class="target-hotel-header">
              <span class="hotel-name">${hotel.name}</span>
              <span class="hotel-icon">▼</span>
            </div>
            <div class="target-hotel-body">
              <span class="hotel-plan-label">代表的なプラン:</span>
              <div class="hotel-plan-title">${hotel.plan}</div>
              <span class="hotel-plan-label">料金設定:</span>
              <div class="hotel-plan-price">${hotel.price}</div>
            </div>
          </div>
        `).join('');
      })
      .catch(err => console.error('Failed to load target hotels', err));

    el.targetHotelsContainer.addEventListener('click', e => {
      const header = e.target.closest('.target-hotel-header');
      if (!header) return;
      const card = header.closest('.target-hotel-card');
      card.classList.toggle('open');
    });
  }
}

// 2. 簡易マークダウンパーサー
function parseMarkdown(md) {
  if (!md) return '';
  let html = md.trim();

  // 見出し H3
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  // 太字
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // 箇条書き
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');

  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    if (block.startsWith('<h') || block.startsWith('<li>')) {
      return block;
    }
    if (block.includes('<li>')) {
      return `<ul>${block}</ul>`;
    }
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

// 3. プラン生成APIの呼び出し
async function generatePlan() {
  const direction = el.directionInput.value.trim();
  const customNotes = el.customNotes.value.trim();

  if (!direction) {
    alert('プランの方向性を入力、またはサンプルから選択してください。');
    return;
  }

  // UIをローディングに
  el.generateBtn.disabled = true;
  el.loader.style.display = 'block';
  el.statusBadge.textContent = '分析＆生成中...';
  el.statusBadge.classList.remove('active');

  try {
    function getActiveTenantId() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('tenant') || localStorage.getItem('active_tenant_id') || 'nasu-utopia';
    }
    const tenantId = getActiveTenantId();

    const response = await fetch('/.netlify/functions/generate-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ direction, customNotes, tenantId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'プラン生成中にエラーが発生しました。');
    }

    // 2パターンのデータを保存
    generatedPlans.yearRoundPlan = data.yearRoundPlan;
    generatedPlans.shortTermPlan = data.shortTermPlan;

    // 表示切り替え
    el.placeholderView.classList.add('hidden');
    el.outputContent.classList.remove('hidden');
    el.planTabs.classList.remove('hidden');
    el.statusBadge.textContent = '作成完了';
    el.statusBadge.classList.add('active');

    // デフォルトで年間プランを表示
    renderPlanData('yearRoundPlan');

  } catch (error) {
    console.error('API Error:', error);
    alert(error.message || '通信エラーが発生しました。');
    el.statusBadge.textContent = 'エラー';
  } finally {
    el.generateBtn.disabled = false;
    el.loader.style.display = 'none';
  }
}

function renderPlanData(type) {
  const planData = generatedPlans[type];
  if (!planData) return;

  // レンダリング
  el.marketAnalysis.innerHTML = parseMarkdown(planData.marketAnalysis);
  el.pricingStrategy.textContent = planData.pricingStrategy;
  el.planName.textContent = planData.planName;
  el.planCatch.textContent = planData.catchCopy;

  // AIキーワードタグの生成
  const keywords = planData.aiKeywords || [];
  el.aiKeywords.innerHTML = keywords.map(kw => `<span class="tag">${kw}</span>`).join('');

  // 情緒的説明文の流し込み
  el.planDesc.value = planData.description;
  el.planDescPreview.innerHTML = parseMarkdown(planData.description);

  // 管理者向け設定シート
  const settings = planData.otaSettings || {};
  el.sheetRoom.textContent = settings.roomType || '自動判定の推奨室';
  el.sheetMeal.textContent = settings.mealType || '夕食・朝食付き';
  el.sheetPerks.textContent = settings.perks || 'なし';
  el.sheetCoupon.textContent = settings.couponAdvice || 'なし';
}

// 4. コピーボタン処理
function initCopyButtons() {
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;

    const targetId = btn.dataset.target;
    let textToCopy = '';

    if (targetId === 'plan-name' || targetId === 'plan-catch') {
      textToCopy = document.getElementById(targetId).textContent;
    } else if (targetId === 'plan-desc') {
      textToCopy = el.planDesc.value; // テキストエリアからプレーンテキストを取得
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      
      const originalText = btn.textContent;
      btn.textContent = 'コピー完了 ✓';
      btn.classList.add('copied');
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      alert('コピーに失敗しました。');
    }
  });
}

// 5. タブ切り替え（説明文プレビュー/テキスト）
function initTabs() {
  // 説明文のプレビュー/テキスト切り替え
  document.addEventListener('click', e => {
    const tab = e.target.closest('.tab-btn');
    if (!tab) return;

    const tabType = tab.dataset.tab;
    const parentHead = tab.closest('.output-card-head');
    const card = parentHead.closest('.output-card');

    card.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (tabType === 'preview') {
      el.planDescPreview.classList.remove('hidden');
      el.planDesc.classList.add('hidden');
    } else {
      el.planDescPreview.classList.add('hidden');
      el.planDesc.classList.remove('hidden');
    }
  });

  // プランタイプ（年間/短期）切り替え
  if (el.planTabs) {
    el.planTabs.addEventListener('click', e => {
      const btn = e.target.closest('.plan-tab-btn');
      if (!btn) return;

      document.querySelectorAll('.plan-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const type = btn.dataset.type;
      renderPlanData(type);
    });
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  initDirections();
  initCopyButtons();
  initTabs();

  el.generateBtn.addEventListener('click', generatePlan);
});
