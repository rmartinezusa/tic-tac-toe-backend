const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const { checkWinner } = require("./utils/gameLogic");
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
                const game = await prisma.game.findUnique({ where: { id: +gameId } });

                if (!game) return socket.emit("error", "Game not found");

                if (game.status !== "ONGOING") return socket.emit("error", "Game is already finished");

                const existingMove = await prisma.move.findFirst({
                    where: { gameId, position },
                });

                if (existingMove) return socket.emit("error", "Position already taken");

                const moveCount = await prisma.move.count({ where: { gameId } });
                const isPlayerX = playerId === game.playerXId;
                if ((moveCount % 2 === 0 && !isPlayerX) || (moveCount % 2 !== 0 && isPlayerX)) {
                    return socket.emit("error", "Not your turn!");
                }

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
