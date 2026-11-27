import express from "express";
import {
    postShipments,
    updateShipments,
    getShipmentId,
    getShipments,
    getUserShipments,
    getPickupStations,
    createPickupStation,
    updatePickupStation,
    deletePickupStation,
} from "../controller/shipping/Shipping.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// Pickup Stations Routes (must come before /:id)
router.get("/pickup-stations", getPickupStations);
router.post("/pickup-stations", auth, createPickupStation);
router.patch("/pickup-stations/:stationId", auth, updatePickupStation);
router.delete("/pickup-stations/:stationId", auth, deletePickupStation);

// Customer's own shipments & orders list (must come before /:id)
router.get("/my-shipments", auth, getUserShipments);

// Shipments Routes
router.post("/", postShipments);
router.get("/:id", getShipmentId);
router.get("/", auth, getShipments);
router.patch("/:id", auth, updateShipments);

export default router;
