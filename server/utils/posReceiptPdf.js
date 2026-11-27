/**
 * Zero-dependency 80mm Thermal POS-Style PDF 1.4 Receipt Generator.
 * Produces crisp, vector-rendered supermarket POS receipts (monospaced aligned columns,
 * KijaniMart brand header, VAT breakdown, PAID stamp, and real Code-39 vector barcode).
 */

const PAGE_WIDTH = 246; // ~86.8mm thermal POS paper width
const MARGIN_X = 15;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2; // 216pt

// Code-39 encoding patterns (n = narrow, w = wide; alternating bar/space starting with bar)
const CODE39_MAP = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    A: "wnnnnwnnw",
    B: "nnwnnwnnw",
    C: "wnwnnwnnn",
    D: "nnnnwwnnw",
    E: "wnnnwwnnn",
    F: "nnwnwwnnn",
    G: "nnnnnwwnw",
    H: "wnnnnwwnn",
    I: "nnwnnwwnn",
    J: "nnnnwwwnn",
    K: "wnnnnnnww",
    L: "nnwnnnnww",
    M: "wnwnnnnwn",
    N: "nnnnwnnww",
    O: "wnnnwnnwn",
    P: "nnwnwnnwn",
    Q: "nnnnnnwww",
    R: "wnnnnnwwn",
    S: "nnwnnnwwn",
    T: "nnnnwnwwn",
    U: "wwnnnnnnw",
    V: "nwwnnnnnw",
    W: "wwwnnnnnn",
    X: "nwnnwnnnw",
    Y: "wwnnwnnnn",
    Z: "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    "*": "nwnnwnwnn",
};

const sanitizeAscii = (input) =>
    String(input ?? "")
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\u2022/g, "*")
        .replace(/\u00D7/g, "x")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/\s+/g, " ")
        .trim();

const escapePdfStr = (str) =>
    sanitizeAscii(str)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");

const wrapText = (text, maxChars) => {
    const clean = sanitizeAscii(text);
    if (!clean) return [];
    if (clean.length <= maxChars) return [clean];
    const words = clean.split(" ");
    const lines = [];
    let current = "";

    for (const word of words) {
        if (!current) {
            if (word.length > maxChars) {
                for (let i = 0; i < word.length; i += maxChars) {
                    lines.push(word.slice(i, i + maxChars));
                }
            } else {
                current = word;
            }
        } else if (current.length + 1 + word.length <= maxChars) {
            current = `${current} ${word}`;
        } else {
            lines.push(current);
            if (word.length > maxChars) {
                for (let i = 0; i < word.length; i += maxChars) {
                    lines.push(word.slice(i, i + maxChars));
                }
                current = "";
            } else {
                current = word;
            }
        }
    }
    if (current) lines.push(current);
    return lines;
};

const formatMoney = (val) => Number(val || 0).toFixed(2);

const formatCleanAddress = (address = {}) => {
    const isPickup = address?.delivery_method === "PICKUP_STATION";
    if (isPickup && address?.pickup_station?.name) {
        const parts = [
            address.pickup_station.name,
            address.pickup_station.area || address.area,
            address.pickup_station.city || address.city,
        ].filter((v) => v && String(v).trim().toUpperCase() !== "N/A");
        return {
            mode: "PICKUP STATION",
            line: parts.join(", ") || "KijaniMart Pickup Hub, Nairobi",
        };
    }

    const bldg =
        address.building_number && String(address.building_number).trim().toUpperCase() !== "N/A"
            ? `Bldg ${String(address.building_number).trim()}`
            : "";
    const parts = [bldg, address.street, address.area, address.city, address.country].filter(
        (v) => v && String(v).trim().toUpperCase() !== "N/A"
    );
    const deduped = Array.from(new Set(parts.map((p) => String(p).trim())));
    return {
        mode: "EXPRESS DOORSTEP",
        line: deduped.join(", ") || "Nairobi, Kenya",
    };
};

const padLeft = (str, len) => {
    const s = sanitizeAscii(str);
    return s.length >= len ? s.slice(0, len) : " ".repeat(len - s.length) + s;
};

