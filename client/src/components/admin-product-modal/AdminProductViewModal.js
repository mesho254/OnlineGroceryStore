import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import styles from "./adminProductViewModal.module.css";
import {
    formatKES,
    getDiscountPercent,
    getEffectivePrice,
    getOriginalPrice,
    getUnitSavings,
} from "../../utils/pricing";

const formatDateLabel = (dateVal, fallback = "Not specified") => {
    if (!dateVal) return fallback;
    try {
        return new Date(dateVal).toLocaleDateString("en-KE", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return fallback;
    }
};

const AdminProductViewModal = ({
    product,
    isOpen,
    onClose,
    onFullEdit,
    onMoveToTrash,
    onRestore,
    onApprovePublish,
    onReviewPendingEdits,
}) => {
    const [activeImageIdx, setActiveImageIdx] = useState(0);

    useEffect(() => {
        setActiveImageIdx(0);
    }, [product?.product_id, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, onClose]);

    if (!isOpen || !product) return null;

    const galleryImages = Array.from(
        new Set(
            [
                product.image,
                ...(Array.isArray(product.images) ? product.images : []),
            ].filter(Boolean)
        )
    );
    const currentImage = galleryImages[activeImageIdx] || product.image;

    const discountPct = getDiscountPercent(product);
    const originalPrice = getOriginalPrice(product);
    const effectivePrice = getEffectivePrice(product);
    const unitSavings = getUnitSavings(product);
    const stock = Number(product.stock || 0);

    const seller = product.seller || {
        name: "KijaniMart Verified Farm Partner",
        location: "Nairobi, Kenya",
        verified: true,
        rating: 4.9,
    };

    const nutrition = product.nutrition || {};
    const tags = Array.isArray(product.tags) ? product.tags.filter(Boolean) : [];
    const vitamins = Array.isArray(nutrition.vitamins) ? nutrition.vitamins.filter(Boolean) : [];
    const reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const pendingDiffs = Array.isArray(product.pending_changes?.diff_summary)
        ? product.pending_changes.diff_summary
        : [];

    const isTrashed = Boolean(product.is_deleted);
    const approvalStatus = product.approval_status || "APPROVED";

    return (
        <div
            className={styles["backdrop"]}
            role="dialog"
            aria-modal="true"
            aria-label={`Product details for ${product.name}`}
            onClick={onClose}
        >
            <div className={styles["modal"]} onClick={(e) => e.stopPropagation()}>
                {/* Sticky Top Header */}
                <div className={styles["modal-header"]}>
                    <div className={styles["header-left"]}>
                        <span className={styles["crumb-chip"]}>
                            <span className="material-symbols-outlined">inventory_2</span>
                            {product.category || "Grocery Item"}
                        </span>
                        <span className={styles["id-chip"]}>#{product.product_id}</span>
                        {isTrashed && (
                            <span className={`${styles["status-pill"]} ${styles["pill-danger"]}`}>
                                🗑 In Trash ({product.days_remaining ?? 30}d left)
                            </span>
                        )}
                        {!isTrashed && approvalStatus === "APPROVED" && (
                            <span className={`${styles["status-pill"]} ${styles["pill-success"]}`}>
                                ✓ Published Live
                            </span>
                        )}
                        {!isTrashed && approvalStatus === "PENDING_APPROVAL" && (
                            <span className={`${styles["status-pill"]} ${styles["pill-warning"]}`}>
                                ⏳ Pending Publishing
                            </span>
                        )}
                        {!isTrashed && approvalStatus === "REJECTED" && (
                            <span className={`${styles["status-pill"]} ${styles["pill-danger"]}`}>
                                ✗ Rejected
                            </span>
                        )}
                        {!isTrashed && Boolean(product.pending_changes) && (
                            <span className={`${styles["status-pill"]} ${styles["pill-info"]}`}>
                                ✏️ Seller Edits Pending
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        className={styles["close-btn"]}
                        onClick={onClose}
                        aria-label="Close product preview"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Scrollable Body designed like ProductDetails page */}
                <div className={styles["modal-body"]}>
                    {/* Primary Split View */}
                    <div className={styles["product-split"]}>
                        {/* Left: Multi-Image Slider & Thumbnails */}
                        <div className={styles["gallery-col"]}>
                            <div className={styles["main-image-box"]}>
                                {discountPct > 0 && (
                                    <span className={styles["discount-badge"]}>
                                        {product.flash_sale
                                            ? `⚡ Flash Sale · -${discountPct}%`
                                            : `-${discountPct}% OFF`}
                                    </span>
                                )}
                                {galleryImages.length > 1 && (
                                    <>
                                        <button
                                            type="button"
                                            className={`${styles["nav-arrow"]} ${styles["nav-prev"]}`}
                                            onClick={() =>
                                                setActiveImageIdx(
                                                    (prev) =>
                                                        (prev - 1 + galleryImages.length) %
                                                        galleryImages.length
                                                )
                                            }
                                            aria-label="Previous image"
                                        >
                                            <span className="material-symbols-outlined">
                                                chevron_left
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles["nav-arrow"]} ${styles["nav-next"]}`}
                                            onClick={() =>
                                                setActiveImageIdx(
                                                    (prev) => (prev + 1) % galleryImages.length
                                                )
                                            }
                                            aria-label="Next image"
                                        >
                                            <span className="material-symbols-outlined">
                                                chevron_right
                                            </span>
                                        </button>
                                        <span className={styles["slide-counter"]}>
                                            {activeImageIdx + 1} / {galleryImages.length}
                                        </span>
                                    </>
                                )}
                                <img src={currentImage} alt={product.name} />
                            </div>

                            {galleryImages.length > 1 && (
                                <div className={styles["thumb-strip"]}>
                                    {galleryImages.map((imgUrl, idx) => (
                                        <button
                                            key={`${imgUrl}-${idx}`}
                                            type="button"
                                            className={`${styles["thumb-btn"]} ${
                                                idx === activeImageIdx ? styles["thumb-active"] : ""
                                            }`}
                                            onClick={() => setActiveImageIdx(idx)}
                                        >
                                            <img src={imgUrl} alt={`View ${idx + 1}`} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right: Details, Pricing, Stock, Description & Seller */}
                        <div className={styles["info-col"]}>
                            <div className={styles["meta-pills"]}>
                                {product.is_organic && (
                                    <span className={styles["organic-pill"]}>🌿 100% Organic</span>
                                )}
                                {product.flash_sale && (
                                    <span className={styles["flash-pill"]}>⚡ Flash Deal</span>
                                )}
                                {product.brand && (
                                    <span className={styles["brand-pill"]}>{product.brand}</span>
                                )}
                                {product.sku && (
                                    <span className={styles["sku-pill"]}>SKU: {product.sku}</span>
                                )}
                            </div>

                            <h2 className={styles["product-title"]}>{product.name}</h2>

                            <div className={styles["rating-line"]}>
                                <span className={styles["stars"]}>
                                    ★ {Number(product.rating || 0).toFixed(1)}
                                </span>
                                <span className={styles["reviews-meta"]}>
                                    ({Number(product.reviews_count || reviews.length)} verified{" "}
                                    {Number(product.reviews_count || reviews.length) === 1
                                        ? "review"
                                        : "reviews"}
                                    )
                                </span>
                                <span className={styles["pack-chip"]}>
                                    {product.weight || 1} {product.measurement || "unit"}
                                </span>
                            </div>

                            {/* Price & Discount Box */}
                            <div className={styles["price-card"]}>
                                <div className={styles["price-row"]}>
                                    <span className={styles["selling-price"]}>
                                        {formatKES(effectivePrice)}
                                    </span>
                                    {discountPct > 0 && (
                                        <>
                                            <span className={styles["original-price"]}>
                                                {formatKES(originalPrice)}
                                            </span>
                                            <span className={styles["savings-badge"]}>
                                                Save {formatKES(unitSavings)}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <div className={styles["stock-row"]}>
                                    <span
                                        className={`${styles["stock-badge"]} ${
                                            stock <= 0
                                                ? styles["stock-out"]
                                                : stock <= 10
                                                ? styles["stock-low"]
                                                : styles["stock-ok"]
                                        }`}
                                    >
                                        <span className="material-symbols-outlined">
                                            {stock <= 0 ? "block" : "check_circle"}
                                        </span>
                                        {stock <= 0
                                            ? "Out of Stock (0 units)"
                                            : stock <= 10
                                            ? `Low Stock · ${stock} units left`
                                            : `In Stock · ${stock} units available`}
                                    </span>
                                    {product.flash_sale && product.flash_sale_ends_at && (
                                        <small className={styles["flash-end"]}>
                                            Ends {formatDateLabel(product.flash_sale_ends_at)}
                                        </small>
                                    )}
                                </div>
                            </div>

                            {/* Description */}
                            <div className={styles["description-block"]}>
                                <h4>Product Description</h4>
                                <p>
                                    {product.description ||
                                        "No detailed description provided for this product."}
                                </p>
                            </div>

                            {/* Supplying Seller Card */}
                            <div className={styles["seller-card"]}>
                                <div className={styles["seller-avatar"]}>
                                    {(seller.name || "F").charAt(0).toUpperCase()}
                                </div>
                                <div className={styles["seller-details"]}>
                                    <div className={styles["seller-name-row"]}>
                                        <strong>{seller.name || "KijaniMart Store"}</strong>
                                        {seller.verified !== false && (
                                            <span className={styles["verified-chip"]}>
                                                ✓ Verified
                                            </span>
                                        )}
                                    </div>
                                    <small>
                                        📍 {seller.location || "Nairobi, Kenya"}
                                        {seller.email ? ` • ${seller.email}` : ""}
                                        {seller.rating ? ` • ★ ${Number(seller.rating).toFixed(1)}` : ""}
                                    </small>
                                </div>
                            </div>

                            {/* Tags */}
                            {tags.length > 0 && (
                                <div className={styles["tags-row"]}>
                                    {tags.map((t, i) => (
                                        <span key={`${t}-${i}`} className={styles["tag-chip"]}>
                                            #{t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pending Seller Changes Diff Section (when present) */}
                    {pendingDiffs.length > 0 && (
                        <div className={styles["pending-edits-box"]}>
                            <div className={styles["pending-head"]}>
                                <div>
                                    <h4>✏️ Pending Seller Updates Awaiting Approval</h4>
                                    <p>
                                        Storefront still displays the live values above until you
                                        approve these staged edits.
                                    </p>
                                </div>
                                {onReviewPendingEdits && !isTrashed && (
                                    <div className={styles["pending-actions"]}>
                                        <button
                                            type="button"
                                            className={styles["btn-approve"]}
                                            onClick={() => onReviewPendingEdits(product, "APPROVE")}
                                        >
                                            Approve Changes ✓
                                        </button>
                                        <button
                                            type="button"
                                            className={styles["btn-reject"]}
                                            onClick={() => onReviewPendingEdits(product, "REJECT")}
                                        >
                                            Reject
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className={styles["diff-grid"]}>
                                {pendingDiffs.map((d, idx) => (
                                    <div key={idx} className={styles["diff-item"]}>
                                        <span className={styles["diff-field"]}>{d.field}</span>
                                        <div className={styles["diff-vals"]}>
                                            <del>{d.from}</del>
                                            <span>→</span>
                                            <strong>{d.to}</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Farm Provenance, Dates & Storage Details */}
                    <div className={styles["details-section"]}>
                        <h4>
                            <span className="material-symbols-outlined">agriculture</span>
                            Farm Provenance, Dates & Storage
                        </h4>
                        <div className={styles["specs-grid"]}>
                            <div className={styles["spec-item"]}>
                                <span>Origin / Region</span>
                                <strong>{product.origin || "Kenyan Highlands"}</strong>
                            </div>
                            <div className={styles["spec-item"]}>
                                <span>Shelf Life</span>
                                <strong>{product.shelf_life || "5–7 Days"}</strong>
                            </div>
                            <div className={styles["spec-item"]}>
                                <span>Harvest / Packed Date</span>
                                <strong>{formatDateLabel(product.harvest_date, "Daily Harvest")}</strong>
                            </div>
                            <div className={styles["spec-item"]}>
                                <span>Best Before / Expiry</span>
                                <strong>{formatDateLabel(product.expiry_date, "Fresh Produce")}</strong>
                            </div>
                            <div className={styles["spec-item"]}>
                                <span>Added to Catalog</span>
                                <strong>{formatDateLabel(product.created_at, "—")}</strong>
                            </div>
                            <div className={styles["spec-item"]}>
                                <span>Storage Tips</span>
                                <strong>
                                    {product.storage_tips || "Refrigerate at 2°C–6°C"}
                                </strong>
                            </div>
                        </div>
                    </div>

                    {/* Nutritional Facts Section */}
                    <div className={styles["details-section"]}>
                        <h4>
                            <span className="material-symbols-outlined">nutrition</span>
                            Nutritional Information (Per 100g)
                        </h4>
                        <div className={styles["nutrition-grid"]}>
                            <div className={styles["macro-card"]}>
                                <span>Calories</span>
                                <strong>{nutrition.calories || "110 kcal"}</strong>
                            </div>
                            <div className={styles["macro-card"]}>
                                <span>Protein</span>
                                <strong>{nutrition.protein || "3.5g"}</strong>
                            </div>
                            <div className={styles["macro-card"]}>
                                <span>Carbs</span>
                                <strong>{nutrition.carbs || "12.0g"}</strong>
                            </div>
                            <div className={styles["macro-card"]}>
                                <span>Total Fat</span>
                                <strong>{nutrition.fat || "1.5g"}</strong>
                            </div>
                            <div className={styles["macro-card"]}>
                                <span>Dietary Fiber</span>
                                <strong>{nutrition.fiber || "3.0g"}</strong>
                            </div>
                        </div>
                        {vitamins.length > 0 && (
                            <div className={styles["vitamins-row"]}>
                                <span className={styles["vit-label"]}>Vitamins & Minerals:</span>
                                {vitamins.map((v, i) => (
                                    <span key={`${v}-${i}`} className={styles["vit-chip"]}>
                                        {v}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Verified Customer Reviews */}
                    {reviews.length > 0 && (
                        <div className={styles["details-section"]}>
                            <h4>
                                <span className="material-symbols-outlined">reviews</span>
                                Recent Verified Reviews ({reviews.length})
                            </h4>
                            <div className={styles["reviews-list"]}>
                                {reviews.slice(0, 3).map((rev, i) => (
                                    <div key={rev._id || i} className={styles["review-card"]}>
                                        <div className={styles["review-top"]}>
                                            <strong>{rev.user_name || "Verified Buyer"}</strong>
                                            <span>
                                                Product: ★ {rev.product_rating || 5} • Seller: ★{" "}
                                                {rev.seller_rating || 5}
                                            </span>
                                        </div>
                                        {rev.comment && <p>{rev.comment}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer Actions */}
                <div className={styles["modal-footer"]}>
                    <div className={styles["footer-left"]}>
                        {!isTrashed && approvalStatus === "APPROVED" && (
                            <Link
                                to={`/products/${product.product_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles["storefront-link"]}
                            >
                                <span className="material-symbols-outlined">open_in_new</span>
                                View Live Storefront Page
                            </Link>
                        )}
                        {!isTrashed && approvalStatus !== "APPROVED" && onApprovePublish && (
                            <button
                                type="button"
                                className={styles["btn-approve"]}
                                onClick={() => onApprovePublish(product)}
                            >
                                Approve & Publish ✓
                            </button>
                        )}
                    </div>
                    <div className={styles["footer-right"]}>
                        {!isTrashed && onFullEdit && (
                            <button
                                type="button"
                                className={styles["btn-edit"]}
                                onClick={() => onFullEdit(product)}
                            >
                                <span className="material-symbols-outlined">edit_note</span>
                                Full Edit Product
                            </button>
                        )}
                        {!isTrashed && onMoveToTrash && (
                            <button
                                type="button"
                                className={styles["btn-danger"]}
                                onClick={() => onMoveToTrash(product)}
                            >
                                <span className="material-symbols-outlined">delete_outline</span>
                                Move to Trash
                            </button>
                        )}
                        {isTrashed && onRestore && (
                            <button
                                type="button"
                                className={styles["btn-approve"]}
                                onClick={() => onRestore(product)}
                            >
                                <span className="material-symbols-outlined">restore_from_trash</span>
                                Restore Product
                            </button>
                        )}
                        <button type="button" className={styles["btn-close"]} onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminProductViewModal;
