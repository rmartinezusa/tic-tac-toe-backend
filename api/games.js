const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { authenticate } = require("./auth");



// Create a new game
router.post("/", authenticate, async (req, res, next) => {
    const { playerXId, playerOId } = req.body;
    if (!playerXId || !playerOId) return res.status(400).json({ error: "Both players are required" });

    try {
        const game = await prisma.game.create({
            data: { 
                playerXId, 
                playerOId,
                status: "ONGOING"
            },
        });

        res.json(game);
    } catch (error) {
        console.error("Error creating game:", error);
        res.status(500).json({ error: "Failed to create game", details: error.message });
    }
});

// Get last 5 games
router.get("/", authenticate, async (req, res) => {
    try {
        const recentGames = await prisma.game.findMany({
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
                playerX: { select: { username: true, id: true } },
                playerO: { select: { username: true, id: true } },
            },
            where: { 
                OR: [
                    { status: "COMPLETED" },
                    { status: "TIE" },
                ]
            } ,
        });
        console.log(recentGames);
        res.json(recentGames);
    } catch (error) {
        console.error("Failed to get games:", error);
        res.status(500).json({ error: "Failed to fetch games" });
    }
});

// Check if game is active
router.get("/active", authenticate, async (req, res, next) => {
    const { playerXId, playerOId } = req.query;

    if (!playerXId || !playerOId) {
        return res.status(400).json({ error: "Missing player IDs" });
    }

    try {
        const existingGame = await prisma.game.findFirst({
            where: {
                OR: [
                    { playerXId: +playerXId, playerOId: +playerOId },
                    { playerXId: +playerOId, playerOId: +playerXId }
                ],
                status: "ONGOING"
            }
        });

        res.json({ activeGame: existingGame || null });
    } catch (error) {
        next(error);
    }
});

// Get game state
router.get("/:gameId", authenticate, async (req, res, next) => {
    const { gameId } = req.params;
    if (isNaN(gameId)) return res.status(400).json({ error: "Invalid game ID" });

    try {
        const game = await prisma.game.findUnique({
            where: { id: +gameId },
            include: { moves: true },
        });

        if (!game) return res.status(404).json({ error: "Game not found" });

        res.json(game);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch game" }); // will need to comeback and change all error to "next()"
    }
});

// Patch game status 
router.patch("/:gameId", authenticate, async (req, res) => {
    const { gameId } = req.params;
    const { status, winnerId } = req.body;

    if (!["COMPLETED", "TIE", "ONGOING"].includes(status)) {
        return res.status(400).json({ error: "Invalid status value" });
    }

    try {
        const updatedGame = await prisma.game.update({
            where: { id: +gameId },
            data: {
                status,
                ...(winnerId ? { winnerId } : {}),
            },
        });

        res.json(updatedGame);
    } catch (error) {
        console.error("Failed to update game status:", error);
        res.status(500).json({ error: "Could not update game", details: error.message });
    }
});

module.exports = router;