const padRight = (str, len) => {
    const s = sanitizeAscii(str);
    return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
};

/**
 * Generates an 80mm thermal POS-style receipt PDF Buffer for an order.
 * @param {object} order - Order document (enriched with product details)
 * @param {Array} enrichedProducts - Optional enriched items array
 * @returns {Buffer} Valid PDF 1.4 binary buffer
 */
export const generatePosReceiptPdfBuffer = (order = {}, enrichedProducts = null) => {
    const orderId = sanitizeAscii(order.order_id || "RECEIPT").toUpperCase();
    const orderedDate = order.ordered_at ? new Date(order.ordered_at) : new Date();
    const dateStr = isNaN(orderedDate.getTime())
        ? new Date().toISOString().slice(0, 10)
        : orderedDate.toLocaleDateString("en-KE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
          });
    const timeStr = isNaN(orderedDate.getTime())
        ? ""
        : orderedDate.toLocaleTimeString("en-KE", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
          });

    const customerName =
        sanitizeAscii([order.name?.first, order.name?.last].filter(Boolean).join(" ")) ||
        "Valued Customer";
    const customerEmail = sanitizeAscii(order.email || "");
    const customerPhone = sanitizeAscii(order.phone_number || "");
    const statusLabel = sanitizeAscii(String(order.status || "CONFIRMED").replace(/_/g, " "));
    const addr = formatCleanAddress(order.address || {});

    const rawItems =
        Array.isArray(enrichedProducts) && enrichedProducts.length > 0
            ? enrichedProducts
            : Array.isArray(order.products)
            ? order.products
            : [];

    const items = rawItems.map((it) => {
        const qty = Math.max(1, Number(it.quantity || 1));
        const unitPrice = Number(
            it.ordered_price ?? it.price ?? it.discounted_price ?? 0
        );
        const lineTotal = Number((unitPrice * qty).toFixed(2));
        const pack = it.weight ? `${it.weight}${it.measurement || ""}` : "";
        return {
            name: sanitizeAscii(it.name || "Grocery Item"),
            pack: sanitizeAscii(pack),
            seller: sanitizeAscii(it.seller_name || it.seller?.name || ""),
            qty,
            unitPrice,
            lineTotal,
        };
    });

    const totalUnits = items.reduce((s, it) => s + it.qty, 0);
    const itemsSum = items.reduce((s, it) => s + it.lineTotal, 0);
    const grandTotal = Number(order.total ?? itemsSum ?? 0);
    // Standard 16% Kenya VAT inclusive breakdown on supermarket POS receipts
    const netSubtotal = Number((grandTotal / 1.16).toFixed(2));
    const vatAmount = Number((grandTotal - netSubtotal).toFixed(2));

    // Collect layout operations in top-down coordinates (y increases downward from 0),
    // then convert to PDF bottom-up coordinates once totalHeight is known!
    const ops = [];
    let y = 0;

    // 1. Emerald POS Top Brand Banner
    const headerH = 58;
    ops.push({ type: "rect", x: 0, y: 0, w: PAGE_WIDTH, h: headerH, fill: [0.024, 0.373, 0.275] });
    ops.push({
        type: "textCenter",
        y: 22,
        font: "F4", // Helvetica-Bold
        size: 16,
        color: [1, 1, 1],
        text: "KIJANIMART",
    });
    ops.push({
        type: "textCenter",
        y: 36,
        font: "F3", // Helvetica
        size: 7.5,
        color: [0.82, 0.98, 0.9],
        text: "ONLINE GROCERY STORE * 20-MIN EXPRESS",
    });
    ops.push({
        type: "textCenter",
        y: 48,
        font: "F1", // Courier
        size: 7,
        color: [0.92, 0.99, 0.96],
        text: "Nairobi, Kenya | PIN: P051928471K",
    });
    y = headerH + 14;

    // 2. Receipt Title + Status Stamp Box
    ops.push({
        type: "textCenter",
        y,
        font: "F2", // Courier-Bold
        size: 9.5,
        color: [0.06, 0.09, 0.16],
        text: "OFFICIAL POS SALES RECEIPT",
    });
    y += 12;

    // Status pill rectangle
    const pillText = `STATUS: ${statusLabel}`;
    const pillW = Math.min(CONTENT_WIDTH, Math.max(115, pillText.length * 4.8 + 18));
    const pillX = (PAGE_WIDTH - pillW) / 2;
    ops.push({
        type: "rect",
        x: pillX,
        y: y - 8,
        w: pillW,
        h: 15,
        fill: [0.925, 0.992, 0.961],
        stroke: [0.655, 0.953, 0.816],
    });
    ops.push({
        type: "textCenter",
        y: y + 2,
        font: "F2",
        size: 7.5,
        color: [0.016, 0.471, 0.341],
        text: pillText,
    });
    y += 16;

    const addDashedRule = (doubleLine = false) => {
        ops.push({ type: "dashedLine", y, x1: MARGIN_X, x2: PAGE_WIDTH - MARGIN_X });
        if (doubleLine) {
            ops.push({ type: "dashedLine", y: y + 2.5, x1: MARGIN_X, x2: PAGE_WIDTH - MARGIN_X });
            y += 11;
        } else {
            y += 9;
        }
    };

    const addKvLine = (label, value, boldVal = false) => {
        const cleanVal = sanitizeAscii(value);
        if (!cleanVal) return;
        const maxValChars = 44 - label.length - 1;
        const wrapped = wrapText(cleanVal, Math.max(16, maxValChars));
        wrapped.forEach((seg, idx) => {
            const leftPart = idx === 0 ? `${label} ` : " ".repeat(label.length + 1);
            ops.push({
                type: "text",
                x: MARGIN_X,
                y,
                font: boldVal && idx === 0 ? "F2" : "F1",
                size: 7.8,
                color: [0.12, 0.16, 0.23],
                text: `${leftPart}${seg}`,
            });
            y += 10.5;
        });
    };

    addDashedRule(true);

    // 3. Transaction Metadata
    addKvLine("RECEIPT #:", orderId, true);
    addKvLine("DATE/TIME:", `${dateStr}${timeStr ? ` ${timeStr}` : ""}`);
    addKvLine("CUSTOMER :", customerName);
    if (customerEmail) addKvLine("EMAIL    :", customerEmail);
    if (customerPhone) addKvLine("PHONE    :", customerPhone);
    addKvLine("DELIVERY :", addr.mode);
    addKvLine("ADDRESS  :", addr.line);

    y += 2;
    addDashedRule(false);

    // 4. Itemized Column Header (44 monospace chars @ 7.6pt -> 4.56pt/char = 200.6pt)
    const COL_HEADER = `${padRight("ITEM DESCRIPTION", 21)} ${padLeft("QTY", 3)} ${padLeft(
        "PRICE",
        8
    )} ${padLeft("TOTAL", 9)}`;
    ops.push({
        type: "text",
        x: MARGIN_X,
        y,
        font: "F2",
        size: 7.5,
        color: [0.28, 0.33, 0.41],
        text: COL_HEADER,
    });
    y += 6;
    addDashedRule(false);

    // 5. Purchased Line Items
    for (const item of items) {
        const nameLines = wrapText(item.name, 42);
        // Line 1+: bold product name
        nameLines.forEach((ln) => {
            ops.push({
                type: "text",
                x: MARGIN_X,
                y,
                font: "F2",
                size: 8,
                color: [0.06, 0.09, 0.16],
                text: ln,
            });
            y += 10;
        });

        // Sub-detail + aligned Qty / Unit Price / Line Total row
        const leftMeta = item.pack ? `  (${item.pack})` : "  Unit item";
        const priceRow = `${padRight(leftMeta, 21)} ${padLeft(
            `x${item.qty}`,
            3
        )} ${padLeft(formatMoney(item.unitPrice), 8)} ${padLeft(
            formatMoney(item.lineTotal),
            9
        )}`;
        ops.push({
            type: "text",
            x: MARGIN_X,
            y,
            font: "F1",
            size: 7.5,
            color: [0.25, 0.31, 0.39],
            text: priceRow,
        });
        y += 12;
    }

    addDashedRule(false);

    // 6. Financial Breakdown (Subtotal, VAT 16% Incl., Express Delivery)
    const addSummaryRow = (label, valueStr, bold = false) => {
        const line = `${padRight(label, 28)} ${padLeft(valueStr, 15)}`;
        ops.push({
            type: "text",
            x: MARGIN_X,
            y,
            font: bold ? "F2" : "F1",
            size: 7.8,
            color: [0.15, 0.2, 0.28],
            text: line,
        });
        y += 11;
    };

    addSummaryRow(`TOTAL ITEMS (${items.length} line${items.length === 1 ? "" : "s"})`, `${totalUnits} unit${totalUnits === 1 ? "" : "s"}`);
    addSummaryRow("SUBTOTAL (EXCL. VAT)", `KES ${formatMoney(netSubtotal)}`);
    addSummaryRow("VAT (16% INCLUSIVE)", `KES ${formatMoney(vatAmount)}`);
    addSummaryRow("EXPRESS DELIVERY", "FREE (0.00)");

    y += 3;

    // Shaded TOTAL PAID Highlight Band
    const totalBoxH = 24;
    ops.push({
        type: "rect",
        x: MARGIN_X,
        y: y - 5,
        w: CONTENT_WIDTH,
        h: totalBoxH,
        fill: [0.024, 0.373, 0.275],
    });
    const totalText = `${padRight("TOTAL PAID (KES)", 22)} ${padLeft(
        formatMoney(grandTotal),
        14
    )}`;
    ops.push({
        type: "text",
        x: MARGIN_X + 6,
        y: y + 10,
        font: "F2",
        size: 9.2,
        color: [1, 1, 1],
        text: totalText,
    });
    y += totalBoxH + 8;

    addSummaryRow("PAYMENT METHOD", "STRIPE CARD (PAID)", true);
    addDashedRule(true);

    // 7. Authentic Code-39 Vector Barcode for Order ID
    const barcodeChars = `*${orderId.replace(/[^0-9A-Z.\- ]/g, "")}*`;
    const narrowW = 1.1;
    const wideW = 2.55;
    const gapW = 1.1;

    // Measure total barcode width to center it cleanly
    let totalBarcodeW = 0;
    const validChars = barcodeChars.split("").filter((ch) => CODE39_MAP[ch]);
    validChars.forEach((ch, idx) => {
        const pattern = CODE39_MAP[ch];
        for (const p of pattern) {
            totalBarcodeW += p === "w" ? wideW : narrowW;
        }
        if (idx < validChars.length - 1) totalBarcodeW += gapW;
    });

    const barScale = totalBarcodeW > CONTENT_WIDTH - 12 ? (CONTENT_WIDTH - 12) / totalBarcodeW : 1;
    const renderedW = totalBarcodeW * barScale;
    let curX = (PAGE_WIDTH - renderedW) / 2;
    const barH = 30;

    validChars.forEach((ch, idx) => {
        const pattern = CODE39_MAP[ch];
        for (let i = 0; i < pattern.length; i++) {
            const w = (pattern[i] === "w" ? wideW : narrowW) * barScale;
            if (i % 2 === 0) {
                ops.push({
                    type: "rect",
                    x: curX,
                    y,
                    w,
                    h: barH,
                    fill: [0.06, 0.09, 0.16],
                });
            }
            curX += w;
        }
        if (idx < validChars.length - 1) curX += gapW * barScale;
    });

    y += barH + 10;
    ops.push({
        type: "textCenter",
        y,
        font: "F1",
        size: 7.5,
        color: [0.2, 0.25, 0.33],
        text: `* ${orderId} *`,
    });
    y += 14;

    // 8. POS Footer
    ops.push({
        type: "textCenter",
        y,
        font: "F2",
        size: 8.2,
        color: [0.024, 0.373, 0.275],
        text: "THANK YOU FOR SHOPPING AT KIJANIMART!",
    });
    y += 11;
    ops.push({
        type: "textCenter",
        y,
        font: "F1",
        size: 7,
        color: [0.4, 0.46, 0.54],
        text: "100% Farm-Fresh Quality Guaranteed",
    });
    y += 10;
    ops.push({
        type: "textCenter",
        y,
        font: "F1",
        size: 6.8,
        color: [0.5, 0.56, 0.64],
        text: "Keep this receipt for order verification",
    });
    y += 18;

    const PAGE_HEIGHT = Math.max(360, Math.ceil(y));

    // Convert layout operations to PDF Content Stream (PDF Y-axis origin is bottom-left)
    const streamCmds = [];
    // White thermal slip background
    streamCmds.push(`1 1 1 rg 0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)} re f`);

    for (const op of ops) {
        if (op.type === "rect") {
            const pdfY = PAGE_HEIGHT - op.y - op.h;
            const [r, g, b] = op.fill || [1, 1, 1];
            streamCmds.push(`${r} ${g} ${b} rg`);
            if (op.stroke) {
                const [sr, sg, sb] = op.stroke;
                streamCmds.push(`${sr} ${sg} ${sb} RG 0.7 w`);
                streamCmds.push(
                    `${op.x.toFixed(2)} ${pdfY.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re B`
                );
            } else {
                streamCmds.push(
                    `${op.x.toFixed(2)} ${pdfY.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re f`
                );
            }
        } else if (op.type === "dashedLine") {
            const pdfY = PAGE_HEIGHT - op.y;
            streamCmds.push(
                `q 0.72 0.76 0.82 RG 0.65 w [3 2] 0 d ${op.x1.toFixed(2)} ${pdfY.toFixed(
                    2
                )} m ${op.x2.toFixed(2)} ${pdfY.toFixed(2)} l S Q`
            );
        } else if (op.type === "text") {
            const pdfY = PAGE_HEIGHT - op.y;
            const [r, g, b] = op.color || [0, 0, 0];
            streamCmds.push(
                `BT /${op.font} ${op.size.toFixed(2)} Tf ${r} ${g} ${b} rg ${op.x.toFixed(
                    2
                )} ${pdfY.toFixed(2)} Td (${escapePdfStr(op.text)}) Tj ET`
            );
        } else if (op.type === "textCenter") {
            const clean = sanitizeAscii(op.text);
            // Accurate width factor: Courier = 0.60, Helvetica ≈ 0.54
            const widthFactor = op.font === "F1" || op.font === "F2" ? 0.6 : 0.54;
            const estW = clean.length * op.size * widthFactor;
            const x = Math.max(MARGIN_X, (PAGE_WIDTH - estW) / 2);
            const pdfY = PAGE_HEIGHT - op.y;
            const [r, g, b] = op.color || [0, 0, 0];
            streamCmds.push(
                `BT /${op.font} ${op.size.toFixed(2)} Tf ${r} ${g} ${b} rg ${x.toFixed(
                    2
                )} ${pdfY.toFixed(2)} Td (${escapePdfStr(clean)}) Tj ET`
            );
        }
    }

    const contentStream = streamCmds.join("\n");
    const contentLength = Buffer.byteLength(contentStream, "latin1");

    // Assemble standard PDF 1.4 objects with byte-accurate xref table
    const objects = [
        // 1: Catalog
        `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
        // 2: Pages
        `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
        // 3: Page
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>\nendobj\n`,
        // 4: Courier
        `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n`,
        // 5: Courier-Bold
        `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
        // 6: Helvetica
        `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
        // 7: Helvetica-Bold
        `7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
        // 8: Content stream
        `8 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    ];

    const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    let offset = Buffer.byteLength(header, "latin1");
    const offsets = [0]; // object 0 free entry

    const bodyParts = [header];
    for (const obj of objects) {
        offsets.push(offset);
        bodyParts.push(obj);
        offset += Buffer.byteLength(obj, "latin1");
    }

    const xrefStart = offset;
    const xrefLines = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];
    for (let i = 1; i <= objects.length; i++) {
        xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    return Buffer.from(bodyParts.join("") + xrefLines.join("") + trailer, "latin1");
};

export default generatePosReceiptPdfBuffer;
