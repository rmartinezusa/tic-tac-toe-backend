const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const { authenticate } = require("./auth");

module.exports = router;

// GET users
router.get("/", authenticate, async (req, res, next) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                createdAt: true
            }
      });
      res.status(200).json(users);
    } catch (e) {
      console.error(e);
      next(e);
    }
  });
  

// GET logged in user
router.get("/me", authenticate, async (req, res, next) => {
    try {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user.id },
        select: {
            id: true,
            username: true,
            createdAt: true
        }
      });
      res.json(user);
    } catch (e) {
      next(e);
    }
  });

// GET user  by id
router.get("/:id", authenticate, async (req, res, next) => {
    const { id } = req.params;
    
    if (isNaN(id)) {
        return next({ status: 400, message: "Invalid user ID" });
    }

    try {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: +id },
            select: {
                id: true,
                username: true,
                createdAt: true
            }
        });
        res.json(user);
    } catch (e) {
        console.error(e);
        next(e);
    }
});