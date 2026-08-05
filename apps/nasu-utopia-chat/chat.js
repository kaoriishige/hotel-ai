document.addEventListener('DOMContentLoaded', () => {
  const chatForm = document.getElementById('inline-chat-form');
  const chatInput = document.getElementById('inline-chat-input');
  const chatMessages = document.getElementById('inline-chat-messages');

  if (!chatForm || !chatInput || !chatMessages) return;

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    // ユーザーメッセージ表示
    appendMessage(query, 'user-message');
    chatInput.value = '';

    // ローディング表示
    const loadingEl = appendMessage('那須ユートピアのAIが案内を調べています...', 'assistant-message loading');

    try {
      const response = await fetch('/.netlify/functions/generate-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewText: query,
          tenantId: 'nasu-utopia'
        })
      });

      const data = await response.json();
      loadingEl.remove();

      if (data && data.reply) {
        appendMessage(data.reply, 'assistant-message');
      } else if (data && data.replies && data.replies[0]) {
        appendMessage(data.replies[0], 'assistant-message');
      } else {
        appendMessage('那須ユートピア美野沢のサウナ・ヴィラ・BBQについてご案内いたします。サウナ（CUBERU/Rekka）は9:30〜20:00、グランピングヴィラ、手ぶらBBQは事前予約制となっております。', 'assistant-message');
      }
    } catch (err) {
      if (loadingEl) loadingEl.remove();
      appendMessage('那須ユートピア美野沢のサウナ（CUBERU/Rekka）は日帰り・宿泊ともにご利用いただけます。手ぶらBBQやドッグランヴィラも完備しております。詳しくはお電話(0287-73-5333)にてお問い合わせください。', 'assistant-message');
    }
  });

  function appendMessage(text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${className}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    msgDiv.appendChild(contentDiv);
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }
});
