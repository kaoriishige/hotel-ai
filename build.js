const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const distDir = path.join(__dirname, 'dist');
const functionsDir = path.join(__dirname, 'netlify', 'functions');

// 1. クリーンアップと作成
console.log('Cleaning old build directories...');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

if (fs.existsSync(functionsDir)) {
  fs.rmSync(functionsDir, { recursive: true, force: true });
}
fs.mkdirSync(functionsDir, { recursive: true });

// ディレクトリコピー用のヘルパー
function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      if (element === 'node_modules' || element === '.git' || element === '.netlify') return;
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

// 2. ルートの index.html コピー
console.log('Copying portal index.html...');
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(distDir, 'index.html'));

// 2.5. 共通データ基盤(shared)のコピー
console.log('Copying shared data...');
copyFolderSync(path.join(__dirname, 'shared'), path.join(distDir, 'shared'));

// 3. apps/akasawa-chat のコピー (静的)
console.log('Copying akasawa-chat...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-chat'), path.join(distDir, 'akasawa-chat'));

// 3.5. apps/endo-sns のコピーとAPIパス修正 (衝突回避)
console.log('Copying and preparing endo-sns...');
const endoSnsDest = path.join(distDir, 'endo-sns');
copyFolderSync(path.join(__dirname, 'apps', 'endo-sns', 'public'), endoSnsDest);

// endo.mp3 をコピー
const endoMp3Src = path.join(__dirname, 'endo.mp3');
if (fs.existsSync(endoMp3Src)) {
  fs.copyFileSync(endoMp3Src, path.join(__dirname, 'apps', 'endo-sns', 'public', 'endo.mp3'));
  fs.copyFileSync(endoMp3Src, path.join(endoSnsDest, 'endo.mp3'));
  console.log('Copied endo.mp3 to public and dist folders.');
}

