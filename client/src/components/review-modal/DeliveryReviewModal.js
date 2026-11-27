import styles from './deliveryReviewModal.module.css';
import {useEffect, useState} from "react";
import * as api from "../../api";
import {queryClient} from "../../index";

const StarSelector = ({value, onChange, label}) => {
    const [hovered, setHovered] = useState(0);
    const activeRating = hovered || value;

    const ratingLabels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent!"];

    return (
        <div className={styles['star-row']}>
            <span className={styles['star-label']}>{label}</span>
            <div className={styles['stars-box']}>
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => onChange(star)}
                        className={`${styles['star-btn']} ${star <= activeRating ? styles['star-active'] : ''}`}
                    >
                        ★
                    </button>
                ))}
                <span className={styles['rating-word']}>{ratingLabels[activeRating]}</span>
            </div>
        </div>
    );
};

const DeliveryReviewModal = ({notification, onClose}) => {
    const products = notification?.products || [];
    const orderId = notification?.order_id;

    const initialRatings = () => {
        const map = {};
        for (const p of products) {
            map[p.product_id] = {
                product_rating: 5,
                seller_rating: 5,
                comment: "",
                submitted: Boolean(p.reviewed),
                submitting: false,
            };
        }
        return map;
    };

    const [ratingsMap, setRatingsMap] = useState(initialRatings);
    const [statusMessage, setStatusMessage] = useState("");

    useEffect(() => {
        if (!notification) return;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [notification, onClose]);

    if (!notification) return null;

    const updateField = (productId, field, value) => {
        setRatingsMap((prev) => ({
            ...prev,
            [productId]: {
                ...prev[productId],
                [field]: value,
            },
        }));
    };

    const handleSubmitItemReview = async (item) => {
        const entry = ratingsMap[item.product_id];
        if (!entry || entry.submitting) return;

        updateField(item.product_id, "submitting", true);
        try {
            await api.postProductReview(item.product_id, {
                product_rating: entry.product_rating,
                seller_rating: entry.seller_rating,
                comment: entry.comment,
                order_id: orderId,
            });
            updateField(item.product_id, "submitted", true);
            updateField(item.product_id, "submitting", false);
            setStatusMessage(`✓ Review saved for ${item.name}!`);
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['pendingReviews']});
            queryClient.invalidateQueries({queryKey: ['product', item.product_id]});
            queryClient.invalidateQueries({queryKey: ['products']});
        } catch (err) {
            updateField(item.product_id, "submitting", false);
            setStatusMessage(err.response?.data?.message || "Failed to submit review.");
        }
    };

    const handleDismiss = async () => {
        try {
            if (notification._id) {
                await api.markNotificationRead(notification._id, true);
                queryClient.invalidateQueries({queryKey: ['notifications']});
            }
        } catch {
            // ignore
        }
        onClose();
    };

    return (
        <div className={styles['backdrop']} onClick={handleDismiss}>
            <div className={styles['modal']} onClick={(e) => e.stopPropagation()}>
                <div className={styles['modal-header']}>
                    <div>
                        <span className={styles['badge']}>
                            🎉 ORDER #{orderId} DELIVERED
                        </span>
                        <h2>Rate Your Delivered Products & Seller</h2>
                        <p>
                            Your groceries have arrived! Share your feedback on product freshness and the farm seller.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className={styles['close-btn']}
                        aria-label="Close review popup"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {statusMessage && (
                    <div className={styles['status-banner']}>{statusMessage}</div>
                )}

                <div className={styles['items-list']}>
                    {products.map((item) => {
                        const entry = ratingsMap[item.product_id] || {
                            product_rating: 5,
                            seller_rating: 5,
                            comment: "",
                            submitted: Boolean(item.reviewed),
                        };

                        return (
                            <div key={item.product_id} className={styles['item-card']}>
                                <div className={styles['item-top']}>
                                    <img
                                        src={item.image}
                                        alt={item.name}
                                        className={styles['item-img']}
                                    />
                                    <div className={styles['item-meta']}>
                                        <strong>{item.name}</strong>
                                        <small>Seller: {item.seller_name || "KijaniMart Farm Partner"}</small>
                                    </div>
                                    {entry.submitted && (
                                        <span className={styles['reviewed-pill']}>✓ Reviewed</span>
                                    )}
                                </div>

                                {!entry.submitted && (
                                    <div className={styles['item-form']}>
                                        <StarSelector
                                            label="Product Quality:"
                                            value={entry.product_rating}
                                            onChange={(val) =>
                                                updateField(item.product_id, "product_rating", val)
                                            }
                                        />
                                        <StarSelector
                                            label="Seller Service:"
                                            value={entry.seller_rating}
                                            onChange={(val) =>
                                                updateField(item.product_id, "seller_rating", val)
                                            }
                                        />
                                        <div className={styles['comment-row']}>
                                            <input
                                                type="text"
                                                value={entry.comment}
                                                onChange={(e) =>
                                                    updateField(item.product_id, "comment", e.target.value)
                                                }
                                                placeholder={`How was the freshness of ${item.name}?`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleSubmitItemReview(item)}
                                                disabled={entry.submitting}
                                                className="btn1"
                                            >
                                                {entry.submitting ? "Saving..." : "Submit ★"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className={styles['modal-footer']}>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className={styles['later-btn']}
                    >
                        Done / Remind Me Later
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeliveryReviewModal;
