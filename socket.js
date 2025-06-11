const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const JWT_SECRET = process.env.JWT_SECRET;
const API_BASE_URL = process.env.API_BASE_URL || "http://TESTlocalhost:3000";
const CLINET_SIDE_URL = process.env.CLINET_SIDE_URL || "http://localhost:5173"

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
            origin: CLINET_SIDE_URL,
            methods: ["GET", "POST"],
        },
    });

    function isBoardFull(board) {
        return board.every(cell => cell !== null);
    }

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

        socket.on("create-game", async ({ opponentId }) => {
            const userId = socket.userId;
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
        
                    const { playerXId, playerOId, status } = gameResponse.data;

                    let board = Array(9).fill(null);
                    let turn = "X";

                    if (status === "ONGOING") {

                        const movesResponse = await axios.get(`${API_BASE_URL}/moves/${gameId}`, {
                            headers: {
                                Authorization: `Bearer ${socket.handshake.auth.token}`,
                            },
                        });

                        const moves = movesResponse.data;

                        for (let move of moves) {
                            const symbol = move.playerId === playerXId ? "X" : "O";
                            board[move.position] = symbol;
                        }

                        const lastSymbol = board.filter(Boolean).length % 2 === 0 ? "X" : "O";
                        turn = lastSymbol;
                    }

                    gameRooms[gameId] = {
                        board,
                        turn,
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
        
        socket.on("makeMove", async ({ gameId, index, playerId }) => {
            const game = gameRooms[gameId];
            if (!game || game.board[index] !== null) return;

            const expectedPlayerId = game.turn === "X" ? game.playerXId : game.playerOId;            
            if (playerId !== expectedPlayerId) return;

            game.board[index] = game.turn;

            try {
                await axios.post(`${API_BASE_URL}/moves`, {
                    gameId,
                    playerId,
                    position: index,
                }, {
                    headers: {
                        Authorization: `Bearer ${socket.handshake.auth.token}`,
                    },
                });
            } catch (e) {
                console.error("Failed to record move:", e.response?.data || e.message);
                return;
            }

            const winnerSymbol = checkWinner(game.board);
            let newStatus = "ONGOING";
            let winnerId = null;

            if (winnerSymbol) {
                newStatus = "COMPLETED";
                winnerId = winnerSymbol === "X" ? game.playerXId : game.playerOId;
            } else if (isBoardFull(game.board)) {
                newStatus = "TIE";
            }

            if (newStatus !== "ONGOING") {
                try {
                    await axios.patch(`${API_BASE_URL}/games/${gameId}`, {
                        status: newStatus,
                        ...(winnerId ? { winnerId } : {}),
                    }, {
                        headers: {
                            Authorization: `Bearer ${socket.handshake.auth.token}`,
                        },
                    });
                } catch (e) {
                    console.error("Failed to update game status:", e.response?.data || e.message);
                }
                
                io.to(gameId).emit("gameOver", {
                    winner: winnerSymbol,
                    board: game.board,
                });
                return;
            }
            
            game.turn = game.turn === "X" ? "O" : "X";
           
            io.to(gameId).emit("gameUpdated", {
                board: game.board,
                turn: game.turn,
            });
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