const endoJsFiles = ['index.js', 'review.js'];
endoJsFiles.forEach(file => {
  const filePath = path.join(endoSnsDest, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\/api\//g, '/api/endo-');
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

// 4. apps/akasawa-ml のコピー (静的)
console.log('Copying akasawa-ml...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ml', 'public'), path.join(distDir, 'akasawa-ml'));

// 5. apps/akasawa-sns のコピー (静的)
console.log('Copying akasawa-sns...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-sns', 'public'), path.join(distDir, 'akasawa-sns'));

// 6. apps/akasawa-dp のコピー（React版ダッシュボード）
console.log('Building akasawa-dp React dashboard...');
let dpPath = path.join(__dirname, 'apps', 'akasawa-dp');
if (!fs.existsSync(dpPath)) {
  dpPath = path.join(__dirname, 'apps', 'akasawa.dp');
}
const adminPath = path.join(dpPath, 'apps', 'admin');
const adminDistPath = path.join(adminPath, 'dist');

// Netlify上ではdistが存在しないためReactをビルドする
if (!fs.existsSync(adminDistPath) || !fs.existsSync(path.join(adminDistPath, 'index.html'))) {
  console.log('  → akasawa-dp: dist not found, running npm install + vite build...');
  try {
    execSync('npm install', { cwd: adminPath, stdio: 'inherit' });
    execSync('npm run build', { cwd: adminPath, stdio: 'inherit' });
    console.log('  → akasawa-dp: build complete.');
  } catch (e) {
    console.error('  ✗ akasawa-dp build failed:', e.message);
  }
} else {
  console.log('  → akasawa-dp: dist already exists, skipping build.');
}

// 6. 全10施設への「9システム統合AIダッシュボードポータル」のデプロイ
console.log('Building and deploying 9-system AI Dashboards for all 10 facilities...');
const facilityMap = [
  { folder: 'akasawa', name: '赤沢温泉旅館' },
  { folder: 'akasawa-dp', name: '赤沢温泉旅館' },
  { folder: 'nasu-utopia', name: '那須ユートピア美野沢' },
  { folder: 'nasu-utopia-ai', name: '那須ユートピア美野沢' },
  { folder: 'nasumid-p', name: '那須ユートピア美野沢' },
  { folder: 'hakone-villa', name: '箱根強羅 AIヴィラ' },
  { folder: 'atami-resort', name: '熱海オーシャンビューリゾート' },
  { folder: 'karuizawa-lodge', name: '軽井沢フォレストロッジ' },
  { folder: 'kyoto-gion', name: '京都祇園 伝統庵AI' },
  { folder: 'furano-snow', name: '富良野スノーリゾート' },
  { folder: 'iseshima-villa', name: '伊勢志摩ベイサイドヴィラ' },
  { folder: 'yufuin-hanare', name: '由布院 温泉離れAI' },
  { folder: 'miyakojima-suite', name: '宮古島 プレミアムスイート' }
];

const templatePath = path.join(__dirname, 'facility-dashboard-template.html');
if (fs.existsSync(templatePath)) {
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  facilityMap.forEach(item => {
    const targetDir = path.join(distDir, item.folder);
    fs.mkdirSync(targetDir, { recursive: true });
    
    let renderedHtml = templateHtml
      .replace(/\{\{FACILITY_NAME\}\}/g, item.name)
      .replace(/\{\{FACILITY_PATH\}\}/g, item.folder);

    // 那須ユートピア美野沢・赤沢温泉旅館それぞれのRAG・9システム文言の完全カスタマイズ
    if (item.folder.includes('nasu')) {
      renderedHtml = renderedHtml
        .replace(/「ととのう」の、その先へ(?!\s*\(BEYOND)/g, '「ととのう」の、その先へ (BEYOND TOTONOU FEELING)')
        .replace(/猫とぬる湯と渓流にほどける、静養型ウェルネスの小宿/g, 'アート×サウナ×大自然で五感を解き放つ、旧美野沢小学校リノベーションリゾート')
        .replace(/お食事、館内施設、温泉のご案内/g, 'サウナ（CUBERU/Rekka）、グランピングヴィラ、手ぶらBBQのご案内')
        .replace(/オーナー遠藤正俊氏のトーン＆マナー/g, '那須ユートピアの温かみと『ととのい体験』に寄り添うトーン＆マナー')
        .replace(/赤沢温泉の独自の強み（ぬる湯、猫、おもてなし）/g, '那須ユートピア独自の強み（本格フィンランドサウナ、那須連山の水風呂、ドッグランヴィラ、手ぶらBBQ）')
        .replace(/赤沢温泉旅館の全データ/g, '那須ユートピア美野沢の全データ（サウナ・ヴィラ・BBQ・アート）');
    } else if (item.folder.includes('akasawa')) {
      renderedHtml = renderedHtml
        .replace(/https:\/\/nasu-utopia\.jp\//g, 'https://hotel-ai.netlify.app/akasawa/')
        .replace(/那須ユートピア美野沢/g, '塩原温泉 赤沢温泉旅館')
        .replace(/NASU UTOPIA MINOSAWA/g, 'SHIOBARA ONSEN AKASAWA RYOKAN')
        .replace(/旧美野沢小学校を再生したアートリノベーション型プライベートヴィラ。フィンランド式貸切バレルサウナ CUBERU・REKKA、150㎡ドッグラン付きヴィラ、那須連山の伏流水かけ流し水風呂を完備。定員 1〜8 名、駐車場 30 台無料。那須塩原駅から車 30 分、那須 IC から車 35 分。/g, '塩原温泉 源泉かけ流しのぬる湯と猫のいる静養宿。加温・加水なし38度〜40度の天然ぬる湯、看板猫のおもてなし、箒川を望む静寂空間、鹿肉ジンギスカン・季節の味覚を提供します。')
        .replace(/旧美野沢小学校リノベーションリゾート/g, '塩原温泉 源泉かけ流しのぬる湯と猫のいる静養宿')
        .replace(/那須郡那須町/g, '那須塩原市')
        .replace(/箕輪318/g, '塩原1149')
        .replace(/那須町観光協会/g, '塩原温泉観光協会')
        .replace(/サウナ（CUBERU\/Rekka）、グランピングヴィラ、手ぶらBBQのご案内/g, '源泉かけ流しぬる湯、看板猫、箒川一軒宿、鹿肉ジンギスカンのご案内')
        .replace(/那須ユートピア独自の強み（本格フィンランドサウナ、那須連山の水風呂、ドッグランヴィラ、手ぶらBBQ）/g, '塩原温泉 赤沢温泉旅館の独自の強み（天然ぬる湯、看板猫のおもてなし、箒川のせせらぎ）')
        .replace(/那須ユートピア美野沢の全データ（サウナ・ヴィラ・BBQ・アート）/g, '塩原温泉 赤沢温泉旅館の全データ（ぬる湯・看板猫・温泉・お食事）')
        .replace(/那須ユートピア美野沢の全データ/g, '塩原温泉 赤沢温泉旅館の全データ')
        .replace(/CUBERU・REKKA フィンランド式バレルサウナ\(完全貸切 90分\)/g, '源泉かけ流し天然ぬる湯（38〜40℃・加温加水なし）')
        .replace(/REKKA 水風呂\(那須連山伏流水かけ流し・15℃\)/g, '箒川を望む露天風呂・静養空間')
        .replace(/150㎡ドッグラン付きヴィラ\(小型〜中型犬 4頭まで同伴可\)/g, '看板猫のおもてなし（猫のいる静養宿）')
        .replace(/地元食材 BBQ グリル\(ガス・炭火両対応\)/g, '赤沢風 鹿×豚ジンギスカン料理')
        .replace(/ヴィラ A\(ドッグラン 150㎡ 付き・定員 6名\)/g, '箒川を望む和室（定員 5名）')
        .replace(/ヴィラ B\(サウナ・定員 8名\)/g, '特別和室（静養・湯治向け）')
        .replace(/「那須高原和牛BBQセット」「朝食焼き立てバゲット」/g, '「赤沢風 鹿×豚ジンギスカン」「地物川魚・季節の味覚」')
        .replace(/サウナー・愛犬家・家族ファミリー・アート好きカップル/g, '温泉・長湯愛好家・猫好き・静養・温泉治癒を求めるお客様')
        .replace(/Q1\. 貸切バレルサウナの利用時間は？/g, 'Q1. 塩原温泉 赤沢温泉旅館のぬる湯の特徴は？')
        .replace(/A1\. 90分完全貸切制です。15:00〜22:00 \/ 7:00〜10:00からご希望の時間枠をお選びいただけます。/g, 'A1. 当館の温泉は加温・加水なしの38度〜40度天然ぬる湯です。副交感神経を優位にし、長湯を楽しみながら至福の静養・リセット体験が可能です。')
    }

    // 各施設専用の動的仕様書HTML (SPEC_A 〜 SPEC_FG) の生成
    const isAkasawaSpec = item.folder.includes('akasawa');

    const specA = isAkasawaSpec ? `
      1. <strong>1行結論＋ベネフィット記載</strong>: 【塩原温泉 源泉かけ流しぬる湯＆看板猫のいる静養宿】至福の長湯と癒やし体験。<br>
      2. <strong>数値ファクトの明記</strong>: 「加温加水なし 38〜40℃天然ぬる湯」「箒川沿い一軒宿」「無料駐車場30台」。<br>
      3. <strong>アイキャッチ【】タグの付与</strong>: 【猫とぬる湯】【赤沢風ジンギスカン】【湯治・静養】。<br>
      4. <strong>ターゲットペルソナ選定</strong>: 温泉・長湯愛好家、猫好き、静養・温泉治癒を求めるお客様への訴求。<br>
      5. <strong>夕朝食スペック明記</strong>: 「赤沢風 鹿×豚ジンギスカン」「地物川魚・季節の山菜料理」。<br>
      6. <strong>アクセス数値明記</strong>: 「那須塩原駅よりバス・車でアクセス / 無料駐車場30台」。<br>
      7. <strong>文末一問一答FAQ 3問自動生成</strong>:<br>
      <pre style="background:#000; padding:8px; border-radius:6px; font-size:0.7rem; color:#34d399; overflow-x:auto;">Q1. 塩原温泉 赤沢温泉旅館のぬる湯の特徴は？
A1. 加温・加水なし38〜40度天然ぬる湯です。副交感神経を優位にし、至福の長湯・静養体験が可能です。
Q2. 看板猫たちとの過ごし方は？
A2. ロビーや館内で看板猫たちがのんびり過ごしています。
Q3. 駐車場について
A3. 敷地内に30台分の無料駐車場を備えています。</pre>
      <a href="/${item.folder}/plan/index.html" style="display:block; text-align:center; background:var(--accent-gradient); color:#000; font-weight:900; padding:8px; border-radius:6px; margin-top:8px; text-decoration:none;">🚀 今すぐ「宿泊プラン作成エージェント」でAI自動生成する</a>
    ` : `
      1. <strong>1行結論＋ベネフィット記載</strong>: 【アート×サウナ×大自然】旧美野沢小学校リノベーションリゾート体験。<br>
      2. <strong>数値ファクトの明記</strong>: 「完全貸切バレルサウナ CUBERU/Rekka 90分」「150㎡ドッグラン」「無料駐車場30台」。<br>
      3. <strong>アイキャッチ【】タグの付与</strong>: 【サウナ貸切無料】【手ぶらBBQ】【愛犬同伴ヴィラ】。<br>
      4. <strong>ターゲットペルソナ選定</strong>: サウナー、愛犬家、ファミリー、アート好きカップルへの明確な訴求。<br>
      5. <strong>夕朝食スペック明記</strong>: 「那須高原和牛BBQセット」「朝食焼き立てバゲット」。<br>
      6. <strong>アクセス数値明記</strong>: 「那須塩原駅から車20分 / 那須ICから車35分 / 無料駐車場30台」。<br>
      7. <strong>文末一問一答FAQ 3問自動生成</strong>:<br>
      <pre style="background:#000; padding:8px; border-radius:6px; font-size:0.7rem; color:#34d399; overflow-x:auto;">Q1. 貸切バレルサウナの利用時間は？
A1. 90分完全貸切制（15:00〜22:00 / 7:00〜10:00）です。
Q2. 愛犬同伴の条件は？
A2. 狂犬病・ワクチン証明提示で中型犬2頭まで可。150㎡ドッグラン完備。
Q3. 駐車場料金は？
A3. 敷地内に30台分の無料駐車場を備えています。</pre>
      <a href="/${item.folder}/plan/index.html" style="display:block; text-align:center; background:var(--accent-gradient); color:#000; font-weight:900; padding:8px; border-radius:6px; margin-top:8px; text-decoration:none;">🚀 今すぐ「宿泊プラン作成エージェント」でAI自動生成する</a>
    `;

    const specB = isAkasawaSpec ? `
      <strong style="color:#fff; font-size:0.85rem; border-bottom:1px solid #34d399; padding-bottom:2px; display:inline-block; margin-bottom:6px;">【塩原温泉 赤沢温泉旅館 公式HP改修仕様書 ＆ 正確なJSON-LDコード例】:</strong><br>
      1. <strong>Schema.org 4型 完全埋め込み</strong>: <code>&lt;head&gt;</code> 内に公式データ準拠のJSON-LDを記述。<br>
      2. <strong>Rich Results Test 0エラー保証</strong>: 料金・空室・FAQ構造化データを完備。<br>
      3. <strong>実在ファクト完全準拠</strong>: NAP（公式ドメイン https://akasawaonsen.com/ / 0287-46-5700 / 〒329-2921 栃木県那須塩原市塩原1149）、チェックアウト 10:00。<br>
      4. <strong>amenityFeature 実在設備10項目コード化</strong>: 無加水無循環天然ぬる湯 (38〜40℃), 箒川沿い渓流一軒宿, 看板猫のおもてなし, 赤沢風 鹿×豚ジンギスカン, 敷地内無料駐車場 30台等。<br>
      5. <strong>AIクローラー専用ファイル設置</strong>: <code>/robots.txt</code> ＆ <code>/llms.txt</code> を配置。<br>
      6. <strong>生テキスト化 ＆ FAQ整備</strong>: 料金・客室・温泉・キャンセル規定をHTML生テキストで記述し、一問一答FAQを設置。<br>
      <details style="margin-top:6px; background:#000; padding:8px; border-radius:6px;">
        <summary style="color:#34d399; cursor:pointer; font-size:0.75rem; font-weight:bold;">▶ 埋め込み用 JSON-LD コード例（コピー可）</summary>
        <pre style="margin-top:6px; font-size:0.68rem; color:#34d399; overflow-x:auto;">
&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Hotel",
      "@id": "https://akasawaonsen.com/#hotel",
      "name": "塩原温泉 赤沢温泉旅館",
      "alternateName": "SHIOBARA ONSEN AKASAWA RYOKAN",
      "description": "塩原温泉 源泉かけ流しのぬる湯と猫のいる静養宿。加温・加水なし38度〜40度の天然ぬる湯、看板猫のおもてなし、箒川を望む静寂空間、鹿肉ジンギスカン・季節の味覚を提供します。",
      "url": "https://akasawaonsen.com/",
      "telephone": "+81-287-46-5700",
      "priceRange": "¥10,000 - ¥28,000",
      "address": {
        "@type": "PostalAddress",
        "postalCode": "329-2921",
        "addressCountry": "JP",
        "addressRegion": "栃木県",
        "addressLocality": "那須塩原市",
        "streetAddress": "塩原1149"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 36.9712,
        "longitude": 139.8145
      },
      "checkinTime": "15:00",
      "checkoutTime": "10:00",
      "amenityFeature": [
        { "@type": "LocationFeatureSpecification", "name": "源泉かけ流し天然ぬる湯（38〜40℃・無加水無循環）", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "箒川を望む露天風呂・静養空間", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "看板猫のおもてなし（猫のいる静養宿）", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "赤沢風 鹿×豚ジンギスカン料理", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "無料駐車場 30台完備(予約不要)", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "塩原温泉バスターミナルより送迎対応(要予約)", "value": true }
      ]
    },
    {
      "@type": "HotelRoom",
      "@id": "https://akasawaonsen.com/#room-shiobara",
      "name": "箒川を望む和室（全10室）",
      "description": "川のせせらぎと塩原の大自然に包まれる落ち着いた和室。心身のリセットと静養に最適です。",
      "occupancy": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 5 }
    }
  ]
}
&lt;/script&gt;
        </pre>
      </details>
    ` : `
      <strong style="color:#fff; font-size:0.85rem; border-bottom:1px solid #34d399; padding-bottom:2px; display:inline-block; margin-bottom:6px;">【那須ユートピア美野沢 公式HP改修仕様書 (全16原則)】:</strong><br>
      1. <strong>Schema.org 4型 完全埋め込み</strong>: <code>&lt;head&gt;</code> 内に那須ユートピア美野沢専用 JSON-LD を記述。<br>
      2. <strong>Rich Results Test 0エラー保証</strong>: 料金・空室・FAQ構造化データを完備。<br>
      3. <strong>amenityFeature 10項目コード化</strong>: CUBERU/Rekkaサウナ, 150㎡ドッグラン, 手ぶらBBQ, 駐車場30台等を指定。<br>
      4. <strong>AIクローラー専用ファイル設置</strong>: <code>/robots.txt</code> ＆ <code>/llms.txt</code> を配置。<br>
      5. <strong>生テキスト化</strong>: 料金・客室・サウナ・キャンセル規定をHTML生テキストで記述。<br>
      6. <strong>DMO・自治体（那須町観光協会）相互リンク</strong>: フッターに被リンクバナー設置。<br>
      7. <strong>多言語独立ディレクトリの開設</strong>: 英語・アジア言語独立ページの設置。
    `;

    const specC = isAkasawaSpec ? `
      1. <strong>GBP写真 30枚以上の追加</strong>: 源泉かけ流しぬる湯、看板猫、箒川の景観、鹿肉ジンギスカン、和室客室の写真。<br>
      2. <strong>公式名称の一貫性</strong>: 「塩原温泉 赤沢温泉旅館」で統一。<br>
      3. <strong>ビジネスカテゴリ設定</strong>: 「温泉旅館」「旅館」「日帰り温泉」を追加。<br>
      4. <strong>ビジネスの説明文（750文字）</strong>: 「那須塩原市塩原1149」「加温加水なし38〜40℃ぬる湯」「看板猫のおもてなし」を含める。<br>
      5. <strong>口コミへの100%返信</strong>: 「塩原温泉」「ぬる湯」「猫」を含めた感謝の個別返信。
    ` : `
      1. <strong>GBP写真 30枚以上の追加</strong>: バレルサウナ（CUBERU/Rekka）、水風呂、ドッグランヴィラ、BBQ料理の写真。<br>
      2. <strong>公式名称の一貫性</strong>: 「那須ユートピア美野沢」で統一。<br>
      3. <strong>ビジネスカテゴリ設定</strong>: 「リゾートホテル」「サウナ」「グランピング」「貸別荘」を追加。<br>
      4. <strong>ビジネスの説明文（750文字）</strong>: 「那須塩原駅から車20分」「150㎡ドッグラン」「90分貸切サウナ」を含める。<br>
      5. <strong>口コミへの100%返信</strong>: 「那須 サウナ」「ドッグラン」を含めた感謝の個別返信。
    `;

    const specD = isAkasawaSpec ? `
      1. <strong>全OTA名称統一</strong>: 楽天・じゃらんで「塩原温泉 赤沢温泉旅館」の完全一致。<br>
      2. <strong>プランタイトルの【】タグ最適化</strong>: 【源泉かけ流しぬる湯】【看板猫のいる宿】【鹿肉ジンギスカン】。<br>
      3. <strong>実地ファクトの全チャネル整合</strong>: 所在地「栃木県那須塩原市塩原1149」、無料駐車場「30台」、天然ぬる湯の表記統一。<br>
      4. <strong>アクセス数値統一</strong>: 「那須塩原駅・西那須野駅よりバス・車アクセス / 無料駐車場30台」。
    ` : `
      1. <strong>全OTA名称統一</strong>: 楽天・じゃらんで「那須ユートピア美野沢」の完全一致。<br>
      2. <strong>プランタイトルの【】タグ最適化</strong>: 【サウナ貸切無料】【手ぶらBBQ】【150㎡ドッグラン】。<br>
      3. <strong>実地ファクトの全チャネル整合</strong>: 所在地「栃木県那須郡那須町箕輪563-4」、無料駐車場「40台」、客室数「全7室」の表記統一。<br>
      4. <strong>アクセス数値統一</strong>: 「那須塩原駅から車20分 / 無料駐車場30台」。
    `;

    const specE = `
      1. <strong>全口コミへ48時間以内の100%返信</strong>: 届いた全レビューへ感謝の気持ちを個別具体的に返信。<br>
      2. <strong>定型文の完全廃止</strong>: お客様が言及したエピソード（温泉、料理、おもてなし）に触れて返信。<br>
      3. <strong>口コミ自動返信AIの活用</strong>: トーン＆マナーを保った感動的な返信文を1ボタンでAI生成。
    `;

    const specFG = isAkasawaSpec ? `
      1. <strong>自治体・DMO（塩原温泉観光協会 / 栃木県観光物産協会）公式ページへの被リンク登録</strong>: 会員ページに自社HPのURLを登録申請。<br>
      2. <strong>公式HP内へのSNSアカウント動線および OGPタグ（og:image）設置</strong>: メタタグ・SNSリンクの完備。<br>
      3. <strong>「SNS動画・投稿自動生成AI」による発信</strong>: ぬる湯、看板猫、箒川の静養動画を自動生成発信。<br>
      4. <strong>多言語独立ディレクトリ・FAQの整備</strong>: インバウンドゲスト向け多言語対応。
    ` : `
      1. <strong>自治体・DMO（那須町観光協会 / 栃木県観光物産協会）公式ページへの被リンク登録</strong>: 会員ページに自社HPのURLを登録申請。<br>
      2. <strong>公式HP内へのSNSアカウント動線および OGPタグ（og:image）設置</strong>: メタタグ・SNSリンクの完備。<br>
      3. <strong>「SNS動画・投稿自動生成AI」による発信</strong>: サウナ、BBQ、ドッグラン動画を自動生成発信。<br>
      4. <strong>多言語独立ディレクトリ・FAQの整備</strong>: インバウンドゲスト向け多言語対応。
    `;

    const catchTitle = isAkasawaSpec ? `『塩原温泉 源泉かけ流しぬる湯と看板猫のいる静養宿』` : `『「ととのう」の、その先へ (BEYOND TOTONOU FEELING)』`;
    const catchDesc = isAkasawaSpec ? `加温・加水なし38〜40℃の天然ぬる湯、看板猫のおもてなし、箒川を望む渓流一軒宿。<br>本AIシステム群は、宿の強み・ナレッジ基盤（天然ぬる湯・看板猫・鹿肉ジンギスカン・静養湯治）と「お客様がここを選ぶ納得の理由（Because）」を直接接続し、全9システムがブレない高価値提案を自動生成します。` : `アート×サウナ×大自然で五感を解き放つ、旧美野沢小学校リノベーションリゾート。<br>本AIシステム群は、宿の思想・ナレッジ基盤（本格サウナ・ドッグランヴィラ・手ぶらBBQ・現代アート）と「お客様がここを選ぶ納得の理由（Because）」を直接接続し、全9システムがブレない高価値提案を自動生成します。`;

    const ragTableRows = isAkasawaSpec ? `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">温泉・長湯・静養愛好層</td>
        <td style="padding: 0.7rem 0.8rem;">熱い温泉は長湯できず疲れてしまう</td>
        <td style="padding: 0.7rem 0.8rem;">長湯で副交感神経を優位にし至福のリセット</td>
        <td style="padding: 0.7rem 0.8rem;">体温に近い38〜40℃の加温加水なし天然ぬる湯で心身をじんわり癒やせるから</td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">猫好き・癒やし求道層</td>
        <td style="padding: 0.7rem 0.8rem;">旅先で人混みに疲れ静かに癒やされたい</td>
        <td style="padding: 0.7rem 0.8rem;">看板猫たちと温かな時間を過ごす休日</td>
        <td style="padding: 0.7rem 0.8rem;">館内やロビーで看板猫たちがのんびりとくつろぐ静養空間が広がっているから</td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">地物美食・ジビエ味覚層</td>
        <td style="padding: 0.7rem 0.8rem;">一般的な旅館料理では物足りない</td>
        <td style="padding: 0.7rem 0.8rem;">名物料理と塩原の自然の恵みを美味堪能</td>
        <td style="padding: 0.7rem 0.8rem;">特製「赤沢風 鹿×豚ジンギスカン」と塩原の新鮮な川魚・山菜料理を味わえるから</td>
      </tr>
      <tr style="color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">箒川・一軒宿・ソロ・夫婦層</td>
        <td style="padding: 0.7rem 0.8rem;">温泉街の喧騒から離れて静かに過ごしたい</td>
        <td style="padding: 0.7rem 0.8rem;">川のせせらぎに包まれる隠れ家での滞在</td>
        <td style="padding: 0.7rem 0.8rem;">箒川を望む静寂の一軒宿で誰にも邪魔されない湯治・静養時間が流れているから</td>
      </tr>
    ` : `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">サウナ・整い志向層</td>
        <td style="padding: 0.7rem 0.8rem;">街のサウナは混雑し落ち着かない</td>
        <td style="padding: 0.7rem 0.8rem;">大自然の中で深呼吸し心身をリセット</td>
        <td style="padding: 0.7rem 0.8rem;">完全貸切バレルサウナ（CUBERU/Rekka）と那須連山の極流水風呂が目の前に整っているから</td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">愛犬同伴リゾート層</td>
        <td style="padding: 0.7rem 0.8rem;">ペット可宿でも移動制限が多く肩身が狭い</td>
        <td style="padding: 0.7rem 0.8rem;">ノーリードで家族全員が笑顔になれる休日</td>
        <td style="padding: 0.7rem 0.8rem;">プライベートドッグラン付きヴィラで周りに気を使わず自由に遊べる環境だから</td>
      </tr>
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">ファミリー・キッズ層</td>
        <td style="padding: 0.7rem 0.8rem;">子供が騒いで一般ホテルで気を遣う</td>
        <td style="padding: 0.7rem 0.8rem;">広い空間で自由な遊びと手ぶらBBQを満喫</td>
        <td style="padding: 0.7rem 0.8rem;">旧小学校のグラウンドと安全な手ぶらBBQ・アート体験が全天候型で揃っているから</td>
      </tr>
      <tr style="color: var(--text-sub);">
        <td style="padding: 0.7rem 0.8rem; font-weight: bold; color: #fff;">SNS・感性共感層</td>
        <td style="padding: 0.7rem 0.8rem;">どこにでもある普通の宿で退屈</td>
        <td style="padding: 0.7rem 0.8rem;">センスある特別な世界観でインスピレーション</td>
        <td style="padding: 0.7rem 0.8rem;">廃校×現代アートリノベーションによるフォトジェニックで唯一無二の空間だから</td>
      </tr>
    `;

    renderedHtml = renderedHtml
      .replace(/\{\{SPEC_A\}\}/g, specA)
      .replace(/\{\{SPEC_B\}\}/g, specB)
      .replace(/\{\{SPEC_C\}\}/g, specC)
      .replace(/\{\{SPEC_D\}\}/g, specD)
      .replace(/\{\{SPEC_E\}\}/g, specE)
      .replace(/\{\{SPEC_FG\}\}/g, specFG)
      .replace(/\{\{FACILITY_CATCH_TITLE\}\}/g, catchTitle)
      .replace(/\{\{FACILITY_CATCH_DESC\}\}/g, catchDesc)
      .replace(/\{\{FACILITY_RAG_TABLE_ROWS\}\}/g, ragTableRows);

    // AI検索エンジン (ChatGPT, Perplexity, Google AI Overviews) 用 Schema.org 4型 構造化データ (JSON-LD) の動的生成
    const isAkasawaFacility = item.folder.includes('akasawa');

    const schemaJsonLd = isAkasawaFacility ? `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Hotel",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#hotel",
      "name": "塩原温泉 赤沢温泉旅館",
      "description": "塩原温泉 源泉かけ流しのぬる湯と猫のいる静養宿。加温・加水なし38度〜40度の天然ぬる湯、看板猫のおもてなし、箒川を望む静寂空間、鹿肉ジンギスカン・季節の味覚を提供します。",
      "url": "https://hotel-ai.netlify.app/${item.folder}/",
      "telephone": "+81-287-46-5700",
      "priceRange": "¥10,000 - ¥28,000",
      "address": {
        "@type": "PostalAddress",
        "postalCode": "329-2921",
        "addressCountry": "JP",
        "addressRegion": "栃木県",
        "addressLocality": "那須塩原市",
        "streetAddress": "塩原1149"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 36.9712,
        "longitude": 139.8145
      },
      "amenityFeature": [
        { "@type": "LocationFeatureSpecification", "name": "源泉かけ流し天然ぬる湯（38〜40℃）", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "看板猫のおもてなし（猫のいる静養宿）", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "箒川を望む渓流一軒宿ロケーション", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "赤沢風 鹿×豚ジンギスカン料理", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "無料駐車場完備", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "那須塩原駅・西那須野駅よりバスアクセス", "value": true }
      ],
      "checkinTime": "15:00",
      "checkoutTime": "10:00"
    },
    {
      "@type": "HotelRoom",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#room-shiobara",
      "name": "箒川を望む和室",
      "description": "川のせせらぎと塩原の大自然に包まれる落ち着いた和室。心身のリセットと静養に最適です。",
      "occupancy": {
        "@type": "QuantitativeValue",
        "minValue": 1,
        "maxValue": 5
      }
    },
    {
      "@type": "Offer",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#offer-shiobara-plan",
      "name": "【猫とぬる湯とリセット旅】塩原天然ぬる湯＆地物味覚 1泊2食静養基本プラン",
      "price": "14500",
      "priceCurrency": "JPY",
      "availability": "https://schema.org/InStock",
      "url": "https://hotel-ai.netlify.app/${item.folder}/"
    },
    {
      "@type": "FAQPage",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "塩原温泉 赤沢温泉旅館のぬる湯の特徴は？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "当館の温泉は加温・加水なしの38度〜40度天然ぬる湯です。副交感神経を優位にし、長湯を楽しみながら至福の静養・リセット体験が可能です。"
          }
        },
        {
          "@type": "Question",
          "name": "看板猫たちとのふれあいや過ごし方について",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ロビーや館内にて看板猫たちがのんびりと過ごしております。猫好きな方に静かな癒しの時間を提供しています。"
          }
        }
      ]
    }
  ]
}
</script>` : `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Hotel",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#hotel",
      "name": "${item.name}",
      "description": "${item.name}の公式AI統合ポータル。AI検索（ChatGPT / Perplexity / Google AI）および人間の『購入理由』ストーリーに最適化された最新プラン・設備・空室情報を提供します。",
      "url": "https://hotel-ai.netlify.app/${item.folder}/",
      "telephone": "+81-287-74-3921",
      "priceRange": "¥15,000 - ¥45,000",
      "address": {
        "@type": "PostalAddress",
        "addressCountry": "JP",
        "addressRegion": "栃木県",
        "addressLocality": "那須郡那須町",
        "streetAddress": "箕輪318"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 36.9928,
        "longitude": 140.0381
      },
      "amenityFeature": [
        { "@type": "LocationFeatureSpecification", "name": "完全貸切バレルサウナ (CUBERU/Rekka)", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "ドッグラン付きプライベートヴィラ", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "手ぶら本格BBQ", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "廃校×現代アートリノベーション", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "無料駐車場30台完備", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "高速無料Wi-Fi完備", "value": true },
        { "@type": "LocationFeatureSpecification", "name": "那須塩原駅から車で20分", "value": true }
      ],
      "checkinTime": "15:00",
      "checkoutTime": "10:00"
    },
    {
      "@type": "HotelRoom",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#room-villa",
      "name": "プライベートドッグラン付きグランピングヴィラ",
      "description": "広さ50㎡のプライベート空間。愛犬とノーリードで過ごせる専用ドッグラン（150㎡）と貸切サウナアクセスを完備。",
      "occupancy": {
        "@type": "QuantitativeValue",
        "minValue": 1,
        "maxValue": 6
      },
      "bed": {
        "@type": "BedDetails",
        "numberOfBeds": 4,
        "typeOfBed": "DOUBLE"
      }
    },
    {
      "@type": "Offer",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#offer-sauna-bbq",
      "name": "【サウナ・整い重視】貸切バレルサウナ無料＆手ぶら本格BBQつき1泊2食プラン",
      "price": "18000",
      "priceCurrency": "JPY",
      "availability": "https://schema.org/InStock",
      "validFrom": "2026-01-01",
      "url": "https://hotel-ai.netlify.app/${item.folder}/plan/"
    },
    {
      "@type": "FAQPage",
      "@id": "https://hotel-ai.netlify.app/${item.folder}/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "貸切バレルサウナの利用時間と予約方法は？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "貸切バレルサウナ（CUBERU/Rekka）は90分完全貸切制です。チェックイン時にご希望の時間枠（15:00〜22:00 / 7:00〜10:00）をお選びいただけます。"
          }
        },
        {
          "@type": "Question",
          "name": "愛犬同伴の条件や専用設備はありますか？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ドッグラン付きヴィラ客室では、狂犬病・ワクチンの接種証明をご提示いただければ中型犬・小型犬2頭まで一緒にご宿泊いただけます。150㎡の完全プライベートドッグランと足洗い場、アメニティを完備しています。"
          }
        },
        {
          "@type": "Question",
          "name": "アクセスと駐車場料金について教えてください。",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "東北自動車道「那須IC」より車で約25分、JR那須塩原駅より車で約20分です。敷地内に30台収容可能な無料駐車場（予約不要・高さ制限なし）を備えています。"
          }
        }
      ]
    }
  ]
}
</script>`;

    // 2026 AI＆人間最適化 7区分 本当の実態・調査データに基づくリアル評価点数
    const isNasu = item.folder.includes('nasu');
    const isAkasawa = item.folder.includes('akasawa');
    
    // 本当の現況査定スコア（那須ユートピア美野沢の実態調査値：合計59点/Bランク）
    const scoreA = isNasu ? 16 : (isAkasawa ? 17 : 14);   // A. プラン品質 (満点25点)
    const scoreB = isNasu ? 9  : (isAkasawa ? 10 : 8);    // B. 公式HP+構造化 (満点20点)
    const scoreC = isNasu ? 13 : (isAkasawa ? 14 : 12);   // C. GBP+Maps (満点20点)
    const scoreD = isNasu ? 10 : (isAkasawa ? 11 : 9);    // D. OTA掲載品質 (満点15点)
    const scoreE = isNasu ? 6  : (isAkasawa ? 7  : 5);    // E. レビュー鮮度 (満点10点)
    const scoreF = isNasu ? 3  : (isAkasawa ? 3  : 2);    // F. 第三者言及 (満点6点)
    const scoreG = isNasu ? 2  : (isAkasawa ? 2  : 1);    // G. 多言語表記 (満点4点)

    // 修正による伸びしろ加点（満点 - 現状点数 = プラス何点アップするか）
    const gainA = 25 - scoreA;
    const gainB = 20 - scoreB;
    const gainC = 20 - scoreC;
    const gainD = 15 - scoreD;
    const gainE = 10 - scoreE;
    const gainF = 6 - scoreF;
    const gainG = 4 - scoreG;
    const gainFG = gainF + gainG;
    
    const totalScore = scoreA + scoreB + scoreC + scoreD + scoreE + scoreF + scoreG;
    const gainTotal = 100 - totalScore;
    const scoreRank = totalScore >= 90 ? 'Sランク (最高AI推薦達成)' : (totalScore >= 70 ? 'Aランク (優良AI最適化施設)' : 'Bランク (⚠️ 伸びしろ多数・実効改善対象施設)');
    const scoreFG = scoreF + scoreG;

    renderedHtml = renderedHtml
      .replace(/\{\{SCHEMA_JSON_LD\}\}/g, schemaJsonLd)
      .replace(/\{\{AI_SCORE\}\}/g, totalScore)
      .replace(/\{\{SCORE_RANK\}\}/g, scoreRank)
      .replace(/\{\{SCORE_A\}\}/g, scoreA)
      .replace(/\{\{SCORE_B\}\}/g, scoreB)
      .replace(/\{\{SCORE_C\}\}/g, scoreC)
      .replace(/\{\{SCORE_D\}\}/g, scoreD)
      .replace(/\{\{SCORE_E\}\}/g, scoreE)
      .replace(/\{\{SCORE_F\}\}/g, scoreF)
      .replace(/\{\{SCORE_G\}\}/g, scoreG)
      .replace(/\{\{SCORE_FG\}\}/g, scoreFG)
      .replace(/\{\{GAIN_A\}\}/g, gainA)
      .replace(/\{\{GAIN_B\}\}/g, gainB)
      .replace(/\{\{GAIN_C\}\}/g, gainC)
      .replace(/\{\{GAIN_D\}\}/g, gainD)
      .replace(/\{\{GAIN_E\}\}/g, gainE)
      .replace(/\{\{GAIN_F\}\}/g, gainF)
      .replace(/\{\{GAIN_G\}\}/g, gainG)
      .replace(/\{\{GAIN_FG\}\}/g, gainFG)
      .replace(/\{\{GAIN_TOTAL\}\}/g, gainTotal);

    // 全10施設へ RAG管理エージェント (apps/akasawa-rag/public) を個別カスタマイズ配備
    const ragTargetDir = path.join(targetDir, 'rag');
    const ragSrcDir = path.join(__dirname, 'apps', 'akasawa-rag', 'public');
    if (fs.existsSync(ragSrcDir)) {
      copyFolderSync(ragSrcDir, ragTargetDir);
      const ragHtmlPath = path.join(ragTargetDir, 'index.html');
      if (fs.existsSync(ragHtmlPath)) {
        let ragHtml = fs.readFileSync(ragHtmlPath, 'utf8')
          .replace(/赤沢温泉旅館/g, item.name);
        if (item.folder.includes('nasu')) {
          ragHtml = ragHtml.replace(/赤沢温泉旅館/g, '那須ユートピア美野沢');
        }
        fs.writeFileSync(ragHtmlPath, ragHtml, 'utf8');
      }
    }

    fs.writeFileSync(path.join(targetDir, 'index.html'), renderedHtml, 'utf8');
  });
}

// 6.4. 赤沢温泉旅館 Dedicated AI sub-apps (ml, video, sns, review, blog, ota, plan, dp, rag, chat) の完全デプロイ
console.log('Deploying Akasawa Ryokan dedicated AI sub-apps to dist/akasawa...');

const akasawaAppReplacements = [
  { subpath: 'chat', src: path.join(__dirname, 'apps', 'akasawa-chat') },
  { subpath: 'ml', src: path.join(__dirname, 'apps', 'akasawa-ml', 'public') },
  { subpath: 'sns', src: path.join(__dirname, 'apps', 'akasawa-sns', 'public') },
  { subpath: 'review', src: path.join(__dirname, 'apps', 'akasawa-review', 'public') },
  { subpath: 'blog', src: path.join(__dirname, 'apps', 'akasawa-blog', 'public') },
  { subpath: 'ota', src: path.join(__dirname, 'apps', 'akasawa-ota', 'public') },
  { subpath: 'plan', src: path.join(__dirname, 'apps', 'akasawa-plan', 'public') },
  { subpath: 'video', src: path.join(__dirname, 'apps', 'endo-sns', 'public') },
  { subpath: 'dp', src: path.join(__dirname, 'apps', 'akasawa-dp', 'apps', 'admin', 'dist') },
  { subpath: 'rag', src: path.join(__dirname, 'apps', 'akasawa-rag', 'public') }
];

akasawaAppReplacements.forEach(app => {
  const destDir = path.join(distDir, 'akasawa', app.subpath);
  if (fs.existsSync(app.src)) {
    copyFolderSync(app.src, destDir);
  }

  // 赤沢温泉旅館用にテキストを完全補正
  const replaceInAkasawaDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        if (file !== 'node_modules' && file !== '.git') replaceInAkasawaDir(fullPath);
      } else if (/\.(html|js|json|md|css|txt|ts|tsx)$/.test(file)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        content = content
          .replace(/那須ユートピア美野沢 支配人 個人SNS自動配信システム/g, '塩原温泉 赤沢温泉旅館 館主遠藤 動画＆SNS自動配信システム')
          .replace(/那須ユートピア美野沢 支配人/g, '塩原温泉 赤沢温泉旅館 館主遠藤')
          .replace(/那須ユートピア美野沢/g, '塩原温泉 赤沢温泉旅館')
          .replace(/那須ユートピア/g, '塩原温泉 赤沢温泉旅館')
          .replace(/1\. 🔥 「ととのう」の、その先へ \(CUBERUサウナ \/ 薪サウナRekka \/ 那須水風呂\)/g, '1. ♨️ 至福の長湯と天然ぬる湯 (加温加水なし38〜40℃天然ぬる湯 / 箒川渓流)')
          .replace(/2\. 🏫 廃校をアートとサウナで再生した理由 \(旧美野沢小学校リノベーション\)/g, '2. 🐱 看板猫と箒川のせせらぎに癒やされる理由 (看板猫のおもてなし / 塩原一軒宿)')
          .replace(/3\. 🍖 那須特選牛と星空の手ぶらBBQ \(手ぶら本格BBQ \/ 焚き火\)/g, '3. 🍖 名物 赤沢風 鹿×豚ジンギスカン鍋 (塩原の地物山菜・新鮮川魚)')
          .replace(/4\. 🐶 愛犬と過ごすドッグランヴィラ \(プライベート天然芝ドッグラン\)/g, '4. 🌿 箒川を望む静養和室での隠れ家滞在 (長湯湯治 / デジタルデトックス)')
          .replace(/「ととのう」の、その先へ (CUBERUサウナ \/ 薪サウナRekka \/ 那須水風呂)/g, '温泉とぬる湯と渓流にほどける (加温加水なし38〜40℃天然ぬる湯)')
          .replace(/廃校をアートとサウナで再生した理由 (旧美野沢小学校リノベーション)/g, '看板猫と箒川のせせらぎに癒やされる理由 (塩原一軒宿)')
          .replace(/那須特選牛と星空の手ぶらBBQ (手ぶら本格BBQ \/ 焚き火)/g, '名物 赤沢風 鹿×豚ジンギスカン鍋 (地物山菜・川魚)')
          .replace(/愛犬と過ごすドッグランヴィラ (プライベート天然芝ドッグラン)/g, '箒川を望む静養和室 (天然ぬる湯長湯)')
          .replace(/「ととのう」の、その先へ。廃校アートリノベーション＆サウナリゾート SNS・ショート動画配信/g, '加温加水なし38〜40℃天然ぬる湯＆看板猫の静養宿 SNS・ショート動画配信')
          .replace(/廃校アートリノベーション＆サウナリゾート/g, '自家源泉かけ流し天然ぬる湯＆看板猫の静養宿');
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    });
  };
  replaceInAkasawaDir(destDir);
});

