const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();


function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: "http://localhost:5173", // Adjust frontend URL
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log(`User connected: ${socket.id}`);

        socket.on("joinGame", async ({ gameId, userId }) => {
            socket.join(`game-${gameId}`);
            console.log(`User ${userId} joined Game ${gameId}`);
        });

        socket.on("makeMove", async ({ gameId, playerId, position }) => {
            try {
                const game = await prisma.game.findUnique({ where: { id: +gameId } }); // I need to see if game id is comming in as an int or str.
                
                if (!game) return socket.emit("error", "Game not found");

                // Prevent moves after game is completed
                if (game.status !== "ONGOING") return socket.emit("error", "Game is already finished");

                // Validate player turn (even = X, odd = O)
                const moveCount = await prisma.move.count({ where: { gameId } });
                const isPlayerX = playerId === game.playerXId;
                if ((moveCount % 2 === 0 && !isPlayerX) || (moveCount % 2 !== 0 && isPlayerX)) {
                    return socket.emit("error", "Not your turn!");
                }

                // Save the move
                const move = await prisma.move.create({
                    data: {
                        gameId,
                        playerId,
                        position,
                        moveOrder: moveCount + 1,
                    },
                });

                // Broadcast move
                io.to(`game-${gameId}`).emit("moveMade", move);

                // Check for a winner (implement logic in a helper function)
                const winner = await checkWinner(gameId);
                if (winner) {
                    await prisma.game.update({
                        where: { id: gameId },
                        data: { status: "COMPLETED", winnerId: winner },
                    });
                    io.to(`game-${gameId}`).emit("gameOver", { winner });
                } else if (moveCount === 8) {
                    await prisma.game.update({
                        where: { id: gameId },
                        data: { status: "TIE" },
                    });
                    io.to(`game-${gameId}`).emit("gameOver", { winner: null });
                }
            } catch (error) {
                console.error("Error making move:", error);
                socket.emit("error", "Move failed");
            }
        });

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });
}

module.exports = { initializeSocket };
