import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import styles from "./privacyNotice.module.css";
import {
    getCookieConsent,
    resetCookieConsent,
    saveCookieConsent,
} from "../../utils/tracker";

const COOKIE_INVENTORY = [
    {
        name: "freshmart_cookie_consent",
        storage: "HTTP Cookie & localStorage",
        category: "Strictly Necessary",
        duration: "1 Year (365 Days)",
        purpose:
            "Stores your cookie consent decision and category preferences so we do not ask you on every page visit.",
    },
    {
        name: "profile (accessToken & refreshToken)",
        storage: "localStorage",
        category: "Strictly Necessary & Security",
        duration: "Access: 15 Mins • Refresh: 7 Days",
        purpose:
            "Authenticates your customer, seller, or admin session with automatic short-lived JWT rotation and session expiry protection.",
    },
    {
        name: "cart_<userId>",
        storage: "localStorage & MongoDB Sync",
        category: "Strictly Necessary",
        duration: "Persistent per account",
        purpose:
            "Keeps your user-scoped grocery basket synchronized across tabs and devices and prevents cart leakage between accounts.",
    },
    {
        name: "freshmart_session_id",
        storage: "localStorage (X-Session-Id)",
        category: "Personalization & Recommendations",
        duration: "60 Days rolling",
        purpose:
            "Powers personalized homepage shelves ('Picked Just For You') and 'Related Products' based on items you view, search, or add to cart.",
    },
    {
        name: "freshmart_rq_cache_v1",
        storage: "localStorage",
        category: "Performance & Speed",
        duration: "24 Hours (2-Min Stale Window)",
        purpose:
            "Caches storefront catalog snapshots locally so pages and product details render in 0ms while revalidating in the background.",
    },
];

