// Game client JavaScript
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // WebSocket connection
        this.socket = null;
        this.connected = false;
        
        // Game state
        this.myPlayerId = null;
        this.players = {};
        this.avatars = {};
        
        // Camera/viewport
        this.cameraX = 0;
        this.cameraY = 0;
        
        // Avatar settings
        this.avatarSize = 48; // pixels
        
        // Movement state
        this.keysPressed = {};
        this.isMoving = false;
        this.currentDirection = null;
        
        // UI improvements
        this.cameraTargetX = 0;
        this.cameraTargetY = 0;
        this.cameraSpeed = 0.1; // Smooth camera following
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.connectToServer();
        this.setupKeyboardControls();
        this.startGameLoop();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.centerCameraOnPlayer(); // Re-center camera after resize
            this.draw();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.src = 'world.jpg';
    }
    
    connectToServer() {
        this.socket = new WebSocket('wss://codepath-mmorg.onrender.com');
        
        this.socket.onopen = () => {
            console.log('Connected to game server');
            this.connected = true;
            this.joinGame();
        };
        
        this.socket.onmessage = (event) => {
            this.handleServerMessage(JSON.parse(event.data));
        };
        
        this.socket.onclose = () => {
            console.log('Disconnected from game server');
            this.connected = false;
        };
        
        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Ruth'
        };
        
        this.socket.send(JSON.stringify(joinMessage));
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
    }
    
    handleKeyDown(event) {
        // Prevent default browser behavior for arrow keys
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
            event.preventDefault();
        }
        
        // Map arrow keys to directions
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        const direction = keyMap[event.code];
        
        if (direction && !this.keysPressed[event.code]) {
            this.keysPressed[event.code] = true;
            this.currentDirection = direction;
            this.isMoving = true;
            this.sendMoveCommand(direction);
        }
    }
    
    handleKeyUp(event) {
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        const direction = keyMap[event.code];
        if (direction && this.keysPressed[event.code]) {
            delete this.keysPressed[event.code];
            
            // Check if any movement keys are still pressed
            const remainingKeys = Object.keys(this.keysPressed);
            if (remainingKeys.length === 0) {
                // No keys pressed, stop movement
                this.isMoving = false;
                this.currentDirection = null;
                this.sendStopCommand();
            } else {
                // Switch to the most recently pressed key
                const lastKey = remainingKeys[remainingKeys.length - 1];
                const newDirection = keyMap[lastKey];
                this.currentDirection = newDirection;
                this.sendMoveCommand(newDirection);
            }
        }
    }
    
    sendMoveCommand(direction) {
        if (!this.connected) return;
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.socket.send(JSON.stringify(moveMessage));
    }
    
    sendStopCommand() {
        if (!this.connected) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.socket.send(JSON.stringify(stopMessage));
    }
    
    handleServerMessage(message) {
        console.log('Received message:', message);
        
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.myPlayerId = message.playerId;
                    this.players = message.players;
                    this.avatars = message.avatars;
                    this.loadAvatarImages();
                    this.centerCameraOnPlayer();
                    this.draw();
                } else {
                    console.error('Join game failed:', message.error);
                }
                break;
                
            case 'player_joined':
                this.players[message.player.id] = message.player;
                this.avatars[message.avatar.name] = message.avatar;
                this.loadAvatarImages();
                this.draw();
                break;
                
            case 'players_moved':
                Object.assign(this.players, message.players);
                // Center camera on our player if they moved
                if (this.myPlayerId && message.players[this.myPlayerId]) {
                    this.centerCameraOnPlayer();
                }
                this.draw();
                break;
                
            case 'player_left':
                delete this.players[message.playerId];
                this.draw();
                break;
                
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    loadAvatarImages() {
        // Pre-load avatar images for efficient rendering
        Object.values(this.avatars).forEach(avatar => {
            if (!avatar.loadedImages) avatar.loadedImages = {};
            
            Object.entries(avatar.frames).forEach(([direction, frameArray]) => {
                if (!avatar.loadedImages[direction]) avatar.loadedImages[direction] = {};
                
                frameArray.forEach((base64Data, index) => {
                    if (!avatar.loadedImages[direction][index]) {
                        const img = new Image();
                        img.src = base64Data;
                        avatar.loadedImages[direction][index] = img;
                    }
                });
            });
        });
    }
    
    centerCameraOnPlayer() {
        if (!this.myPlayerId || !this.players[this.myPlayerId]) return;
        
        const myPlayer = this.players[this.myPlayerId];
        
        // Set camera target (smooth following)
        this.cameraTargetX = Math.max(0, Math.min(
            myPlayer.x - this.canvas.width / 2,
            this.worldWidth - this.canvas.width
        ));
        
        this.cameraTargetY = Math.max(0, Math.min(
            myPlayer.y - this.canvas.height / 2,
            this.worldHeight - this.canvas.height
        ));
    }
    
    startGameLoop() {
        const gameLoop = () => {
            this.updateCamera();
            this.draw();
            requestAnimationFrame(gameLoop);
        };
        gameLoop();
    }
    
    updateCamera() {
        // Smooth camera interpolation
        const dx = this.cameraTargetX - this.cameraX;
        const dy = this.cameraTargetY - this.cameraY;
        
        this.cameraX += dx * this.cameraSpeed;
        this.cameraY += dy * this.cameraSpeed;
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.cameraX,
            y: worldY - this.cameraY
        };
    }
    
    draw() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the world map with camera offset
        this.ctx.drawImage(
            this.worldImage,
            this.cameraX, this.cameraY, this.canvas.width, this.canvas.height,  // Source: visible portion
            0, 0, this.canvas.width, this.canvas.height  // Destination: full canvas
        );
        
        // Draw all players
        Object.values(this.players).forEach(player => {
            this.drawPlayer(player);
        });
        
        // Draw UI elements
        this.drawConnectionStatus();
    }
    
    drawPlayer(player) {
        const screenPos = this.worldToScreen(player.x, player.y);
        
        // Skip if player is off-screen
        if (screenPos.x < -this.avatarSize || screenPos.x > this.canvas.width + this.avatarSize ||
            screenPos.y < -this.avatarSize || screenPos.y > this.canvas.height + this.avatarSize) {
            return;
        }
        
        const avatar = this.avatars[player.avatar];
        if (!avatar) return;
        
        // Get the appropriate frame based on facing direction and animation frame
        let frameArray = avatar.frames[player.facing];
        if (player.facing === 'west') {
            frameArray = avatar.frames['east']; // West uses flipped east frames
        }
        
        const frameIndex = player.animationFrame || 0;
        const frameData = frameArray[frameIndex];
        
        if (frameData) {
            // Use cached image if available, otherwise load it
            let img = avatar.loadedImages?.[player.facing]?.[frameIndex];
            
            if (img && img.complete) {
                this.drawAvatarImage(img, player, screenPos);
            } else {
                // Fallback: load image on demand
                img = new Image();
                img.onload = () => {
                    this.drawAvatarImage(img, player, screenPos);
                };
                img.src = frameData;
            }
        }
    }
    
    drawAvatarImage(img, player, screenPos) {
        // Calculate avatar size maintaining aspect ratio
        const aspectRatio = img.width / img.height;
        let avatarWidth = this.avatarSize;
        let avatarHeight = this.avatarSize / aspectRatio;
        
        // Center the avatar on the player position
        const drawX = screenPos.x - avatarWidth / 2;
        const drawY = screenPos.y - avatarHeight;
        
        // Draw avatar
        if (player.facing === 'west') {
            // Flip horizontally for west direction
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(img, -drawX - avatarWidth, drawY, avatarWidth, avatarHeight);
            this.ctx.restore();
        } else {
            this.ctx.drawImage(img, drawX, drawY, avatarWidth, avatarHeight);
        }
        
        // Draw username label
        this.drawPlayerLabel(player.username, screenPos.x, screenPos.y - avatarHeight - 5);
    }
    
    drawPlayerLabel(username, x, y) {
        this.ctx.save();
        
        // Improved label styling with better contrast
        const padding = 4;
        const fontSize = 12;
        this.ctx.font = `${fontSize}px Arial`;
        const textWidth = this.ctx.measureText(username).width;
        
        // Background with rounded corners effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(x - textWidth/2 - padding, y - fontSize - padding, textWidth + padding*2, fontSize + padding*2);
        
        // Text with better contrast
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(username, x, y - 2);
        
        this.ctx.restore();
    }
    
    drawConnectionStatus() {
        this.ctx.save();
        
        // Connection status indicator
        const statusX = 10;
        const statusY = 10;
        const statusSize = 8;
        
        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(statusX - 2, statusY - 2, 120, 20);
        
        // Status dot
        this.ctx.fillStyle = this.connected ? '#00ff00' : '#ff0000';
        this.ctx.beginPath();
        this.ctx.arc(statusX + statusSize/2, statusY + statusSize/2, statusSize/2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Status text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px Arial';
        this.ctx.fillText(this.connected ? 'Connected' : 'Disconnected', statusX + 15, statusY + 8);
        
        // Player count
        const playerCount = Object.keys(this.players).length;
        this.ctx.fillText(`Players: ${playerCount}`, statusX + 15, statusY + 20);
        
        this.ctx.restore();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
