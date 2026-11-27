import styles from './pendingReviews.module.css';
import {useState} from "react";
import {Link} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../api";
import {queryClient} from "../../index";
import Loading from "../loading/Loading";

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'];

const StarPicker = ({label, value, onChange}) => {
    const [hover, setHover] = useState(0);
    const active = hover || value;

    return (
        <div className={styles['star-row']}>
            <span className={styles['star-label']}>{label}</span>
            <div className={styles['stars-wrap']}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        onClick={() => onChange(n)}
                        className={`${styles['star-btn']} ${n <= active ? styles['star-lit'] : ''}`}
                        aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    >
                        ★
                    </button>
                ))}
                <span className={styles['rating-word']}>{RATING_LABELS[active]}</span>
            </div>
        </div>
    );
};

const formatDateShort = (val) => {
    if (!val) return 'Recent';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

const PendingReviewsSection = ({embedded = false}) => {
    const [viewMode, setViewMode] = useState('PENDING'); // 'PENDING' | 'REVIEWED'
    const [openKey, setOpenKey] = useState(null);
    const [drafts, setDrafts] = useState({});
    const [submittingKey, setSubmittingKey] = useState(null);
    const [toast, setToast] = useState('');
    const [error, setError] = useState('');

    const {data, isPending} = useQuery({
        queryKey: ['pendingReviews'],
        queryFn: async () => {
            const res = await api.fetchPendingReviews();
            return res.data;
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    const pendingItems = data?.pending || [];
    const reviewedItems = data?.reviewed || [];

    const getDraft = (key) =>
        drafts[key] || {
            product_rating: 5,
            seller_rating: 5,
            comment: '',
        };

    const updateDraft = (key, field, value) => {
        setDrafts((prev) => ({
            ...prev,
            [key]: {
                ...getDraft(key),
                [field]: value,
            },
        }));
    };

    const handleSubmitInlineReview = async (item) => {
        const key = `${item.order_id}::${item.product_id}`;
        const draft = getDraft(key);
        setSubmittingKey(key);
        setError('');
        try {
            await api.postProductReview(item.product_id, {
                product_rating: draft.product_rating,
                seller_rating: draft.seller_rating,
                comment: draft.comment,
                order_id: item.order_id,
            });
            setOpenKey(null);
            setToast(`✓ Thank you! Your review for ${item.name} has been published.`);
            setTimeout(() => setToast(''), 4500);
            queryClient.invalidateQueries({queryKey: ['pendingReviews']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['product', item.product_id]});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['userProfile']});
        } catch (err) {
            setError(err.response?.data?.message || 'Could not submit review. Please try again.');
        } finally {
            setSubmittingKey(null);
        }
    };

    return (
        <div className={embedded ? styles['embedded-root'] : styles['standalone-root']}>
            {toast && <div className={styles['toast-ok']}>{toast}</div>}
            {error && <div className={styles['toast-err']}>{error}</div>}

            <div className={styles['header-row']}>
                <div>
                    <h3>{embedded ? 'Products Pending Your Review' : 'Pending Product & Seller Reviews'}</h3>
                    <p>
                        Rate delivered groceries to help other shoppers and reward top farm partners.
                    </p>
                </div>

                <div className={styles['mode-pills']}>
                    <button
                        type="button"
                        onClick={() => setViewMode('PENDING')}
                        className={`${styles['mode-pill']} ${
                            viewMode === 'PENDING' ? styles['mode-pill-active'] : ''
                        }`}
                    >
                        <span>Pending Review</span>
                        <span className={styles['pill-count']}>{pendingItems.length}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('REVIEWED')}
                        className={`${styles['mode-pill']} ${
                            viewMode === 'REVIEWED' ? styles['mode-pill-active'] : ''
                        }`}
                    >
                        <span>Reviewed</span>
                        <span className={styles['pill-count']}>{reviewedItems.length}</span>
                    </button>
                </div>
            </div>

            {isPending ? (
                <Loading/>
            ) : viewMode === 'PENDING' ? (
                pendingItems.length === 0 ? (
                    <div className={styles['empty-state']}>
                        <div className={styles['empty-icon']}>
                            <span className="material-symbols-outlined">verified</span>
                        </div>
                        <h4>You&apos;re all caught up!</h4>
                        <p>
                            You have no delivered items waiting for a review right now. Once new
                            orders are delivered, they will appear right here so you can rate them.
                        </p>
                        <div className={styles['empty-actions']}>
                            <Link to="/shipping" className={styles['btn-secondary']}>
                                View My Orders
                            </Link>
                            <Link to="/products" className="btn1">
                                <span>Shop Fresh Groceries</span>
                                <span className="material-symbols-outlined">storefront</span>
                            </Link>
                        </div>
                    </div>
                ) : (
                    <div className={styles['list']}>
                        {pendingItems.map((item) => {
                            const key = `${item.order_id}::${item.product_id}`;
                            const isExpanded = openKey === key || pendingItems.length === 1;
                            const draft = getDraft(key);
                            const isSubmitting = submittingKey === key;

                            return (
                                <article key={key} className={styles['review-card']}>
                                    <div className={styles['card-main']}>
                                        <Link
                                            to={`/products/${item.product_id}`}
                                            className={styles['thumb']}
                                        >
                                            {item.image ? (
                                                <img src={item.image} alt={item.name}/>
                                            ) : (
                                                <span className="material-symbols-outlined">
                                                    nutrition
                                                </span>
                                            )}
                                        </Link>

                                        <div className={styles['info']}>
                                            <div className={styles['meta-chips']}>
                                                <Link
                                                    to={`/orders/${item.order_id}`}
                                                    className={styles['order-chip']}
                                                >
                                                    Order #{item.order_id}
                                                </Link>
                                                <span className={styles['delivered-chip']}>
                                                    ✓ Delivered {formatDateShort(item.delivered_at)}
                                                </span>
                                            </div>

                                            <Link
                                                to={`/products/${item.product_id}`}
                                                className={styles['prod-title']}
                                            >
                                                {item.name}
                                            </Link>

                                            <div className={styles['sub-meta']}>
                                                <span>Qty: {item.quantity}</span>
                                                {item.weight && (
                                                    <span>
                                                        • {item.weight} {item.measurement}
                                                    </span>
                                                )}
                                                <span>• Seller: {item.seller_name}</span>
                                            </div>
                                        </div>

                                        <div className={styles['card-actions']}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setOpenKey(isExpanded && pendingItems.length > 1 ? null : key)
                                                }
                                                className={styles['rate-toggle-btn']}
                                            >
                                                <span className="material-symbols-outlined">
                                                    rate_review
                                                </span>
                                                <span>
                                                    {isExpanded ? 'Hide Form' : 'Rate Product ★'}
                                                </span>
                                            </button>

                                            <Link
                                                to={`/products/${item.product_id}?review=true&order=${item.order_id}`}
                                                className={styles['product-link']}
                                            >
                                                Open Product ↗
                                            </Link>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className={styles['inline-form']}>
                                            <div className={styles['stars-grid']}>
                                                <StarPicker
                                                    label="Product Freshness & Quality:"
                                                    value={draft.product_rating}
                                                    onChange={(val) =>
                                                        updateDraft(key, 'product_rating', val)
                                                    }
                                                />
                                                <StarPicker
                                                    label="Seller & Packaging Service:"
                                                    value={draft.seller_rating}
                                                    onChange={(val) =>
                                                        updateDraft(key, 'seller_rating', val)
                                                    }
                                                />
                                            </div>

                                            <div className={styles['comment-row']}>
                                                <input
                                                    type="text"
                                                    value={draft.comment}
                                                    onChange={(e) =>
                                                        updateDraft(key, 'comment', e.target.value)
                                                    }
                                                    placeholder={`Share your experience with ${item.name} (freshness, taste, delivery)...`}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={isSubmitting}
                                                    onClick={() => handleSubmitInlineReview(item)}
                                                    className="btn1"
                                                >
                                                    <span>
                                                        {isSubmitting
                                                            ? 'Publishing...'
                                                            : 'Submit Review'}
                                                    </span>
                                                    <span className="material-symbols-outlined">
                                                        star
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )
            ) : reviewedItems.length === 0 ? (
                <div className={styles['empty-state']}>
                    <div className={styles['empty-icon']}>
                        <span className="material-symbols-outlined">reviews</span>
                    </div>
                    <h4>No completed reviews yet</h4>
                    <p>
                        Once you submit reviews for your delivered groceries, they will be listed
                        here for your reference.
                    </p>
                </div>
            ) : (
                <div className={styles['list']}>
                    {reviewedItems.map((item) => {
                        const key = `done-${item.order_id}::${item.product_id}`;
                        const rev = item.review || {};
                        return (
                            <article key={key} className={styles['review-card']}>
                                <div className={styles['card-main']}>
                                    <Link
                                        to={`/products/${item.product_id}`}
                                        className={styles['thumb']}
                                    >
                                        {item.image ? (
                                            <img src={item.image} alt={item.name}/>
                                        ) : (
                                            <span className="material-symbols-outlined">
                                                nutrition
                                            </span>
                                        )}
                                    </Link>

                                    <div className={styles['info']}>
                                        <div className={styles['meta-chips']}>
                                            <Link
                                                to={`/orders/${item.order_id}`}
                                                className={styles['order-chip']}
                                            >
                                                Order #{item.order_id}
                                            </Link>
                                            <span className={styles['done-chip']}>
                                                ★ Reviewed {formatDateShort(rev.created_at)}
                                            </span>
                                        </div>

                                        <Link
                                            to={`/products/${item.product_id}`}
                                            className={styles['prod-title']}
                                        >
                                            {item.name}
                                        </Link>

                                        <div className={styles['rating-summary']}>
                                            <span>
                                                Product:{' '}
                                                <strong>
                                                    {'★'.repeat(Number(rev.product_rating || 5))}
                                                </strong>{' '}
                                                ({rev.product_rating}/5)
                                            </span>
                                            <span>•</span>
                                            <span>
                                                Seller:{' '}
                                                <strong>
                                                    {'★'.repeat(Number(rev.seller_rating || 5))}
                                                </strong>{' '}
                                                ({rev.seller_rating}/5)
                                            </span>
                                        </div>

                                        {rev.comment && (
                                            <p className={styles['saved-comment']}>
                                                &ldquo;{rev.comment}&rdquo;
                                            </p>
                                        )}
                                    </div>

                                    <div className={styles['card-actions']}>
                                        <Link
                                            to={`/products/${item.product_id}?review=true&order=${item.order_id}`}
                                            className={styles['product-link']}
                                        >
                                            Edit Review ↗
                                        </Link>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PendingReviewsSection;
