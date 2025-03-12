const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { authenticate } = require("./auth");

// Make a move in a game
router.post("/", authenticate, async (req, res) => {
    try {
        const { gameId, playerId, position } = req.body;

        const game = await prisma.game.findUnique({ where: { id: gameId } });
        if (!game) return res.status(404).json({ error: "Game not found" });

        // Check if the game is ongoing
        if (game.status !== "ONGOING") {
            return res.status(400).json({ error: "Game is already finished" });
        }

        // Get all moves for the game
        const moves = await prisma.move.findMany({
            where: { gameId },
            orderBy: { moveOrder: "asc" },
        });

        // Check if position is already taken
        if (moves.some(move => move.position === position)) {
            return res.status(400).json({ error: "Position already taken" });
        }

        // Determine if it's the player's turn
        const isPlayerX = playerId === game.playerXId;
        if ((moves.length % 2 === 0 && !isPlayerX) || (moves.length % 2 !== 0 && isPlayerX)) {
            return res.status(400).json({ error: "Not your turn!" });
        }

        // Create the move
        const move = await prisma.move.create({
            data: {
                gameId,
                playerId,
                position,
                moveOrder: moves.length + 1,
            },
        });

        return res.status(201).json(move);
    } catch (error) {
        console.error("Error making move:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get all moves for a specific game
router.get("/:gameId", authenticate, async (req, res) => {
    try {
        const { gameId } = req.params;

        const moves = await prisma.move.findMany({
            where: { gameId: Number(gameId) },
            orderBy: { moveOrder: "asc" },
        });

        return res.json(moves);
    } catch (error) {
        console.error("Error fetching moves:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
