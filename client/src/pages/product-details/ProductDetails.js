import styles from './productDetails.module.css';
import {useContext, useEffect, useRef, useState} from "react";
import {Link, useLocation, useNavigate, useParams} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../api";
import {queryClient} from "../../index";
import {CartContext} from "../../App";
import {updateWishlist} from "../../actions/auth";
import Loading from "../../components/loading/Loading";
import ProductCard from "../../components/product-card/ProductCard";
import {
    trackProductDwell,
    trackProductView,
    trackWishlistAdd,
} from "../../utils/tracker";
import {
    formatKES,
    getDiscountPercent,
    getEffectivePrice,
    getOriginalPrice,
    getUnitSavings,
} from "../../utils/pricing";

const ProductDetails = ({addProductToCart}) => {
    const {id} = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const reviewSectionRef = useRef(null);
    const user = useSelector((state) => state.authentication.user);
    const isAuthenticated = Boolean(user || localStorage.getItem('profile'));
    const wishlist = user?.wishlist || [];

    const queryParams = new URLSearchParams(location.search);
    const reviewOrderId = queryParams.get('order') || '';
    const autoFocusReview = queryParams.get('review') === 'true';

    const {
        cart = [],
        addProductToCart: contextAddToCart,
        removeProductFromCart: contextRemoveFromCart,
    } = useContext(CartContext);

    const addFn = contextAddToCart || addProductToCart;
    const cartEntry = cart.find((item) => item.product_id === id);
    const quantityInCart = Number(cartEntry?.quantity || 0);

    const [activeImageIdx, setActiveImageIdx] = useState(0);

    // Review Form State (only active if user ordered & received this product)
    const [productRating, setProductRating] = useState(5);
    const [sellerRating, setSellerRating] = useState(5);
    const [reviewComment, setReviewComment] = useState("");
    const [isEditingExistingReview, setIsEditingExistingReview] = useState(false);
    const [submittingReview, setSubmittingReview] = useState(false);
    const [reviewFeedback, setReviewFeedback] = useState("");
    const [reviewError, setReviewError] = useState("");

    const findCachedProductPreview = (targetId) => {
        if (!targetId) return undefined;
        const allQueries = queryClient.getQueryCache().getAll();
        for (const q of allQueries) {
            const val = q.state?.data;
            if (!val) continue;
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (item?.product_id === targetId) return item;
                    if (Array.isArray(item?.products)) {
                        const found = item.products.find((p) => p?.product_id === targetId);
                        if (found) return found;
                    }
                }
            } else if (Array.isArray(val?.pages)) {
                for (const page of val.pages) {
                    const found = (page?.products || []).find((p) => p?.product_id === targetId);
                    if (found) return found;
                }
            }
        }
        return undefined;
    };

    const {data: product, isPending, isError} = useQuery({
        queryKey: ['product', id],
        queryFn: async () => {
            const res = await api.getProductById(id);
            return res.data;
        },
        enabled: Boolean(id),
        staleTime: 2 * 60 * 1000,
        placeholderData: () => findCachedProductPreview(id),
    });

    const {data: eligibility} = useQuery({
        queryKey: ['reviewEligibility', id, reviewOrderId],
        queryFn: async () => {
            const res = await api.checkProductReviewEligibility(id, reviewOrderId);
            return res.data;
        },
        enabled: Boolean(id) && isAuthenticated,
        staleTime: 60 * 1000,
    });

    useEffect(() => {
        setActiveImageIdx(0);
        setReviewFeedback("");
        setReviewError("");
        setIsEditingExistingReview(false);
    }, [id]);

    useEffect(() => {
        if (autoFocusReview && product && reviewSectionRef.current) {
            reviewSectionRef.current.scrollIntoView({behavior: 'smooth', block: 'start'});
        }
    }, [autoFocusReview, product]);

    // Record VIEW + active visible DWELL time spent on this product for personalized recommendations
    useEffect(() => {
        if (!product?.product_id) return;

        trackProductView(product);

        let accumulatedMs = 0;
        let visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
        let flushed = false;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                if (visibleSince !== null) {
                    accumulatedMs += Date.now() - visibleSince;
                    visibleSince = null;
                }
            } else {
                visibleSince = Date.now();
            }
        };

        const flushDwell = () => {
            if (flushed) return;
            flushed = true;
            if (visibleSince !== null) {
                accumulatedMs += Date.now() - visibleSince;
                visibleSince = null;
            }
            if (accumulatedMs >= 2000) {
                trackProductDwell(product, accumulatedMs);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', flushDwell);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', flushDwell);
            flushDwell();
        };
    }, [product?.product_id]);

    if (isPending) {
        return <Loading/>;
    }

    if (isError || !product) {
        return (
            <div className={styles['not-found']}>
                <h2>Product Not Found</h2>
                <p>This product is no longer available or may have been moved.</p>
                <Link to="/products" className="btn1">
                    Browse Products
                </Link>
            </div>
        );
    }

    const isWishlisted = wishlist.includes(product.product_id);
    const discountPct = getDiscountPercent(product);
    const originalPrice = getOriginalPrice(product);
    const effectiveUnitPrice = getEffectivePrice(product);
    const unitSavings = getUnitSavings(product);

    const maxQty = Math.max(1, Number(product.stock || 1));
    const activeQty = Math.max(1, quantityInCart);
    const lineEffectiveTotal = Number((effectiveUnitPrice * activeQty).toFixed(2));
    const lineTotalSavings = Number((unitSavings * activeQty).toFixed(2));

    const handleWishlist = () => {
        if (!isAuthenticated) {
            return navigate('/login', {
                state: {
                    from: `/products/${product.product_id}`,
                    message: "Please sign in to save items to your wishlist.",
                },
            });
        }
        if (!isWishlisted) {
            trackWishlistAdd(product);
        }
        dispatch(updateWishlist(product.product_id, () => navigate('/login')));
    };

    const handleInitialAdd = () => {
        if (!isAuthenticated) {
            return navigate('/login', {
                state: {
                    from: `/products/${product.product_id}`,
                    message: "Please sign in to add items to your cart.",
                },
            });
        }
        if (!product.stock) return;
        addFn(product, 1);
    };

    const handleIncrement = () => {
        if (!isAuthenticated) {
            return navigate('/login', {
                state: {
                    from: `/products/${product.product_id}`,
                    message: "Please sign in to update your cart.",
                },
            });
        }
        if (product.stock && quantityInCart >= maxQty) return;
        addFn(product, 1);
    };

    const handleDecrement = () => {
        if (contextRemoveFromCart) {
            contextRemoveFromCart(product);
        }
    };

    const formatDate = (dateVal) => {
        if (!dateVal) return "Daily Harvest";
        try {
            return new Date(dateVal).toLocaleDateString("en-KE", {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch {
            return "Daily Harvest";
        }
    };

    const seller = product.seller || {
        name: "KijaniMart Farm Partner",
        verified: true,
        rating: 4.9,
        location: "Nairobi, Kenya",
    };

    const nutrition = product.nutrition || {
        calories: "110 kcal / 100g",
        protein: "4.0g",
        carbs: "12.0g",
        fat: "2.0g",
        fiber: "3.0g",
        vitamins: ["Vitamin A", "Vitamin C", "Calcium"],
    };

    const related = product.related_products || [];
    const reviewsList = Array.isArray(product.reviews) ? product.reviews : [];
    const canUserReview = Boolean(eligibility?.canReview);
    const alreadyReviewed = Boolean(eligibility?.alreadyReviewed);
    const existingReview = eligibility?.existingReview || null;
    const eligibleOrderId = eligibility?.eligibleOrderId || reviewOrderId;

    const startEditingReview = () => {
        if (existingReview) {
            setProductRating(Number(existingReview.product_rating || 5));
            setSellerRating(Number(existingReview.seller_rating || 5));
            setReviewComment(existingReview.comment || "");
        }
        setReviewFeedback("");
        setReviewError("");
        setIsEditingExistingReview(true);
    };

    const galleryImages = Array.from(
        new Set(
            [
                product.image,
                ...(Array.isArray(product.images) ? product.images : []),
            ].filter(Boolean)
        )
    );
    const currentSlideImage = galleryImages[activeImageIdx] || product.image;

    const handlePrevSlide = () => {
        setActiveImageIdx((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
    };

    const handleNextSlide = () => {
        setActiveImageIdx((prev) => (prev + 1) % galleryImages.length);
    };

    // Rating distribution for 5-star breakdown bars
    const ratingCounts = [5, 4, 3, 2, 1].map((star) => {
        const count = reviewsList.filter((r) => Math.round(Number(r.product_rating || 5)) === star).length;
        const pct = reviewsList.length > 0 ? Math.round((count / reviewsList.length) * 100) : 0;
        return {star, count, pct};
    });

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!canUserReview) return;

        setSubmittingReview(true);
        setReviewError("");
        setReviewFeedback("");

        try {
            const res = await api.postProductReview(product.product_id, {
                product_rating: productRating,
                seller_rating: sellerRating,
                comment: reviewComment,
                order_id: eligibleOrderId || undefined,
            });
            setReviewFeedback(res.data?.message || "Your review has been published.");
            setReviewComment("");
            setIsEditingExistingReview(false);
            queryClient.invalidateQueries({queryKey: ['product', id]});
            queryClient.invalidateQueries({queryKey: ['reviewEligibility', id]});
            queryClient.invalidateQueries({queryKey: ['products']});
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['pendingReviews']});
        } catch (err) {
            setReviewError(
                err.response?.data?.message || "Could not submit your review."
            );
        } finally {
            setSubmittingReview(false);
        }
    };

    return (
        <div className={styles['page']}>
            <div className={styles['container']}>
                {/* Minimal Breadcrumb */}
                <nav className={styles['breadcrumbs']}>
                    <Link to="/">Home</Link>
                    <span>/</span>
                    <Link to="/products">Products</Link>
                    {product.category && (
                        <>
                            <span>/</span>
                            <Link to={`/products?category=${encodeURIComponent(product.category)}`}>
                                {product.category}
                            </Link>
                        </>
                    )}
                    <span>/</span>
                    <span className={styles['crumb-current']}>{product.name}</span>
                </nav>

                {/* Primary Product Split View */}
                <div className={styles['product-main']}>
                    {/* Left: Multi-Image Slider & Thumbnail Strip */}
                    <div className={styles['gallery-column']}>
                        <div className={styles['gallery']}>
                            {discountPct > 0 && (
                                <span className={styles['discount-tag']}>
                                    {product.flash_sale ? `Flash Sale · ${discountPct}% Off` : `${discountPct}% Off`}
                                </span>
                            )}

                            {galleryImages.length > 1 && (
                                <button
                                    type="button"
                                    onClick={handlePrevSlide}
                                    className={`${styles['slider-arrow']} ${styles['slider-prev']}`}
                                    aria-label="Previous image"
                                >
                                    <span className="material-symbols-outlined">chevron_left</span>
                                </button>
                            )}

                            <img
                                src={currentSlideImage}
                                alt={`${product.name} (${activeImageIdx + 1})`}
                                className={styles['main-image']}
                            />

                            {galleryImages.length > 1 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleNextSlide}
                                        className={`${styles['slider-arrow']} ${styles['slider-next']}`}
                                        aria-label="Next image"
                                    >
                                        <span className="material-symbols-outlined">chevron_right</span>
                                    </button>
                                    <span className={styles['slide-counter']}>
                                        {activeImageIdx + 1} / {galleryImages.length}
                                    </span>
                                </>
                            )}
                        </div>

                        {galleryImages.length > 1 && (
                            <div className={styles['thumbs-strip']}>
                                {galleryImages.map((imgUrl, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setActiveImageIdx(idx)}
                                        className={`${styles['thumb-btn']} ${
                                            idx === activeImageIdx ? styles['thumb-active'] : ''
                                        }`}
                                        aria-label={`View image ${idx + 1}`}
                                    >
                                        <img src={imgUrl} alt={`${product.name} thumbnail ${idx + 1}`}/>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: Clean Editorial Details */}
                    <div className={styles['summary']}>
                        <div className={styles['meta-line']}>
                            <span>{product.brand || seller.name}</span>
                            {product.sku && <span>· SKU {product.sku}</span>}
                        </div>

                        <h1 className={styles['title']}>{product.name}</h1>

                        <div className={styles['sub-meta']}>
                            <a href="#reviews" className={styles['rating-link']}>
                                <span className={styles['stars']}>★</span>
                                <strong>{product.rating || 4.8}</strong>
                                <span className={styles['muted']}>
                                    ({product.reviews_count || reviewsList.length} reviews)
                                </span>
                            </a>
                            <span className={styles['sep']}>·</span>
                            <span>{product.weight} {product.measurement}</span>
                            <span className={styles['sep']}>·</span>
                            <span className={product.stock > 0 ? styles['in-stock'] : styles['out-stock']}>
                                {product.stock > 0 ? `In stock (${product.stock})` : "Out of stock"}
                            </span>
                        </div>

                        {/* Clean Price Block */}
                        <div className={styles['price-block']}>
                            <div className={styles['price-line']}>
                                <span className={styles['current-price']}>
                                    KES {formatKES(effectiveUnitPrice)}
                                </span>
                                {discountPct > 0 && (
                                    <>
                                        <span className={styles['original-price']}>
                                            KES {formatKES(originalPrice)}
                                        </span>
                                        <span className={styles['saving-text']}>
                                            Save KES {formatKES(unitSavings)} ({discountPct}%)
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        <p className={styles['description']}>
                            {product.description}
                        </p>

                        {/* Action Bar: Shows Add to Cart button OR Live Cart Counter when already in cart */}
                        <div className={styles['purchase-bar']}>
                            {quantityInCart > 0 ? (
                                <>
                                    <div className={styles['in-cart-stepper']}>
                                        <button
                                            type="button"
                                            onClick={handleDecrement}
                                            className={styles['step-icon-btn']}
                                            aria-label="Decrease quantity in cart"
                                        >
                                            <span className="material-symbols-outlined">remove</span>
                                        </button>
                                        <div className={styles['step-status']}>
                                            <strong>{quantityInCart} in Cart</strong>
                                            <small>KES {formatKES(lineEffectiveTotal)}</small>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleIncrement}
                                            disabled={quantityInCart >= maxQty}
                                            className={styles['step-icon-btn']}
                                            aria-label="Increase quantity in cart"
                                        >
                                            <span className="material-symbols-outlined">add</span>
                                        </button>
                                    </div>

                                    <Link to="/cart" className={styles['view-cart-btn']}>
                                        <span>View Cart</span>
                                        <span className="material-symbols-outlined">shopping_bag</span>
                                    </Link>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleInitialAdd}
                                    disabled={!product.stock}
                                    className={styles['add-cart-btn']}
                                >
                                    {product.stock
                                        ? `Add to Cart — KES ${formatKES(effectiveUnitPrice)}`
                                        : "Out of Stock"}
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={handleWishlist}
                                className={`${styles['wishlist-btn']} ${isWishlisted ? styles['wishlist-active'] : ''}`}
                                aria-label="Save to wishlist"
                                title="Save to wishlist"
                            >
                                <span className="material-symbols-outlined">favorite</span>
                            </button>
                        </div>

                        {quantityInCart > 0 && discountPct > 0 && (
                            <p className={styles['bulk-saving-note']}>
                                You are saving KES {formatKES(lineTotalSavings)} on the {quantityInCart} {quantityInCart === 1 ? 'unit' : 'units'} in your cart.
                            </p>
                        )}

                        {/* Clean Hairline Specification List */}
                        <dl className={styles['specs-list']}>
                            <div className={styles['spec-row']}>
                                <dt>Seller</dt>
                                <dd>
                                    <strong>{seller.name}</strong> ({seller.location}) · ★ {seller.rating || 4.9}
                                </dd>
                            </div>
                            <div className={styles['spec-row']}>
                                <dt>Origin</dt>
                                <dd>{product.origin || "Kenya"}</dd>
                            </div>
                            <div className={styles['spec-row']}>
                                <dt>Packed / Harvested</dt>
                                <dd>{formatDate(product.harvest_date || product.created_at)}</dd>
                            </div>
                            <div className={styles['spec-row']}>
                                <dt>Shelf Life & Storage</dt>
                                <dd>{product.shelf_life || "7 Days"} · {product.storage_tips}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Nutrition Table Section */}
                <section className={styles['nutrition-section']}>
                    <h2 className={styles['section-heading']}>Nutritional Information</h2>
                    <div className={styles['nutrition-table']}>
                        <div className={styles['nutri-cell']}>
                            <span>Calories</span>
                            <strong>{nutrition.calories}</strong>
                        </div>
                        <div className={styles['nutri-cell']}>
                            <span>Protein</span>
                            <strong>{nutrition.protein}</strong>
                        </div>
                        <div className={styles['nutri-cell']}>
                            <span>Carbohydrates</span>
                            <strong>{nutrition.carbs}</strong>
                        </div>
                        <div className={styles['nutri-cell']}>
                            <span>Total Fat</span>
                            <strong>{nutrition.fat}</strong>
                        </div>
                        <div className={styles['nutri-cell']}>
                            <span>Dietary Fiber</span>
                            <strong>{nutrition.fiber}</strong>
                        </div>
                        {Array.isArray(nutrition.vitamins) && nutrition.vitamins.length > 0 && (
                            <div className={styles['nutri-cell']}>
                                <span>Micronutrients</span>
                                <strong>{nutrition.vitamins.join(", ")}</strong>
                            </div>
                        )}
                    </div>
                </section>

                {/* Customer Reviews Section */}
                <section id="reviews" ref={reviewSectionRef} className={styles['reviews-section']}>
                    <div className={styles['reviews-layout']}>
                        {/* Left Column: Rating Breakdown & Gated Review Policy */}
                        <div className={styles['reviews-sidebar']}>
                            <h2 className={styles['section-heading']}>Customer Reviews</h2>

                            <div className={styles['overall-score']}>
                                <span className={styles['big-score']}>{product.rating || 4.8}</span>
                                <div>
                                    <div className={styles['score-stars']}>
                                        {"★".repeat(Math.round(Number(product.rating || 5)))}
                                    </div>
                                    <span className={styles['score-count']}>
                                        Based on {product.reviews_count || reviewsList.length} verified deliveries
                                    </span>
                                </div>
                            </div>

                            <div className={styles['bars-list']}>
                                {ratingCounts.map((row) => (
                                    <div key={row.star} className={styles['bar-row']}>
                                        <span className={styles['bar-label']}>{row.star} ★</span>
                                        <div className={styles['bar-track']}>
                                            <div
                                                className={styles['bar-fill']}
                                                style={{width: `${row.pct}%`}}
                                            />
                                        </div>
                                        <span className={styles['bar-count']}>{row.count}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Strictly only allow rating if the user ordered and received the product */}
                            {canUserReview ? (
                                alreadyReviewed && !isEditingExistingReview ? (
                                    <div className={styles['reviewed-box']}>
                                        <div className={styles['reviewed-head']}>
                                            <span className={styles['reviewed-badge']}>
                                                ✓ Review Submitted
                                            </span>
                                            {eligibleOrderId && (
                                                <span className={styles['order-tag']}>
                                                    Order #{eligibleOrderId}
                                                </span>
                                            )}
                                        </div>

                                        {reviewFeedback && (
                                            <div className={styles['feedback-ok']}>{reviewFeedback}</div>
                                        )}

                                        <p className={styles['reviewed-sub']}>
                                            Thank you! You have already rated this delivered product.
                                        </p>

                                        {existingReview && (
                                            <div className={styles['reviewed-summary']}>
                                                <div>
                                                    <small>Your Product Rating</small>
                                                    <strong className={styles['reviewed-stars']}>
                                                        {"★".repeat(Number(existingReview.product_rating || 5))}
                                                        {"☆".repeat(Math.max(0, 5 - Number(existingReview.product_rating || 5)))}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <small>Your Seller Rating</small>
                                                    <strong className={styles['reviewed-stars']}>
                                                        {"★".repeat(Number(existingReview.seller_rating || 5))}
                                                        {"☆".repeat(Math.max(0, 5 - Number(existingReview.seller_rating || 5)))}
                                                    </strong>
                                                </div>
                                                {existingReview.comment && (
                                                    <p className={styles['reviewed-quote']}>
                                                        &ldquo;{existingReview.comment}&rdquo;
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <div className={styles['reviewed-actions']}>
                                            <button
                                                type="button"
                                                onClick={startEditingReview}
                                                className={styles['edit-review-btn']}
                                            >
                                                Edit My Review
                                            </button>
                                            <Link
                                                to="/profile?tab=reviews"
                                                className={styles['pending-reviews-link']}
                                            >
                                                Pending Reviews →
                                            </Link>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={handleReviewSubmit} className={styles['verified-review-form']}>
                                        <div className={styles['form-title-row']}>
                                            <h3>
                                                {alreadyReviewed
                                                    ? 'Update Your Verified Review'
                                                    : 'Rate Your Delivered Order'}
                                            </h3>
                                            {eligibleOrderId && (
                                                <span className={styles['order-tag']}>Order #{eligibleOrderId}</span>
                                            )}
                                        </div>

                                        {reviewFeedback && (
                                            <div className={styles['feedback-ok']}>{reviewFeedback}</div>
                                        )}
                                        {reviewError && (
                                            <div className={styles['feedback-err']}>{reviewError}</div>
                                        )}

                                        <div className={styles['rating-field']}>
                                            <label>Product Rating</label>
                                            <div className={styles['star-select']}>
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <button
                                                        key={s}
                                                        type="button"
                                                        onClick={() => setProductRating(s)}
                                                        className={s <= productRating ? styles['star-on'] : styles['star-off']}
                                                    >
                                                        ★
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className={styles['rating-field']}>
                                            <label>Seller Rating ({seller.name})</label>
                                            <div className={styles['star-select']}>
                                                {[1, 2, 3, 4, 5].map((s) => (
                                                    <button
                                                        key={s}
                                                        type="button"
                                                        onClick={() => setSellerRating(s)}
                                                        className={s <= sellerRating ? styles['star-on'] : styles['star-off']}
                                                    >
                                                        ★
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className={styles['rating-field']}>
                                            <label>Written Review</label>
                                            <textarea
                                                rows={3}
                                                value={reviewComment}
                                                onChange={(e) => setReviewComment(e.target.value)}
                                                placeholder="How was the quality and freshness?"
                                            />
                                        </div>

                                        <div className={styles['form-submit-row']}>
                                            <button
                                                type="submit"
                                                disabled={submittingReview}
                                                className={styles['submit-review-btn']}
                                            >
                                                {submittingReview
                                                    ? "Publishing..."
                                                    : alreadyReviewed
                                                    ? "Update Verified Review"
                                                    : "Submit Verified Review"}
                                            </button>
                                            {alreadyReviewed && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingExistingReview(false)}
                                                    className={styles['cancel-edit-btn']}
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                )
                            ) : (
                                <div className={styles['purchase-notice']}>
                                    <strong>Verified Deliveries Only</strong>
                                    <p>
                                        To keep reviews authentic, ratings can only be submitted after you order this product and your shipment is marked as delivered.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Review List */}
                        <div className={styles['reviews-list']}>
                            {reviewsList.length === 0 ? (
                                <p className={styles['empty-reviews']}>
                                    No customer reviews for this product yet.
                                </p>
                            ) : (
                                reviewsList.map((rev, idx) => (
                                    <article key={rev._id || idx} className={styles['review-row']}>
                                        <div className={styles['review-header']}>
                                            <div>
                                                <strong className={styles['reviewer-name']}>
                                                    {rev.user_name || "Verified Customer"}
                                                </strong>
                                                <span className={styles['verified-label']}>
                                                    Verified Delivery
                                                </span>
                                            </div>
                                            <time className={styles['review-date']}>
                                                {formatDate(rev.created_at)}
                                            </time>
                                        </div>

                                        <div className={styles['review-ratings-line']}>
                                            <span className={styles['review-stars']}>
                                                {"★".repeat(Number(rev.product_rating || 5))}
                                                {"☆".repeat(Math.max(0, 5 - Number(rev.product_rating || 5)))}
                                            </span>
                                            <span className={styles['seller-score']}>
                                                Seller rating: {rev.seller_rating || 5}/5
                                            </span>
                                        </div>

                                        {rev.comment && (
                                            <p className={styles['review-body']}>{rev.comment}</p>
                                        )}
                                    </article>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                {/* Related Products */}
                {related.length > 0 && (
                    <section className={styles['related-section']}>
                        <div className={styles['related-header']}>
                            <h2 className={styles['section-heading']}>More in {product.category}</h2>
                            <Link
                                to={`/products?category=${encodeURIComponent(product.category)}`}
                                className={styles['related-link']}
                            >
                                View all →
                            </Link>
                        </div>
                        <div className={styles['related-grid']}>
                            {related.map((relProduct) => (
                                <ProductCard
                                    key={relProduct.product_id}
                                    product={relProduct}
                                    addProductToCart={addProductToCart}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default ProductDetails;
