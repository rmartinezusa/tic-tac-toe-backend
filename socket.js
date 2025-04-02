const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

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

        socket.on("disconnect", () => {
            console.log(`User disconnected: ${socket.id}`);
        });
    });
}

module.exports = { initializeSocket };