import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const { Schema } = mongoose;

const pickupStationSchema = new Schema({
    station_id: {
        type: String,
        unique: true,
        default: () => uuidv4(),
    },
    name: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
        default: "Nairobi",
    },
    area: {
        type: String,
        required: true,
    },
    street: {
        type: String,
        required: true,
    },
    landmark: {
        type: String,
        default: "",
    },
    phone: {
        type: String,
        default: "0712 345 678",
    },
    opening_hours: {
        type: String,
        default: "Mon–Sun: 7:00 AM – 9:00 PM",
    },
    delivery_fee: {
        type: Number,
        default: 0,
    },
    coordinates: {
        lat: { type: Number, default: -1.286389 },
        lng: { type: Number, default: 36.817223 },
    },
    active: {
        type: Boolean,
        default: true,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
});

const PickupStations = mongoose.model("PickupStations", pickupStationSchema);
export default PickupStations;
