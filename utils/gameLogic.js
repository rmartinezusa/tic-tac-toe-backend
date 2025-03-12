const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Winning combinations for Tic Tac Toe board
const WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6] // Diagonals
];

async function checkWinner(gameId) {
    const moves = await prisma.move.findMany({
        where: { gameId },
        orderBy: { moveOrder: "asc" },
    });

    // Separate moves for player X and player O
    const playerXMoves = moves.filter(m => m.moveOrder % 2 === 1).map(m => m.position);
    const playerOMoves = moves.filter(m => m.moveOrder % 2 === 0).map(m => m.position);

    // Check if any winning combination is met
    for (const combo of WINNING_COMBOS) {
        // Player X wins
        if (combo.every(pos => playerXMoves.includes(pos))) return moves[0].playerId; 
        // Player O wins
        if (combo.every(pos => playerOMoves.includes(pos))) return moves[1].playerId; 
    }
    // No winner
    return null; 
}

module.exports = { checkWinner };