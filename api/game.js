const express = require("express");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const router = express.Router();

// Create a new game
router.post("/create", async (req, res) => {
    const { playerXId, playerOId } = req.body;
    if (!playerXId || !playerOId) return res.status(400).json({ error: "Both players are required" });

    try {
        const game = await prisma.game.create({
            data: { playerXId, playerOId },
        });

        res.json(game);
    } catch (error) {
        res.status(500).json({ error: "Failed to create game" });
    }
});

// Get game state
router.get("/:gameId", async (req, res) => {
    const { gameId } = req.params;

    try {
        const game = await prisma.game.findUnique({
            where: { id: parseInt(gameId) },
            include: { moves: true },
        });

        if (!game) return res.status(404).json({ error: "Game not found" });

        res.json(game);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch game" });
    }
});

module.exports = router;