const PrivacyNotice = () => {
    const [consent, setConsent] = useState(() => getCookieConsent());
    const [personalization, setPersonalization] = useState(
        () => getCookieConsent()?.personalization ?? true
    );
    const [performance, setPerformance] = useState(
        () => getCookieConsent()?.performance ?? true
    );
    const [toastMsg, setToastMsg] = useState("");

    useEffect(() => {
        const syncState = () => {
            const current = getCookieConsent();
            setConsent(current);
            setPersonalization(current?.personalization ?? true);
            setPerformance(current?.performance ?? true);
        };
        window.addEventListener("freshmart:cookie-consent-updated", syncState);
        return () => window.removeEventListener("freshmart:cookie-consent-updated", syncState);
    }, []);

    const showFeedback = (msg) => {
        setToastMsg(msg);
        window.setTimeout(() => setToastMsg(""), 3500);
    };

    const handleAcceptAll = () => {
        const updated = saveCookieConsent({
            status: "accepted",
            personalization: true,
            performance: true,
        });
        setConsent(updated);
        setPersonalization(true);
        setPerformance(true);
        showFeedback("✓ All cookie preferences accepted and saved.");
    };

    const handleSaveCustom = () => {
        const status = personalization || performance ? "accepted" : "essential_only";
        const updated = saveCookieConsent({
            status,
            personalization,
            performance,
        });
        setConsent(updated);
        showFeedback("✓ Your custom cookie preferences have been saved.");
    };

    const handleEssentialOnly = () => {
        const updated = saveCookieConsent({
            status: "essential_only",
            personalization: false,
            performance: false,
        });
        setConsent(updated);
        setPersonalization(false);
        setPerformance(false);
        showFeedback("✓ Saved: Strictly necessary cookies only.");
    };

    const handleReopenBanner = () => {
        resetCookieConsent();
        setConsent(null);
        showFeedback("Cookie banner re-opened in the bottom-left corner.");
    };

    return (
        <div className={styles["page-wrapper"]}>
            {/* Hero Header */}
            <section className={styles["hero-banner"]}>
                <div className={styles["hero-inner"]}>
                    <span className={styles["eyebrow"]}>
                        🔒 DATA PROTECTION &amp; COOKIE TRANSPARENCY
                    </span>
                    <h1>Privacy and Cookie Notice</h1>
                    <p>
                        Learn how KijaniMart Online Grocery Store collects, protects, and uses
                        cookies and personal data to deliver farm-fresh groceries across Nairobi in
                        20 minutes—in compliance with the Kenya Data Protection Act (2019) and
                        GDPR standards.
                    </p>
                    <div className={styles["hero-meta"]}>
                        <span>Effective Date: November 2026</span>
                        <span>•</span>
                        <span>Controller: KijaniMart Online Grocery Store (Nairobi, Kenya)</span>
                        <span>•</span>
                        <Link to="/products">Return to Shopping →</Link>
                    </div>
                </div>
            </section>

            <div className={styles["content-container"]}>
                {/* Interactive Cookie Preferences Panel */}
                <section className={styles["card"]} id="cookie-preferences">
                    <div className={styles["card-header"]}>
                        <div>
                            <span className={styles["section-tag"]}>LIVE PREFERENCE CENTER</span>
                            <h2>Manage Your Cookie &amp; Storage Preferences</h2>
                            <p className={styles["section-sub"]}>
                                Control how KijaniMart uses browser cookies and local storage on
                                your device. Essential cookies are always active to keep your sign-in
                                session and shopping cart working.
                            </p>
                        </div>
                        <div className={styles["status-pill-wrap"]}>
                            <span
                                className={`${styles["status-pill"]} ${
                                    consent?.status === "accepted"
                                        ? styles["status-accepted"]
                                        : consent?.status === "essential_only"
                                        ? styles["status-essential"]
                                        : styles["status-pending"]
                                }`}
                            >
                                {consent?.status === "accepted"
                                    ? "✓ Cookies Accepted"
                                    : consent?.status === "essential_only"
                                    ? "🔒 Essential Cookies Only"
                                    : "⏳ Awaiting Consent Choice"}
                            </span>
                        </div>
                    </div>

                    {toastMsg && <div className={styles["feedback-banner"]}>{toastMsg}</div>}

                    <div className={styles["pref-grid"]}>
                        <div className={styles["pref-item"]}>
                            <div className={styles["pref-info"]}>
                                <div className={styles["pref-title-row"]}>
                                    <h3>1. Strictly Necessary &amp; Authentication Cookies</h3>
                                    <span className={styles["always-active"]}>Always Active</span>
                                </div>
                                <p>
                                    Required for account sign-in (15-minute access tokens &amp;
                                    7-day rotating refresh tokens), shopping cart persistence,
                                    real-time checkout stock reservation, and security.
                                </p>
                            </div>
                        </div>

                        <div className={styles["pref-item"]}>
                            <div className={styles["pref-info"]}>
                                <div className={styles["pref-title-row"]}>
                                    <h3>2. Personalization &amp; Smart Recommendations</h3>
                                    <label className={styles["switch"]}>
                                        <input
                                            type="checkbox"
                                            checked={personalization}
                                            onChange={(e) => setPersonalization(e.target.checked)}
                                        />
                                        <span className={styles["slider"]} />
                                    </label>
                                </div>
                                <p>
                                    Allows KijaniMart to remember products you view, search, and
                                    wishlist so we can curate relevant shelves (&ldquo;Picked Just
                                    For You&rdquo;) and related grocery suggestions.
                                </p>
                            </div>
                        </div>

                        <div className={styles["pref-item"]}>
                            <div className={styles["pref-info"]}>
                                <div className={styles["pref-title-row"]}>
                                    <h3>3. Performance &amp; Instant Catalog Caching</h3>
                                    <label className={styles["switch"]}>
                                        <input
                                            type="checkbox"
                                            checked={performance}
                                            onChange={(e) => setPerformance(e.target.checked)}
                                        />
                                        <span className={styles["slider"]} />
                                    </label>
                                </div>
                                <p>
                                    Caches non-sensitive product catalog and flash-sale snapshots in
                                    your browser so pages open in 0ms without repetitive loading
                                    spinners.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className={styles["pref-actions"]}>
                        <button
                            type="button"
                            onClick={handleAcceptAll}
                            className={styles["btn-accept-orange"]}
                        >
                            Accept All Cookies
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveCustom}
                            className={styles["btn-primary-green"]}
                        >
                            Save My Preferences
                        </button>
                        <button
                            type="button"
                            onClick={handleEssentialOnly}
                            className={styles["btn-outline"]}
                        >
                            Essential Cookies Only
                        </button>
                        <button
                            type="button"
                            onClick={handleReopenBanner}
                            className={styles["btn-ghost"]}
                        >
                            Re-open Cookie Popup
                        </button>
                    </div>
                </section>

                {/* Detailed Cookie & Storage Inventory Table */}
                <section className={styles["card"]}>
                    <span className={styles["section-tag"]}>COOKIE &amp; STORAGE INVENTORY</span>
                    <h2>What Cookies and Local Storage Technologies We Use</h2>
                    <p className={styles["section-sub"]}>
                        Below is a transparent list of the cookies and browser storage keys used by
                        KijaniMart Online Grocery Store:
                    </p>

                    <div className={styles["table-wrap"]}>
                        <table className={styles["cookie-table"]}>
                            <thead>
                                <tr>
                                    <th>Cookie / Key Name</th>
                                    <th>Type</th>
                                    <th>Category</th>
                                    <th>Expiry / Duration</th>
                                    <th>Purpose</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COOKIE_INVENTORY.map((row) => (
                                    <tr key={row.name}>
                                        <td>
                                            <code>{row.name}</code>
                                        </td>
                                        <td>{row.storage}</td>
                                        <td>
                                            <span className={styles["cat-badge"]}>
                                                {row.category}
                                            </span>
                                        </td>
                                        <td>{row.duration}</td>
                                        <td>{row.purpose}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Privacy Policy Sections */}
                <div className={styles["two-col-grid"]}>
                    <section className={styles["card"]}>
                        <span className={styles["section-tag"]}>PERSONAL DATA WE COLLECT</span>
                        <h2>1. Information We Collect &amp; Why</h2>
                        <ul className={styles["policy-list"]}>
                            <li>
                                <strong>Account &amp; Profile Details:</strong> Your name, email
                                address, phone number, and delivery address (or preferred Nairobi
                                Pickup Station) to fulfill orders and send live shipment updates.
                            </li>
                            <li>
                                <strong>Order &amp; POS Receipt Records:</strong> Itemized purchases,
                                VAT breakdowns, and Stripe payment confirmations used to generate
                                your downloadable 80mm thermal POS PDF receipt.
                            </li>
                            <li>
                                <strong>Verified Buyer Reviews:</strong> Product and seller ratings
                                submitted after confirmed delivery to maintain marketplace quality.
                            </li>
                            <li>
                                <strong>Seller Partner Credentials:</strong> Store name, business
                                phone, and location for approved vendors on the KijaniMart Seller
                                Portal.
                            </li>
                        </ul>
                    </section>

                    <section className={styles["card"]}>
                        <span className={styles["section-tag"]}>GDPR &amp; STATUTORY RETENTION</span>
                        <h2>2. Data Retention, Trash &amp; Your Rights</h2>
                        <ul className={styles["policy-list"]}>
                            <li>
                                <strong>365-Day GDPR Account Archival:</strong> If you suspend your
                                account from your <Link to="/profile">Account Profile</Link> (or if
                                an administrator suspends an account), personal data is moved to
                                secure GDPR Trash for 365 days to satisfy tax, fraud-prevention, and
                                statutory audit obligations before automated permanent purge.
                            </li>
                            <li>
                                <strong>30-Day Catalog Trash:</strong> Deleted catalog products are
                                held in Trash for 30 days before permanent removal.
                            </li>
                            <li>
                                <strong>Token Security &amp; Revocation:</strong> Short-lived access
                                tokens expire after 15 minutes, and refresh tokens are hashed with
                                SHA-256 in MongoDB and revoked immediately on sign-out, password
                                change, or account suspension.
                            </li>
                            <li>
                                <strong>Your Data Rights:</strong> You have the right to view,
                                update, export, or suspend your account data at any time.
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default PrivacyNotice;
