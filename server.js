const express = require("express");
const http = require("http"); 
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
dotenv.config();
const { initializeSocket } = require("./socket"); 

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
const allowedOrigins = [
  'https://sockettictactoe.netlify.app',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
}));

app.use(morgan("dev"));
app.use(express.json());


// Routes
app.use(require("./api/auth").router);
app.use("/users", require("./api/users"));
app.use("/games", require("./api/games")); 
app.use("/moves", require("./api/moves"));

// Handle 404 errors
app.use((req, res, next) => {
    next({ status: 404, message: "Endpoint not found." });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status ?? 500).json(err.message ?? "Something broke :(");
});

// Initialize Socket.io
initializeSocket(server);

// Start server
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...`);
});
