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
        .replace(/「ととのう」の、その先へ/g, '「ととのう」の、その先へ (BEYOND TOTONOU FEELING)')
        .replace(/猫とぬる湯と渓流にほどける、静養型ウェルネスの小宿/g, 'アート×サウナ×大自然で五感を解き放つ、旧美野沢小学校リノベーションリゾート')
        .replace(/お食事、館内施設、温泉のご案内/g, 'サウナ（CUBERU/Rekka）、グランピングヴィラ、手ぶらBBQのご案内')
        .replace(/オーナー遠藤正俊氏のトーン＆マナー/g, '那須ユートピアの温かみと『ととのい体験』に寄り添うトーン＆マナー')
        .replace(/赤沢温泉の独自の強み（ぬる湯、猫、おもてなし）/g, '那須ユートピア独自の強み（本格フィンランドサウナ、那須連山の水風呂、ドッグランヴィラ、手ぶらBBQ）')
        .replace(/赤沢温泉旅館の全データ/g, '那須ユートピア美野沢の全データ（サウナ・ヴィラ・BBQ・アート）');
    }

    fs.writeFileSync(path.join(targetDir, 'index.html'), renderedHtml, 'utf8');
  });
}

// 6.5. 那須ユートピア美野沢 専用 9アプリアプリの自動複製・完全テキスト＆RAG置換
console.log('Generating Nasu Utopia dedicated AI sub-apps...');

const appReplacements = [
  { prefix: 'nasu-utopia-chat', src: path.join(__dirname, 'apps', 'akasawa-chat') },
  { prefix: 'nasu-utopia-ml', src: path.join(__dirname, 'apps', 'akasawa-ml', 'public') },
  { prefix: 'nasu-utopia-sns', src: path.join(__dirname, 'apps', 'akasawa-sns', 'public') },
  { prefix: 'nasu-utopia-review', src: path.join(__dirname, 'apps', 'akasawa-review', 'public') },
  { prefix: 'nasu-utopia-blog', src: path.join(__dirname, 'apps', 'akasawa-blog', 'public') },
  { prefix: 'nasu-utopia-ota', src: path.join(__dirname, 'apps', 'akasawa-ota', 'public') },
  { prefix: 'nasu-utopia-plan', src: path.join(__dirname, 'apps', 'akasawa-plan', 'public') },
  { prefix: 'nasu-utopia-video', src: path.join(__dirname, 'apps', 'endo-sns', 'public') }
];

appReplacements.forEach(app => {
  const destDir = path.join(distDir, app.prefix);
  copyFolderSync(app.src, destDir);

  // コピーされたテキストファイル・HTML・JSの「赤沢温泉旅館」を「那須ユートピア美野沢」へ置換
  const replaceInDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.lstatSync(fullPath).isDirectory()) {
        if (file !== 'node_modules' && file !== '.git') replaceInDir(fullPath);
      } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.css')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        content = content.replace(/赤沢温泉旅館/g, '那須ユートピア美野沢');
        content = content.replace(/Akasawa Onsen Ryokan/g, 'Nasu Utopia Minosawa');
        content = content.replace(/Akasawa/g, 'Nasu Utopia');
        content = content.replace(/akazawa-onsen/g, 'nasu-utopia');
        content = content.replace(/猫とぬる湯と渓流にほどける/g, '「ととのう」の、その先へ。アート×サウナ×大自然');
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
copyFolderSync(path.join(__dirname, 'apps', 'nasumid-p'), path.join(distDir, 'nasu-utopia'));
copyFolderSync(path.join(__dirname, 'apps', 'nasumid-p'), path.join(distDir, 'nasu-utopia-ai'));
copyFolderSync(path.join(__dirname, 'apps', 'nasumid-p'), path.join(distDir, 'nasumid-p'));

copyFolderSync(path.join(__dirname, 'apps', 'akasawa-review', 'public'), path.join(distDir, 'hakone-villa'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ml', 'public'), path.join(distDir, 'atami-resort'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-sns', 'public'), path.join(distDir, 'karuizawa-lodge'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-chat'), path.join(distDir, 'kyoto-gion'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-ota', 'public'), path.join(distDir, 'furano-snow'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-plan', 'public'), path.join(distDir, 'iseshima-villa'));
copyFolderSync(path.join(__dirname, 'apps', 'endo-sns', 'public'), path.join(distDir, 'yufuin-hanare'));
copyFolderSync(path.join(__dirname, 'apps', 'akasawa-chat'), path.join(distDir, 'miyakojima-suite'));


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
