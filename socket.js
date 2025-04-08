const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;
const axios = require("axios");

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

    // I will have to eventualy make the url in a global variable!!!!
    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}, User ID: ${socket.userId}`);

        socket.on("create-game", async ({ opponentId, userId }) => {
            if (!opponentId || !userId) {
                console.error("Missing player IDs");
                return;
            }
    
            try {
                // Check if an active game exists
                const activeGameResponse = await axios.get(
                    //global variable HERE!!!
                    "http://localhost:3000/games/active", {
                    params: { playerXId: userId, playerOId: opponentId },
                    headers: { Authorization: `Bearer ${socket.handshake.auth.token}` },
                });
    
                const activeGame = activeGameResponse.data.activeGame;

                // Emit to the client that the game is already active
                if (activeGame) {
                    console.log(`Active game found: ${activeGame.id}`);
                    socket.emit("game-start", { gameId: activeGame.id });
                    return;
                }
    
                // Create a new game via API
                const newGameResponse = await axios.post(
                    //global variable HERE!!!
                    "http://localhost:3000/games",
                    { playerXId: userId, playerOId: opponentId },
                    { headers: { Authorization: `Bearer ${socket.handshake.auth.token}` } }
                );
    
                const newGame = newGameResponse.data;
                console.log(`New game created: ${newGame.id}`);
    
                // 3. Emit the game creation to both players
                io.to(userId).emit("game-start", { gameId: newGame.id });
                io.to(opponentId).emit("game-start", { gameId: newGame.id });
    
            } catch (error) {
                console.error("Error handling create-game event:", error.response?.data || error.message);
            }
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });

}

module.exports = { initializeSocket };