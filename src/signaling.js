class SignalingService {
    constructor() {
        this.socket = null;
        this.userId = null;
        this.onUserList = null;
        this.onUserConnected = null;
        this.onUserDisconnected = null;
        this.onOffer = null;
        this.onAnswer = null;
        this.onIceCandidate = null;
    }

    connect(userId) {
        this.userId = userId;
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.socket.emit('register', userId);
        });

        this.socket.on('users_list', (users) => {
            if (this.onUserList) this.onUserList(users);
        });

        this.socket.on('user_connected', (userId) => {
            if (this.onUserConnected) this.onUserConnected(userId);
        });

        this.socket.on('user_disconnected', (userId) => {
            if (this.onUserDisconnected) this.onUserDisconnected(userId);
        });

        this.socket.on('offer', (data) => {
            if (this.onOffer) this.onOffer(data);
        });

        this.socket.on('answer', (data) => {
            if (this.onAnswer) this.onAnswer(data);
        });

        this.socket.on('ice-candidate', (data) => {
            if (this.onIceCandidate) this.onIceCandidate(data);
        });
    }

    sendOffer(target, offer) {
        this.socket.emit('offer', { target, offer });
    }

    sendAnswer(target, answer) {
        this.socket.emit('answer', { target, answer });
    }

    sendIceCandidate(target, candidate) {
        this.socket.emit('ice-candidate', { target, candidate });
    }
}