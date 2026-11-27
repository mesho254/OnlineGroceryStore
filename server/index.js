import express from "express";
import dns from "node:dns";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./swagger.js";
import products from "./routes/products.js";
import shipping from "./routes/shipping.js";
import orders from "./routes/orders.js";
import payments from "./routes/payments.js";
import notifications from "./routes/notifications.js";
import admin from "./routes/admin.js";
import seller from "./routes/seller.js";
import sgMail from "@sendgrid/mail";
import MainRouter from "./routes/me.js";
import Stripe from "stripe";
import { reconcileAllOrderShipmentStatuses } from "./utils/orderStatusSync.js";
import { startLowStockCronJob } from "./jobs/stockMonitorCron.js";
import { startTrashPurgeCronJob } from "./jobs/trashPurgeCron.js";

const app = express();
dotenv.config();
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);

sgMail.setApiKey(process.env.SENDGRID_KEY);
export const stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY
);

const corsOptions = {
    origin: "*",
    credentials: true,
    optionSuccessStatus: 200,
};

app.use(bodyParser.json({ limit: "10mb", extended: true }));
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(cors(corsOptions));

// Swagger UI documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
app.get("/api-docs.json", (req, res) => {
    res.status(200).json(swaggerSpec);
});

app.use("/orders", orders);
app.use("/payments", payments);
app.use("/products", products);
app.use("/shipping", shipping);
app.use("/notifications", notifications);
app.use("/admin", admin);
app.use("/api/v1/admin", admin);
app.use("/seller", seller);
app.use("/api/v1/seller", seller);
app.use("/api/v1", MainRouter);

app.get("/", (req, res) => {
    res.status(200).json({
        team_name: "Mesho Devs",
        dev_team: ["Mesho", "Mesho254"].sort(),
        swagger_docs: "/api-docs",
    });
});

app.use("*", (req, res) => {
    res.status(500).json({
        status: "error",
        message: "This route does not exist",
    });
});

const PORT = process.env.PORT || 5000;

mongoose.set("strictQuery", true);
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
};

mongoose.connect(process.env.CONNECTION_URL, mongooseOptions, (err) => {
    if (err) {
        console.log(err);
    } else {
        console.log("Connected to MongoDB");
        reconcileAllOrderShipmentStatuses();
        startLowStockCronJob();
        startTrashPurgeCronJob();
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
});

export default app;