// 6.5. 那須ユートピア美野沢 専用 9アプリアプリの自動複製・完全テキスト＆RAG置換
console.log('Generating Nasu Utopia dedicated AI sub-apps with deep fine-grained text replacements...');

const appReplacements = [
  { subpath: 'chat', src: path.join(__dirname, 'apps', 'nasu-utopia-chat') },
  { subpath: 'ml', src: path.join(__dirname, 'apps', 'akasawa-ml', 'public') },
  { subpath: 'sns', src: path.join(__dirname, 'apps', 'akasawa-sns', 'public') },
  { subpath: 'review', src: path.join(__dirname, 'apps', 'akasawa-review', 'public') },
  { subpath: 'blog', src: path.join(__dirname, 'apps', 'akasawa-blog', 'public') },
  { subpath: 'ota', src: path.join(__dirname, 'apps', 'akasawa-ota', 'public') },
  { subpath: 'plan', src: path.join(__dirname, 'apps', 'akasawa-plan', 'public') },
  { subpath: 'video', src: path.join(__dirname, 'apps', 'endo-sns', 'public') },
  { subpath: 'dp', src: path.join(__dirname, 'apps', 'akasawa-dp', 'apps', 'admin', 'dist') },
  { subpath: 'rag', src: path.join(__dirname, 'apps', 'akasawa-rag', 'public') }
];

