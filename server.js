const express = require("express");
const app = express();
const PORT = 3000;

const cors = require("cors");
app.use(cors({ origin: /localhost/ }));


require("dotenv").config();

app.use(require("morgan")("dev"));
app.use(express.json());

app.use(require("./api/auth").router);
app.use("/users", require("./api/users"));

app.use((req, res, next) => {
    next({ status: 404, message: "Endpoint not found." });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status ?? 500);
    res.json(err.message ?? "Sorry, something broke :(");
});

app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}...`);
});