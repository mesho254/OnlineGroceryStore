import jwt from "jsonwebtoken";

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                code: "TOKEN_MISSING",
                message: "No authorization token was provided",
            });
        }
        const token = authHeader.split(" ")[1];
        const decodedData = jwt.verify(token, process.env.JWT_SECRET_KEY);

        if (decodedData?.type === "refresh") {
            return res.status(401).json({
                code: "INVALID_TOKEN_TYPE",
                message: "Refresh token cannot be used as an access token",
            });
        }

        req.userId = decodedData?.id;
        if (!req.body || typeof req.body !== "object") {
            req.body = {};
        }
        req.body.id = decodedData?.id;
        next();
    } catch (e) {
        if (e?.name === "TokenExpiredError") {
            return res.status(401).json({
                code: "TOKEN_EXPIRED",
                expired: true,
                expiredAt: e.expiredAt,
                message: "Access token expired",
            });
        }
        return res.status(401).json({
            code: "TOKEN_INVALID",
            message: e.message || "Invalid authorization token",
        });
    }
};

export default auth;
