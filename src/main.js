class P2PMessenger {
    constructor() {
        this.signaling = new SignalingService();
        this.peerConnections = new Map(); // userId -> RTCPeerConnection
        this.dataChannels = new Map(); // userId -> RTCDataChannel
        this.currentPeer = null;
        this.userId = this.generateUserId();
        this.messages = new Map(); // userId -> messages array
        
        this.init();
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    async init() {
        this.setupUI();
        this.setupSignaling();
        this.displayUserId();
    }

    setupUI() {
        document.getElementById('userId').textContent = this.userId;
        document.getElementById('copyIdBtn').onclick = () => this.copyUserId();
        document.getElementById('sendBtn').onclick = () => this.sendMessage();
        document.getElementById('messageInput').onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };
    }

    setupSignaling() {
        this.signaling.onUserList = (users) => this.updateUsersList(users);
        this.signaling.onUserConnected = (userId) => this.addUser(userId);
        this.signaling.onUserDisconnected = (userId) => this.removeUser(userId);
        this.signaling.onOffer = async (data) => this.handleOffer(data);
        this.signaling.onAnswer = async (data) => this.handleAnswer(data);
        this.signaling.onIceCandidate = async (data) => this.handleIceCandidate(data);
        
        this.signaling.connect(this.userId);
    }

    createPeerConnection(userId) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        const pc = new RTCPeerConnection(configuration);
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.sendIceCandidate(userId, event.candidate);
            }
        };
        
        pc.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, userId);
        };
        
        return pc;
    }

    setupDataChannel(channel, userId) {
        channel.onopen = () => {
            console.log(`Data channel opened with ${userId}`);
            this.updateConnectionStatus(userId, 'connected');
            document.getElementById('sendBtn').disabled = false;
        };
        
        channel.onclose = () => {
            console.log(`Data channel closed with ${userId}`);
            this.updateConnectionStatus(userId, 'disconnected');
            if (this.currentPeer === userId) {
                document.getElementById('sendBtn').disabled = true;
            }
        };
        
        channel.onmessage = (event) => {
            this.receiveMessage(userId, event.data);
        };
        
        this.dataChannels.set(userId, channel);
    }

    async initiateConnection(userId) {
        if (this.peerConnections.has(userId)) return;
        
        const pc = this.createPeerConnection(userId);
        this.peerConnections.set(userId, pc);
        
        const dataChannel = pc.createDataChannel('chat');
        this.setupDataChannel(dataChannel, userId);
        
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.signaling.sendOffer(userId, offer);
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(data) {
        const { offer, from } = data;
        
        let pc = this.peerConnections.get(from);
        if (!pc) {
            pc = this.createPeerConnection(from);
            this.peerConnections.set(from, pc);
        }
        
        try {
            await pc.setRemoteDescription(offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.signaling.sendAnswer(from, answer);
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(data) {
        const { answer, from } = data;
        const pc = this.peerConnections.get(from);
        if (pc) {
            try {
                await pc.setRemoteDescription(answer);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    }

    async handleIceCandidate(data) {
        const { candidate, from } = data;
        const pc = this.peerConnections.get(from);
        if (pc) {
            try {
                await pc.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }

    updateUsersList(users) {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';
        users.forEach(userId => this.addUser(userId));
    }

    addUser(userId) {
        const usersList = document.getElementById('usersList');
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.textContent = userId;
        userElement.onclick = () => this.selectUser(userId);
        usersList.appendChild(userElement);
    }

    removeUser(userId) {
        const usersList = document.getElementById('usersList');
        const users = usersList.children;
        for (let i = 0; i < users.length; i++) {
            if (users[i].textContent === userId) {
                usersList.removeChild(users[i]);
                break;
            }
        }
        
        if (this.currentPeer === userId) {
            this.currentPeer = null;
            document.getElementById('chatWith').textContent = 'Выберите собеседника';
            document.getElementById('sendBtn').disabled = true;
            document.getElementById('messages').innerHTML = '';
        }
    }

    selectUser(userId) {
        if (this.currentPeer === userId) return;
        
        this.currentPeer = userId;
        document.getElementById('chatWith').textContent = `Чат с: ${userId}`;
        document.getElementById('sendBtn').disabled = false;
        
        // Load messages for this user
        this.loadMessages(userId);
        
        // Initiate connection if not already connected
        if (!this.dataChannels.has(userId)) {
            this.initiateConnection(userId);
            this.updateConnectionStatus(userId, 'connecting');
        } else {
            const channel = this.dataChannels.get(userId);
            if (channel.readyState === 'open') {
                this.updateConnectionStatus(userId, 'connected');
            } else {
                this.updateConnectionStatus(userId, 'connecting');
            }
        }
        
        // Remove selected class from all users and add to selected
        document.querySelectorAll('.user-item').forEach(el => {
            el.classList.remove('selected');
            if (el.textContent === userId) {
                el.classList.add('selected');
            }
        });
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (!message || !this.currentPeer) return;
        
        const channel = this.dataChannels.get(this.currentPeer);
        if (channel && channel.readyState === 'open') {
            channel.send(message);
            this.addMessageToUI(this.currentPeer, message, true);
            input.value = '';
        } else {
            alert('Соединение не установлено');
        }
    }

    receiveMessage(userId, message) {
        this.addMessageToUI(userId, message, false);
    }

    addMessageToUI(userId, message, isSent) {
        if (this.currentPeer !== userId) {
            // Store message for later
            if (!this.messages.has(userId)) {
                this.messages.set(userId, []);
            }
            this.messages.get(userId).push({ message, isSent, timestamp: new Date() });
            return;
        }
        
        const messagesDiv = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const time = new Date().toLocaleTimeString();
        messageElement.innerHTML = `
            <div class="message-info">${isSent ? 'Вы' : userId} • ${time}</div>
            <div class="message-text">${this.escapeHtml(message)}</div>
        `;
        
        messagesDiv.appendChild(messageElement);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    loadMessages(userId) {
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = '';
        
        const userMessages = this.messages.get(userId) || [];
        userMessages.forEach(msg => {
            const messageElement = document.createElement('div');
            messageElement.className = `message ${msg.isSent ? 'sent' : 'received'}`;
            const time = msg.timestamp.toLocaleTimeString();
            messageElement.innerHTML = `
                <div class="message-info">${msg.isSent ? 'Вы' : userId} • ${time}</div>
                <div class="message-text">${this.escapeHtml(msg.message)}</div>
            `;
            messagesDiv.appendChild(messageElement);
        });
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    updateConnectionStatus(userId, status) {
        if (this.currentPeer !== userId) return;
        
        let statusText = '';
        let statusClass = '';
        
        switch(status) {
            case 'connected':
                statusText = '● Подключено';
                statusClass = 'status-connected';
                break;
            case 'connecting':
                statusText = '◑ Подключение...';
                statusClass = 'status-connecting';
                break;
            case 'disconnected':
                statusText = '○ Отключено';
                statusClass = 'status-disconnected';
                break;
        }
        
        const header = document.querySelector('.chat-header h3');
        const existingStatus = document.querySelector('.connection-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        const statusElement = document.createElement('span');
        statusElement.className = `connection-status ${statusClass}`;
        statusElement.textContent = statusText;
        header.appendChild(statusElement);
    }

    copyUserId() {
        navigator.clipboard.writeText(this.userId).then(() => {
            const btn = document.getElementById('copyIdBtn');
            const originalText = btn.textContent;
            btn.textContent = 'Скопировано!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }

    displayUserId() {
        document.getElementById('userId').textContent = this.userId;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app
const app = new P2PMessenger();