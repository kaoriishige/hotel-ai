async function handleChatSubmit(event) {
    event.preventDefault();
    const inputEl = document.getElementById('userInput');
    const question = inputEl.value.trim();
    if (!question) return;

    appendMessage('user', question);
    inputEl.value = '';

    const loadingId = appendLoadingMessage();

    try {
        const response = await fetch('/.netlify/functions/generate-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: 'nasu-utopia',
                reviewText: question,
                platform: 'digital_concierge'
            })
        });

        removeLoadingMessage(loadingId);

        if (response.ok) {
            const data = await response.json();
            const reply = data.reply || data.response || "申し訳ございません。うまく返答を取得できませんでした。フロントまでお尋ねください。";
            appendMessage('bot', reply);
        } else {
            appendMessage('bot', "現在AIコンシェルジュが応答できません。フロント（内線または 0287-73-5333）までお問い合わせください。");
        }
    } catch (err) {
        removeLoadingMessage(loadingId);
        appendMessage('bot', "ネットワークエラーが発生しました。時間をおいて再度お試しいただくか、フロントまでお問い合わせください。");
    }
}

function sendQuickQuestion(text) {
    document.getElementById('userInput').value = text;
    document.getElementById('chatForm').dispatchEvent(new Event('submit'));
}

function appendMessage(sender, text) {
    const chatBox = document.getElementById('chatBox');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender}`;
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendLoadingMessage() {
    const chatBox = document.getElementById('chatBox');
    const msgDiv = document.createElement('div');
    const id = 'loading-' + Date.now();
    msgDiv.id = id;
    msgDiv.className = 'chat-message bot loading';
    msgDiv.innerText = 'AIコンシェルジュが考え中...';
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    return id;
}

function removeLoadingMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}
