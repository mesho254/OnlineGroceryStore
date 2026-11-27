import "./utils/nodeCompat.js";
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

dotenv.config();

// Use public DNS fallback locally on Windows for MongoDB SRV lookup; keep platform DNS on Render/Vercel
if (!process.env.VERCEL && !process.env.RENDER) {
    try {
        dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
    } catch {
        // Ignore if DNS servers cannot be overridden
    }
}

if (process.env.SENDGRID_KEY) {
    try {
        sgMail.setApiKey(process.env.SENDGRID_KEY);
    } catch (err) {
        console.warn("SendGrid initialization warning:", err.message);
    }
}

export const stripe = new Stripe(
    process.env.STRIPE_SECRET_KEY ||
        process.env.STRIPE_PRIVATE_KEY ||
        "sk_test_placeholder_key"
);

const app = express();

const corsOptions = {
    origin: "*",
    credentials: true,
    optionSuccessStatus: 200,
};

app.use(bodyParser.json({ limit: "10mb", extended: true }));
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(cors(corsOptions));

// MongoDB connection manager (supports both long-running Render servers and Vercel serverless cold starts)
mongoose.set("strictQuery", true);
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000,
};

let dbConnectPromise = null;
let backgroundJobsStarted = false;

export const connectToDatabase = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }
    if (dbConnectPromise) {
        return dbConnectPromise;
    }
    if (!process.env.CONNECTION_URL) {
        console.error("CONNECTION_URL environment variable is not set!");
        return null;
    }

    dbConnectPromise = mongoose
        .connect(process.env.CONNECTION_URL, mongooseOptions)
        .then((conn) => {
            console.log("Connected to MongoDB");
            if (!backgroundJobsStarted) {
                backgroundJobsStarted = true;
                reconcileAllOrderShipmentStatuses().catch(() => {});
                // Run recurring cron jobs on long-running servers (Render / local)
                if (!process.env.VERCEL) {
                    startLowStockCronJob();
                    startTrashPurgeCronJob();
                }
            }
            return conn;
        })
        .catch((err) => {
            dbConnectPromise = null;
            console.error("MongoDB connection error:", err.message);
            throw err;
        });

    return dbConnectPromise;
};

// Kick off initial connection immediately
connectToDatabase().catch(() => {});

// Health check & root endpoints (do not block on DB if Render is probing container liveness)
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: Math.round(process.uptime()),
        db_connected: mongoose.connection.readyState === 1,
    });
});

app.get("/", (req, res) => {
    res.status(200).json({
        team_name: "Mesho Devs",
        dev_team: ["Mesho", "Mesho254"].sort(),
        status: "online",
        swagger_docs: "/api-docs",
        health: "/health",
    });
});

// Swagger UI documentation (with CDN asset fallbacks so Swagger renders reliably on Vercel Serverless too)
const swaggerUiOptions = {
    explorer: true,
    customCssUrl: "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css",
    customJs: [
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js",
    ],
};
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get("/api-docs.json", (req, res) => {
    res.status(200).json(swaggerSpec);
});

// Ensure MongoDB is connected before handling API routes (prevents cold-start race conditions on Vercel)
app.use(async (req, res, next) => {
    if (mongoose.connection.readyState === 1) {
        return next();
    }
    try {
        await connectToDatabase();
        return next();
    } catch (err) {
        return res.status(503).json({
            status: "error",
            message: "Database connection unavailable. Please check CONNECTION_URL.",
        });
    }
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

app.use("*", (req, res) => {
    res.status(404).json({
        status: "error",
        message: "This route does not exist",
    });
});

const PORT = process.env.PORT || 5000;

// Start HTTP listener when running on Render or locally (Vercel Serverless invokes the exported `app` directly)
if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server listening on port ${PORT}`);
        console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
    });
}

export default app;