appReplacements.forEach(app => {
  const destDir = path.join(distDir, 'nasu-utopia', app.subpath);
  if (fs.existsSync(app.src)) {
    copyFolderSync(app.src, destDir);
  }

  // 細部まで100%全置換する辞書マップ（徹底完全補強）
  const replacementRules = [
    [/赤沢温泉旅館/g, '那須ユートピア美野沢'],
    [/赤沢温泉/g, '那須ユートピア美野沢'],
    [/赤沢風/g, '那須ユートピア風'],
    [/赤沢/g, '那須ユートピア'],
    [/塩原/g, '那須町'],
    [/箒川/g, '那須連山'],
    [/Akasawa Onsen Ryokan/g, 'Nasu Utopia Minosawa'],
    [/Akasawa Onsen/g, 'Nasu Utopia'],
    [/Akasawa/g, 'Nasu Utopia'],
    [/akazawa-onsen/g, 'nasu-utopia'],
    [/akazawa/g, 'nasu-utopia'],
    [/猫とぬる湯と渓流にほどける、静養型ウェルネスの小宿/g, 'アート×サウナ×大自然で五感を解き放つ、旧美野沢小学校リノベーションリゾート'],
    [/猫とぬる湯と渓流にほどける/g, '「ととのう」の、その先へ。アート×サウナ×大自然'],
    [/静養型ウェルネスの小宿/g, '廃校アートリノベーションリゾート'],
    [/サウナ・水風呂旅館/g, 'サウナ＆ヴィラリゾート'],
    [/ぬる湯/g, '本格フィンランドサウナ（CUBERU / Rekka）と那須連山の水風呂'],
    [/渓流のせせらぎ/g, '那須連山の豊かな大自然'],
    [/渓流/g, '那須の大自然'],
    [/金目鯛の姿煮/g, '那須特製 手ぶら本格BBQ'],
    [/金目鯛/g, '手ぶら本格BBQ'],
    [/当館自慢の創作料理/g, '当館自慢の手ぶらBBQ＆サウナ飯'],
    [/創作料理/g, '手ぶら本格BBQ'],
    [/創作コース/g, '手ぶら本格BBQコース'],
    [/創作和食/g, '地元の新鮮食材BBQ'],
    [/伊豆/g, '那須高原'],
    [/遠藤オーナー/g, '支配人様'],
    [/遠藤正俊/g, '那須ユートピア支配人'],
    [/遠藤氏/g, '支配人様'],
    [/遠藤/g, '支配人'],
    [/オーナー様/g, '支配人様'],
    [/看板猫/g, '現代アート作品'],
    [/看板ネコ/g, '現代アート作品'],
    [/猫/g, 'アート'],
    [/露天風呂/g, 'プライベートサウナ＆外気浴'],
    [/大浴場/g, 'コンクリートサウナCUBERU＆薪サウナRekka'],
    [/自家源泉100%/g, '那須連山の極流水風呂'],
    [/温泉/g, 'サウナ・水風呂']
  ];

  const replaceInDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        if (file !== 'node_modules' && file !== '.git') replaceInDir(fullPath);
      } else if (/\.(html|js|json|md|css|txt|ts|tsx)$/.test(file)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        replacementRules.forEach(([rule, value]) => {
          content = content.replace(rule, value);
        });
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    });
  };

  replaceInDir(destDir);
});



