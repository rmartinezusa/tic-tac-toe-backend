const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const JWT_SECRET = process.env.JWT_SECRET;
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

// In-memory game state storage
const gameRooms = {}; // { [gameId]: { board: [], turn: 'X', players: Set(socket.id) } }

function checkWinner(squares) {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];
    for (let [a, b, c] of lines) {
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return squares[a];
        }
    }
    return null;
}

const connectedUsers = {};

function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:5173",
            methods: ["GET", "POST"],
        },
    });

    // Middleware to verify token before connection
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }

        try {
            const { id } = jwt.verify(token, JWT_SECRET);
            socket.userId = id; // Attach user ID to the socket
            next();
        } catch (error) {
            return next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}, User ID: ${socket.userId}`);
        connectedUsers[socket.userId] = socket.id;
        
        io.to(socket.id).emit("online-users", {
            onlineUserIds: Object.keys(connectedUsers),
        });

        // Emit 'user-status' event when a user connects
        io.emit("user-status", { userId: socket.userId, status: "online" });

        // Emit current list of online user IDs to the newly connected user
        socket.emit("online-users", Object.keys(connectedUsers));

        socket.on("request-online-users", () => {
            socket.emit("online-users", {
                onlineUserIds: Object.keys(connectedUsers),
            });
        });

        socket.on("create-game", async ({ opponentId, userId }) => {
            if (!opponentId || !userId) {
                console.error("Missing player IDs");
                return;
            }

            try {
                // Check if an active game exists
                const activeGameResponse = await axios.get(`${API_BASE_URL}/games/active`, {
                    params: { playerXId: userId, playerOId: opponentId },
                    headers: { Authorization: `Bearer ${socket.handshake.auth.token}` },
                });

                const activeGame = activeGameResponse.data.activeGame;

                if (activeGame) {
                    console.log(`Active game found: ${activeGame.id}`);
                    socket.emit("game-start", { gameId: activeGame.id });
                    return;
                }

                // Create a new game
                const newGameResponse = await axios.post(
                    `${API_BASE_URL}/games`,
                    { playerXId: userId, playerOId: opponentId },
                    { headers: { Authorization: `Bearer ${socket.handshake.auth.token}` } }
                );

                const newGame = newGameResponse.data;
                console.log(`New game created: ${newGame.id}`);

                io.to(userId).emit("game-start", { gameId: newGame.id });
                io.to(opponentId).emit("game-start", { gameId: newGame.id });

            } catch (error) {
                console.error("Error handling create-game event:", error.response?.data || error.message);
            }
        });

        socket.on("joinGame", async ({ gameId }) => {
            socket.join(gameId);
        
            if (!gameRooms[gameId]) {
                try {
                    const gameResponse = await axios.get(`${API_BASE_URL}/games/${gameId}`, {
                        headers: { Authorization: `Bearer ${socket.handshake.auth.token}` },
                    });
        
                    const { playerXId, playerOId } = gameResponse.data;
        
                    gameRooms[gameId] = {
                        board: Array(9).fill(null),
                        turn: "X",
                        players: new Set(),
                        playerXId,
                        playerOId,
                    };
                } catch (error) {
                    console.error(`Error fetching game ${gameId}:`, error.response?.data || error.message);
                    return;
                }
            }
        
            gameRooms[gameId].players.add(socket.id);
        
            io.to(gameId).emit("playersInGame", {
                count: gameRooms[gameId].players.size,
            });
        
            socket.emit("gameUpdated", {
                board: gameRooms[gameId].board,
                turn: gameRooms[gameId].turn,
            });
        
            console.log(`User ${socket.id} joined game ${gameId}`);
        });
        
        socket.on("makeMove", ({ gameId, index, playerId }) => {
            const game = gameRooms[gameId];
            if (!game || game.board[index] !== null) return;

            const expectedPlayerId = game.turn === "X" ? game.playerXId : game.playerOId;            
            if (playerId !== expectedPlayerId) return;

            game.board[index] = game.turn;
            const winner = checkWinner(game.board);

            if (winner) {
                io.to(gameId).emit("gameOver", { 
                    winner,
                    board: game.board,
                 });
            } else {
                game.turn = game.turn === "X" ? "O" : "X";
                io.to(gameId).emit("gameUpdated", {
                    board: game.board,
                    turn: game.turn,
                });
            }
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);

            delete connectedUsers[socket.userId];

            // Emit 'user-status' event when a user disconnects
            io.emit("user-status", { userId: socket.userId, status: "offline" });

            for (const [gameId, game] of Object.entries(gameRooms)) {
                if (game.players.has(socket.id)) {
                    game.players.delete(socket.id);

                    io.to(gameId).emit("playersInGame", {
                        count: game.players.size,
                    });

                    if (game.players.size === 0) {
                        delete gameRooms[gameId];
                    }
                }
            }
        });
    });
}

module.exports = { initializeSocket };
