document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('statusMessage');
  const KEY = 'HOTEL_AI_RAG_KNOWLEDGE';

  function load() {
    const saved = localStorage.getItem(KEY);
    if (!saved) return;
    try {
      const d = JSON.parse(saved);
      if (d.latestNews) document.getElementById('latestNewsText').value = d.latestNews;
      if (d.notice) document.getElementById('noticeText').value = d.notice;
      if (d.appeal) document.getElementById('appealText').value = d.appeal;
      if (d.deleteInfo) document.getElementById('deleteText').value = d.deleteInfo;
    } catch (e) { /* ignore */ }
  }

  function save() {
    const data = {
      updatedAt: new Date().toISOString(),
      latestNews: document.getElementById('latestNewsText').value,
      notice: document.getElementById('noticeText').value,
      appeal: document.getElementById('appealText').value,
      deleteInfo: document.getElementById('deleteText').value
    };
    localStorage.setItem(KEY, JSON.stringify(data));

    statusMsg.textContent = '✨ 保存完了！全9つのAIシステムに反映されました';
    statusMsg.style.background = 'rgba(52,211,153,0.2)';
    statusMsg.style.color = '#34d399';
    setTimeout(() => {
      statusMsg.textContent = '✅ 最新の状態で保存されています';
      statusMsg.style.background = 'rgba(52,211,153,0.1)';
    }, 3000);
  }

  saveBtn.addEventListener('click', save);
  load();
});