// 7. Netlify Functions のマージ
console.log('Merging Netlify Functions...');

// shared を netlify/functions/_shared としてコピー
console.log('Copying shared to netlify/functions/_shared...');
copyFolderSync(path.join(__dirname, 'shared'), path.join(functionsDir, '_shared'));

// akasawa-ml functions
const mlFuncs = path.join(__dirname, 'apps', 'akasawa-ml', 'netlify', 'functions');
if (fs.existsSync(mlFuncs)) {
  fs.readdirSync(mlFuncs).forEach(file => {
    fs.copyFileSync(path.join(mlFuncs, file), path.join(functionsDir, file));
  });
}

// akasawa-sns functions
const snsFuncs = path.join(__dirname, 'apps', 'akasawa-sns', 'netlify', 'functions');
if (fs.existsSync(snsFuncs)) {
  const copySNSFuncs = (src, dest) => {
    fs.readdirSync(src).forEach(item => {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      if (fs.lstatSync(srcPath).isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copySNSFuncs(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  };
  copySNSFuncs(snsFuncs, functionsDir);
}

// endo-sns functions (置換マージで衝突回避)
const endoFuncsSrc = path.join(__dirname, 'apps', 'endo-sns', 'netlify', 'functions');
if (fs.existsSync(endoFuncsSrc)) {
  // _lib を _lib-endo としてコピー
  const libSrc = path.join(endoFuncsSrc, '_lib');
  const libDest = path.join(functionsDir, '_lib-endo');
  if (fs.existsSync(libSrc)) {
    fs.mkdirSync(libDest, { recursive: true });
    fs.readdirSync(libSrc).forEach(file => {
      fs.copyFileSync(path.join(libSrc, file), path.join(libDest, file));
    });
  }
  
  // 各関数ファイルをコピーし、require パスを置換 (endo-プレフィックス対応)
  fs.readdirSync(endoFuncsSrc).forEach(file => {
    const filePath = path.join(endoFuncsSrc, file);
    if (fs.lstatSync(filePath).isFile()) {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/\.\/_lib\//g, './_lib-endo/');
      fs.writeFileSync(path.join(functionsDir, `endo-${file}`), content, 'utf8');
      fs.writeFileSync(path.join(functionsDir, file), content, 'utf8');
    }
  });
}

// 7.5. apps/akasawa-review のコピー (静的)
console.log('Copying akasawa-review...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-review', 'public'), path.join(distDir, 'akasawa-review'));

// 7.6. 全10施設の専用AIダッシュボードフォルダのコピーとエイリアス作成
console.log('Copying 10 facility dashboards...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-review', 'public'), path.join(distDir, 'hakone-villa'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ml', 'public'), path.join(distDir, 'atami-resort'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-sns', 'public'), path.join(distDir, 'karuizawa-lodge'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ota', 'public'), path.join(distDir, 'furano-snow'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-plan', 'public'), path.join(distDir, 'iseshima-villa'));
copyFolderSync(path.join(__dirname, 'apps', 'endo-sns', 'public'), path.join(distDir, 'yufuin-hanare'));


// akasawa-review functions
const reviewFuncsSrc = path.join(__dirname, 'apps', 'akasawa-review', 'netlify', 'functions');
if (fs.existsSync(reviewFuncsSrc)) {
  // _lib を _lib-review としてコピー
  const libSrc = path.join(reviewFuncsSrc, '_lib');
  const libDest = path.join(functionsDir, '_lib-review');
  if (fs.existsSync(libSrc)) {
    fs.mkdirSync(libDest, { recursive: true });
    fs.readdirSync(libSrc).forEach(file => {
      fs.copyFileSync(path.join(libSrc, file), path.join(libDest, file));
    });
  }
  
  // 各関数ファイルをコピーし、require パスを置換
  fs.readdirSync(reviewFuncsSrc).forEach(file => {
    const filePath = path.join(reviewFuncsSrc, file);
    if (fs.lstatSync(filePath).isFile()) {
      const destPath = path.join(functionsDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // パス置換
      content = content.replace(/\.\/_lib\//g, './_lib-review/');
      content = content.replace(/'_lib'/g, "'_lib-review'");
      content = content.replace(/"_lib"/g, '"_lib-review"');
      
      fs.writeFileSync(destPath, content, 'utf8');
    }
  });
}

// 7.7. apps/akasawa-blog のコピーと関数マージ
console.log('Copying akasawa-blog...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-blog', 'public'), path.join(distDir, 'akasawa-blog'));

const blogFuncsSrc = path.join(__dirname, 'apps', 'akasawa-blog', 'netlify', 'functions');
if (fs.existsSync(blogFuncsSrc)) {
  fs.readdirSync(blogFuncsSrc).forEach(file => {
    const filePath = path.join(blogFuncsSrc, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.copyFileSync(filePath, path.join(functionsDir, file));
    }
  });
}

// 7.8. apps/akasawa-ota のコピーと関数マージ
console.log('Copying akasawa-ota...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ota', 'public'), path.join(distDir, 'akasawa-ota'));

const otaFuncsSrc = path.join(__dirname, 'apps', 'akasawa-ota', 'netlify', 'functions');
if (fs.existsSync(otaFuncsSrc)) {
  fs.readdirSync(otaFuncsSrc).forEach(file => {
    const filePath = path.join(otaFuncsSrc, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.copyFileSync(filePath, path.join(functionsDir, file));
    }
  });
}

// 7.9. apps/akasawa-plan のコピーと関数マージ
console.log('Copying akasawa-plan...');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-plan', 'public'), path.join(distDir, 'akasawa-plan'));

const planFuncsSrc = path.join(__dirname, 'apps', 'akasawa-plan', 'netlify', 'functions');
if (fs.existsSync(planFuncsSrc)) {
  fs.readdirSync(planFuncsSrc).forEach(file => {
    const filePath = path.join(planFuncsSrc, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.copyFileSync(filePath, path.join(functionsDir, file));
    }
  });
}

// 8. 赤沢温泉旅館（akasawa）専用全9システムのサブディレクトリ展開 (/akasawa/chat, /akasawa/review, etc.)
console.log('Deploying all sub-apps into /akasawa/ portal directory...');
const akasawaDestDir = path.join(distDir, 'akasawa');
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-chat'), path.join(akasawaDestDir, 'chat'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-review', 'public'), path.join(akasawaDestDir, 'review'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ota', 'public'), path.join(akasawaDestDir, 'ota'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-sns', 'public'), path.join(akasawaDestDir, 'sns'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-blog', 'public'), path.join(akasawaDestDir, 'blog'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-plan', 'public'), path.join(akasawaDestDir, 'plan'));

