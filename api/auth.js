const express = require("express");
const router = express.Router();
const prisma = require("../prisma");


// import jwt and JWT_SECRET from .env
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET;

// create token
function createToken(id) {
    return jwt.sign({ id }, JWT_SECRET, { expiresIn: "1d" });
}

// token checking middleware
router.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.slice(7);

    if (!token) {
        return next();
    }

    try {
        const { id } = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUniqueOrThrow({
            where: { id },
        });
        req.user = user;
        next();
    } catch (e) {
        next(e);
    }
});

// register new user
router.post("/register", async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }
        
        if (username.trim() === "" || password.trim() === "") {
            return res.status(400).json({ error: "Username and password cannot be empty." });
        }

        if (username.includes(" ") || password.includes(" ")) {
            return res.status(400).json({ error: "Username and password cannot contain spaces." });
        }

        const user = await prisma.user.register(username, password);
        const token = createToken(user.id);
        res.status(201).json({ token })
    } catch (e) {
        next(e);
    }
});

// login user
router.post("/login", async (req, res, next) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password are required." });
        }
        
        if (username.trim() === "" || password.trim() === "") {
            return res.status(400).json({ error: "Username and password cannot be empty." });
        }

        if (username.includes(" ") || password.includes(" ")) {
            return res.status(400).json({ error: "Username and password cannot contain spaces." });
        }

        const user = await prisma.user.login(username, password);
        const token = createToken(user.id);
        res.json({ token });
    } catch (e) {
        next(e); 
    }
});

// authenticate function that gets exported to routes 
function authenticate(req, res, next) {
    if (req.user) {
        next();
    } else {
        next({ status: 401, message: "You must be logged in." });
    }
}

module.exports = {
    router,
    authenticate,
};