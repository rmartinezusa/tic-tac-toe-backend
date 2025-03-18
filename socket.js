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
            console.log(`Received joinGame event with gameId: ${gameId} and userId: ${userId}`);
        
            if (!gameId) {
                console.error("Error: gameId is missing in joinGame event");
                return socket.emit("error", "Invalid game ID");
            }
        
            socket.join(`game-${gameId}`);
            console.log(`User ${userId} joined Game ${gameId}`);
        
            const game = await prisma.game.findUnique({
                where: { id: parseInt(gameId, 10) }
            });
        
            if (!game) {
                console.error(`Game with ID ${gameId} not found`);
                return socket.emit("error", "Game not found");
            }
        
            const moves = await prisma.move.findMany({
                where: { gameId },
                orderBy: { moveOrder: "asc" },
            });
        
            io.to(`game-${gameId}`).emit("gameUpdated", {
                board: moves.map((move) => ({ position: move.position, playerId: move.playerId })),
                turn: moves.length % 2 === 0 ? game.playerXId : game.playerOId,
            });
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

                const moves = await prisma.move.findMany({
                    where: { gameId },
                    orderBy: { moveOrder: "asc" },
                });

                io.to(`game-${gameId}`).emit("gameUpdated", {
                    board: moves.map((move) => ({ position: move.position, playerId: move.playerId })),
                    turn: moveCount % 2 === 0 ? game.playerOId : game.playerXId, 
                });

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