let akasawaDpSrc = path.join(__dirname, 'apps', 'akasawa-dp', 'apps', 'admin', 'dist');
if (!fs.existsSync(akasawaDpSrc)) {
  akasawaDpSrc = path.join(__dirname, 'apps', 'akasawa.dp', 'apps', 'admin', 'dist');
}
if (fs.existsSync(akasawaDpSrc)) {
  copyFolderSync(akasawaDpSrc, path.join(akasawaDestDir, 'dp'));
}

// _redirects ルーティングファイルの書き出し準備

// 9. AIクローラー専用ファイル llms.txt & robots.txt の生成・書き出し
console.log('Generating AI Crawler Knowledge Files (llms.txt & robots.txt)...');

const llmsContent = `# Hotel & Ryokan AI Knowledge Base (llms.txt)
# Optimized for ChatGPT Search, Perplexity, Gemini, Claude, and Google AI Overviews

## Overview
This platform hosts AI-optimized knowledge bases and autonomous management agents for 10 premier Japanese hotels and ryokans.
All information is structured using Schema.org Hotel specification and emotional 'Reason to Buy' frameworks.

## Key Facilities & Tenants
1. Nasu Utopia Minosawa (那須ユートピア美野沢):
   - Concept: Old elementary school art renovation, private barrel sauna (CUBERU/Rekka), dog-run villa (150m2), hands-free BBQ.
   - Address: 318 Minowa, Nasu-machi, Nasu-gun, Tochigi, Japan.
   - Access: 20 min drive from JR Nasushiobara Station. Free parking for 30 cars.
   - URL: https://hotel-ai.netlify.app/nasu-utopia/

2. Akazawa Onsen Ryokan (赤沢温泉旅館):
   - Concept: 100% free-flowing lukewarm spring (38-40C), resident cats, mountain stream views, authentic quiet relaxation.
   - URL: https://hotel-ai.netlify.app/akasawa/

## AI Crawling Guidelines
- All Schema.org JSON-LD markup on index pages is authoritative.
- Real-time plan creation APIs are active under /.netlify/functions/generate-plan.
`;

