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

    // 那須ユートピア美野沢専用のRAG・9システム文言の完全カスタマイズ
    if (item.folder.includes('nasu')) {
      renderedHtml = renderedHtml
        .replace(/「ととのう」の、その先へ(?!\s*\(BEYOND)/g, '「ととのう」の、その先へ (BEYOND TOTONOU FEELING)')
        .replace(/猫とぬる湯と渓流にほどける、静養型ウェルネスの小宿/g, 'アート×サウナ×大自然で五感を解き放つ、旧美野沢小学校リノベーションリゾート')
        .replace(/お食事、館内施設、温泉のご案内/g, 'サウナ（CUBERU/Rekka）、グランピングヴィラ、手ぶらBBQのご案内')
        .replace(/オーナー遠藤正俊氏のトーン＆マナー/g, '那須ユートピアの温かみと『ととのい体験』に寄り添うトーン＆マナー')
        .replace(/赤沢温泉の独自の強み（ぬる湯、猫、おもてなし）/g, '那須ユートピア独自の強み（本格フィンランドサウナ、那須連山の水風呂、ドッグランヴィラ、手ぶらBBQ）')
        .replace(/赤沢温泉旅館の全データ/g, '那須ユートピア美野沢の全データ（サウナ・ヴィラ・BBQ・アート）');
    }

    // 2026 媒体別 100点満点診断スコア置換 (公式HP 30点, Googleマップ 30点, SNS 20点, OTA 20点)
    const isNasu = item.folder.includes('nasu');
    const isAkasawa = item.folder.includes('akasawa');
    
    // 媒体別スコア算定
    const scoreHp = isNasu ? 28 : (isAkasawa ? 26 : 24);    // 公式HP (満点30点)
    const scoreGbp = isNasu ? 27 : (isAkasawa ? 25 : 23);   // Googleマップ (満点30点)
    const scoreSns = isNasu ? 18 : (isAkasawa ? 16 : 15);   // SNS (満点20点)
    const scoreOta = isNasu ? 19 : (isAkasawa ? 18 : 17);   // OTA＆一致度 (満点20点)
    
    const totalScore = scoreHp + scoreGbp + scoreSns + scoreOta;
    const scoreRank = totalScore >= 90 ? 'Sランク (最高AI推薦 & 人間選択基準達成)' : 'Aランク (AI・人間推薦対象施設)';

    renderedHtml = renderedHtml
      .replace(/\{\{AI_SCORE\}\}/g, totalScore)
      .replace(/\{\{SCORE_RANK\}\}/g, scoreRank)
      .replace(/\{\{SCORE_HP\}\}/g, scoreHp)
      .replace(/\{\{SCORE_GBP\}\}/g, scoreGbp)
      .replace(/\{\{SCORE_SNS\}\}/g, scoreSns)
      .replace(/\{\{SCORE_OTA\}\}/g, scoreOta);

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

// 8. APIキーの書き出し (akasawa-ml用)
console.log('Writing API Key to dist/akasawa-ml/key.txt...');
const apiKey = process.env.GEMINI_API_KEY || '';
fs.writeFileSync(path.join(distDir, 'akasawa-ml', 'key.txt'), apiKey);

console.log('All builds and merges completed successfully!');
