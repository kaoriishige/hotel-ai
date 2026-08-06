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
                tenantId: 'akazawa-onsen',
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
            appendMessage('bot', "現在AIコンシェルジュが応答できません。フロントまでお問い合わせください。");
        }
    } catch (err) {
        removeLoadingMessage(loadingId);
        appendMessage('bot', "エラーが発生しました。フロントまでお問い合わせください。");
    }
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

function sendQuickQuestion(text) {
    const inputEl = document.getElementById('userInput');
    if (inputEl) {
        inputEl.value = text;
        const formEl = document.getElementById('chatForm');
        if (formEl) {
            formEl.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }
}