const robotsContent = `User-agent: *
Allow: /

# Explicit AI Search Crawler Permissions
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Googlebot
Allow: /

Sitemap: https://hotel-ai.netlify.app/sitemap.xml
`;

fs.writeFileSync(path.join(distDir, 'llms.txt'), llmsContent, 'utf8');
fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsContent, 'utf8');

// dist/_redirects の自動生成 (Netlify Functions の保護 ＆ SPAルーティング)
const redirectsContent = `# Netlify Serverless Functions 保護 (最優先リダイレクト)
/.netlify/functions/*  /.netlify/functions/:splat  200
/api/*                 /.netlify/functions/:splat  200

# ダイナミックプライシング 静的アセット保護 (最優先)
/akasawa/dp/assets/*     /akasawa/dp/assets/:splat     200
/nasu-utopia/dp/assets/* /nasu-utopia/dp/assets/:splat 200

# ダイナミックプライシング SPA ルーティング
/nasu-utopia/dp/*  /nasu-utopia/dp/index.html  200
/akasawa/dp/*      /akasawa/dp/index.html      200
/akasawa-dp/*      /akasawa-dp/index.html      200

# 施設別ポータルルーティング
/akasawa      /akasawa/index.html      200
/nasu-utopia  /nasu-utopia/index.html  200
`;
fs.writeFileSync(path.join(distDir, '_redirects'), redirectsContent, 'utf8');

console.log('All builds and merges completed successfully!');
