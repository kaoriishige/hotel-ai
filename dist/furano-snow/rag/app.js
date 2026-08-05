document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('statusMessage');

  const STORAGE_KEY = 'NASU_UTOPIA_AI_RAG_KNOWLEDGE';

  // 保存されているナレッジデータの復元
  function loadKnowledge() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const data = JSON.parse(saved);
      if (data.mission) document.getElementById('missionText').value = data.mission;
      if (data.concept) document.getElementById('conceptText').value = data.concept;
      if (data.latestNews) document.getElementById('latestNewsText').value = data.latestNews;
      
      if (data.sauna) {
        if (data.sauna.job) document.getElementById('saunaJob').value = data.sauna.job;
        if (data.sauna.pain) document.getElementById('saunaPain').value = data.sauna.pain;
        if (data.sauna.because) document.getElementById('saunaBecause').value = data.sauna.because;
      }

      if (data.dog) {
        if (data.dog.job) document.getElementById('dogJob').value = data.dog.job;
        if (data.dog.pain) document.getElementById('dogPain').value = data.dog.pain;
        if (data.dog.because) document.getElementById('dogBecause').value = data.dog.because;
      }

      if (data.family) {
        if (data.family.job) document.getElementById('familyJob').value = data.family.job;
        if (data.family.pain) document.getElementById('familyPain').value = data.family.pain;
        if (data.family.because) document.getElementById('familyBecause').value = data.family.because;
      }

      if (data.art) {
        if (data.art.job) document.getElementById('artJob').value = data.art.job;
        if (data.art.pain) document.getElementById('artPain').value = data.art.pain;
        if (data.art.because) document.getElementById('artBecause').value = data.art.because;
      }
    } catch (e) {
      console.error('Failed to load saved RAG knowledge:', e);
    }
  }

  // ナレッジの保存
  function saveKnowledge() {
    const knowledge = {
      updatedAt: new Date().toISOString(),
      mission: document.getElementById('missionText').value,
      concept: document.getElementById('conceptText').value,
      latestNews: document.getElementById('latestNewsText').value,
      sauna: {
        job: document.getElementById('saunaJob').value,
        pain: document.getElementById('saunaPain').value,
        because: document.getElementById('saunaBecause').value
      },
      dog: {
        job: document.getElementById('dogJob').value,
        pain: document.getElementById('dogPain').value,
        because: document.getElementById('dogBecause').value
      },
      family: {
        job: document.getElementById('familyJob').value,
        pain: document.getElementById('familyPain').value,
        because: document.getElementById('familyBecause').value
      },
      art: {
        job: document.getElementById('artJob').value,
        pain: document.getElementById('artPain').value,
        because: document.getElementById('artBecause').value
      }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(knowledge));

    statusMsg.textContent = '✨ 保存完了！全AIシステムへ即時反映されました';
    statusMsg.style.background = 'rgba(52, 211, 153, 0.2)';
    statusMsg.style.color = '#34d399';

    setTimeout(() => {
      statusMsg.textContent = '✅ ナレッジは最新状態です';
    }, 3000);
  }

  saveBtn.addEventListener('click', saveKnowledge);
  loadKnowledge();
});
