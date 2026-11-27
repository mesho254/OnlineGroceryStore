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

// Public DNS fallback for local development SRV lookups
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

const PRIMARY_FRONTEND_ORIGIN = "https://online-grocery-store-sable.vercel.app";
const EXPLICIT_ALLOWED_ORIGINS = new Set([
    PRIMARY_FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    ...(process.env.WEBSITE_BASE_URL
        ? [process.env.WEBSITE_BASE_URL.replace(/\/+$/, "")]
        : []),
]);

const isAllowedOrigin = (origin) => {
    if (!origin) return true;
    const normalized = String(origin).replace(/\/+$/, "");
    if (EXPLICIT_ALLOWED_ORIGINS.has(normalized)) return true;
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalized)) return true;
    if (/^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(normalized)) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
    return true;
};

// 1. Explicit top-level CORS + instant 0ms OPTIONS preflight handler (runs before body parsing or DB connection)
app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    const resolvedOrigin =
        requestOrigin && isAllowedOrigin(requestOrigin)
            ? requestOrigin
            : PRIMARY_FRONTEND_ORIGIN;

    res.setHeader("Access-Control-Allow-Origin", resolvedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Session-Id, X-Refresh-Token"
    );
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    return next();
});

const corsOptions = {
    origin: (origin, callback) => {
        callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "X-Session-Id",
        "X-Refresh-Token",
    ],
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(bodyParser.json({ limit: "10mb", extended: true }));
app.use(express.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

// MongoDB connection manager (serverless-friendly timeouts under Vercel's 10s limit + long-running Render support)
mongoose.set("strictQuery", true);
const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000,
    socketTimeoutMS: 25000,
    maxPoolSize: process.env.VERCEL ? 5 : 15,
};

let dbConnectPromise = null;
let backgroundJobsStarted = false;
let lastDbError = null;

const getCleanConnectionUrl = () =>
    String(process.env.CONNECTION_URL || process.env.MONGODB_URI || "")
        .trim()
        .replace(/^CONNECTION_URL\s*=\s*/i, "")
        .replace(/^["']+|["']+$/g, "")
        .trim();

export const connectToDatabase = async () => {
    if (mongoose.connection.readyState === 1) {
        lastDbError = null;
        return mongoose.connection;
    }
    if (dbConnectPromise) {
        return dbConnectPromise;
    }

    const mongoUri = getCleanConnectionUrl();
    if (!mongoUri) {
        const msg =
            "CONNECTION_URL environment variable is missing on the server. Add CONNECTION_URL in your Vercel / Render Project Settings -> Environment Variables.";
        lastDbError = msg;
        throw new Error(msg);
    }

    dbConnectPromise = mongoose
        .connect(mongoUri, mongooseOptions)
        .then((conn) => {
            lastDbError = null;
            console.log("Connected to MongoDB");
            // Only run heavy background scans & cron timers on persistent servers (Render / local), never inside Vercel serverless requests
            if (!backgroundJobsStarted && !process.env.VERCEL) {
                backgroundJobsStarted = true;
                reconcileAllOrderShipmentStatuses().catch(() => {});
                startLowStockCronJob();
                startTrashPurgeCronJob();
            }
            return conn;
        })
        .catch((err) => {
            dbConnectPromise = null;
            lastDbError = err.message;
            console.error("MongoDB connection error:", err.message);
            throw err;
        });

    return dbConnectPromise;
};

// Warm up DB connection on persistent servers (Render / local)
if (!process.env.VERCEL) {
    connectToDatabase().catch(() => {});
}

// Health check & root endpoints
app.get("/health", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        try {
            await connectToDatabase();
        } catch {
            // reported in payload below
        }
    }
    res.status(200).json({
        status: mongoose.connection.readyState === 1 ? "ok" : "db_unavailable",
        uptime: Math.round(process.uptime()),
        db_connected: mongoose.connection.readyState === 1,
        has_connection_url: Boolean(getCleanConnectionUrl()),
        db_error: lastDbError,
    });
});

app.get("/", async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        try {
            await connectToDatabase();
        } catch {
            // reported in payload below
        }
    }
    res.status(200).json({
        team_name: "Mesho Devs",
        dev_team: ["Mesho", "Mesho254"].sort(),
        status: "online",
        db_connected: mongoose.connection.readyState === 1,
        has_connection_url: Boolean(getCleanConnectionUrl()),
        ...(lastDbError ? { db_error: lastDbError } : {}),
        swagger_docs: "/api-docs",
        health: "/health",
    });
});

// Swagger UI documentation
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

// Ensure MongoDB is connected before handling API routes
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
            message:
                "Database connection timed out. Ensure CONNECTION_URL is set and MongoDB Atlas Network Access allows 0.0.0.0/0.",
            detail: err.message,
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

if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server listening on port ${PORT}`);
        console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
    });
}

export default app;
