document.addEventListener('DOMContentLoaded', () => {
  // 言語切替
  const langBtn = document.querySelector('.lang-selector-btn');
  const langDropdown = document.querySelector('.lang-dropdown');
  const currentLangText = document.querySelector('.current-lang');

  if (langBtn && langDropdown) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle('active');
    });

    document.addEventListener('click', () => {
      langDropdown.classList.remove('active');
    });

    langDropdown.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedLang = btn.getAttribute('data-lang');
        applyLanguage(selectedLang);
        langDropdown.classList.remove('active');
      });
    });
  }

  function applyLanguage(lang) {
    if (!translations[lang]) return;
    const t = translations[lang];

    if (currentLangText) {
      const langNames = { ja: '日本語', en: 'English', zh: '简体中文', ko: '한국어' };
      currentLangText.textContent = langNames[lang] || '日本語';
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        el.textContent = t[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (t[key]) {
        el.setAttribute('placeholder', t[key]);
      }
    });
  }

  // Wi-Fiコピー処理
  document.querySelectorAll('.copyable').forEach(el => {
    el.addEventListener('click', () => {
      const textToCopy = el.getAttribute('data-copy') || el.textContent;
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert('コピーしました: ' + textToCopy);
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    });
  });
});
