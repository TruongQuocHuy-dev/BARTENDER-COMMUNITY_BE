// routes/subscriptionPlanRoutes.js
import express from "express";
import { getAllPlans, getPlanById, createPlan, updatePlan, deletePlan } from "../controllers/subscription-plan.controller.js";
import { optionalAuth, protect, isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// GET /api/v1/subscription-plans
router.get("/", optionalAuth, getAllPlans);
router.get("/:id", optionalAuth, getPlanById);

// Admin-only CRUD
router.post("/", protect, isAdmin, createPlan);
router.put("/:id", protect, isAdmin, updatePlan);
router.delete("/:id", protect, isAdmin, deletePlan);

export default router;