import styles from './productCard.module.css';
import {useContext, useRef, useState} from "react";
import {motion} from 'framer-motion';
import {useDispatch, useSelector} from "react-redux";
import {updateWishlist} from "../../actions/auth";
import {Link, useNavigate} from "react-router-dom";
import {CartContext} from "../../App";
import {trackProductClick, trackWishlistAdd} from "../../utils/tracker";
import {
    formatKES,
    getDiscountPercent,
    getEffectivePrice,
    getOriginalPrice,
} from "../../utils/pricing";
import {
    formatRemainingTime,
    getFlashSaleEndMs,
    useLiveClock,
} from "../../utils/flashCountdown";

const ProductCard = ({
    product,
    addProductToCart,
    productsPage = false,
    showReason = false,
    showFlashTimer = false,
}) => {
    const [flyAnim, setFlyAnim] = useState(false);
    const wrapperRef = useRef();
    const user = useSelector(state => state.authentication.user);
    const wishlist = user?.wishlist || [];
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const {
        cart = [],
        addProductToCart: contextAddToCart,
        removeProductFromCart: contextRemoveFromCart,
    } = useContext(CartContext);

    const addFn = contextAddToCart || addProductToCart;

    const cartEntry = cart.find((item) => item.product_id === product.product_id);
    const quantityInCart = Number(cartEntry?.quantity || 0);

    const isWishlisted = wishlist.includes(product.product_id);
    const isLowStock = product.stock > 0 && product.stock <= 10;
    const discountPct = getDiscountPercent(product);
    const originalPrice = getOriginalPrice(product);
    const effectivePrice = getEffectivePrice(product);
    const hasActiveFlashTimer = Boolean(showFlashTimer && (product.flash_sale || discountPct > 0));
    const nowMs = useLiveClock(hasActiveFlashTimer);
    const flashRemaining = hasActiveFlashTimer
        ? formatRemainingTime(getFlashSaleEndMs(product, nowMs), nowMs)
        : null;

    const handleWishlist = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user && !localStorage.getItem('profile')) {
            return navigate('/login', {
                state: {message: "Please sign in to save items to your wishlist."}
            });
        }
        const onError = () => {
            navigate('/login');
        };
        if (!isWishlisted) {
            trackWishlistAdd(product);
        }
        dispatch(updateWishlist(product.product_id, onError));
    };

    const handleInitialAdd = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user && !localStorage.getItem('profile')) {
            return navigate('/login', {
                state: {message: "Please sign in to add items to your cart."}
            });
        }
        if (!product.stock) return;

        addFn(product, 1);
        setFlyAnim(true);
        setTimeout(() => {
            setFlyAnim(false);
        }, 420);
    };

    const handleIncrement = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user && !localStorage.getItem('profile')) {
            return navigate('/login', {
                state: {message: "Please sign in to update your cart."}
            });
        }
        if (product.stock && quantityInCart >= product.stock) return;
        addFn(product, 1);
    };

    const handleDecrement = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (contextRemoveFromCart) {
            contextRemoveFromCart(product);
        }
    };

    const getXi = () => {
        if (!wrapperRef.current) return 0;
        const elementData = wrapperRef.current.getBoundingClientRect();
        return elementData.x;
    };

    const getXf = () => {
        const windowWidth = window.innerWidth;
        if (windowWidth > 1024)
            return windowWidth - 11 * 16;
        return windowWidth - 5 * 16;
    };

    const getYi = () => {
        if (!wrapperRef.current) return 0;
        const elementData = wrapperRef.current.getBoundingClientRect();
        return elementData.y;
    };

    const detailsUrl = `/products/${product.product_id}`;

    return (
        <div
            ref={wrapperRef}
            className={`${styles['wrapper']} ${productsPage ? styles['products-page'] : ''} ${!product.stock ? styles['out-of-stock'] : ''}`}
        >
            {flyAnim && (
                <motion.img
                    initial={{
                        x: getXi(),
                        y: getYi(),
                        padding: '1em',
                        borderRadius: '14px'
                    }}
                    animate={{
                        x: getXf(),
                        y: 0,
                        width: 28,
                        height: 28,
                        opacity: 0.85,
                        borderRadius: '50%',
                        padding: '.4em'
                    }}
                    transition={{type: "spring", stiffness: 45, bounce: 0}}
                    className={styles['cart-img']}
                    src={product.image}
                    alt={product.name}
                />
            )}

            <div className={styles['image-wrapper']}>
                <div className={styles['top-badges']}>
                    <div className={styles['badge-group']}>
                        {!product.stock ? (
                            <span className={`${styles['badge']} ${styles['badge-soldout']}`}>Sold Out</span>
                        ) : product.flash_sale ? (
                            <span className={`${styles['badge']} ${styles['badge-flash']}`}>
                                ⚡ Flash {discountPct > 0 ? `-${discountPct}%` : 'Deal'}
                            </span>
                        ) : discountPct > 0 ? (
                            <span className={`${styles['badge']} ${styles['badge-discount']}`}>
                                -{discountPct}% OFF
                            </span>
                        ) : isLowStock ? (
                            <span className={`${styles['badge']} ${styles['badge-low']}`}>Only {product.stock} left</span>
                        ) : (
                            <span className={`${styles['badge']} ${styles['badge-fresh']}`}>🌿 Farm Fresh</span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleWishlist}
                        aria-label="Toggle wishlist"
                        className={`${styles['wishlist']} ${isWishlisted ? styles['wishlisted'] : ''}`}
                    >
                        <span className="material-symbols-outlined">favorite</span>
                    </button>
                </div>

                <Link
                    to={detailsUrl}
                    onClick={() => trackProductClick(product)}
                    className={styles['image-stage']}
                >
                    <img src={product.image} alt={product.name} loading="lazy"/>
                </Link>
            </div>

            <div className={styles['content']}>
                <div className={styles['meta-top']}>
                    {product.category && (
                        <span className={styles['category-tag']}>{product.category}</span>
                    )}
                    <span className={styles['weight-pill']}>
                        {product.weight} {product.measurement}
                    </span>
                </div>

                <Link
                    to={detailsUrl}
                    onClick={() => trackProductClick(product)}
                    className={styles['name-link']}
                >
                    <h3 className={styles['name']} title={product.name}>
                        {product.name}
                    </h3>
                </Link>

                <div className={styles['seller-rating-row']}>
                    <span className={styles['rating-chip']}>★ {product.rating || 4.8}</span>
                    <span className={styles['seller-text']}>
                        {product.seller?.name || product.brand || "KijaniMart Farm"}
                    </span>
                </div>

                {showReason && product.recommendation_reason && (
                    <div className={styles['reason-pill']} title={product.recommendation_reason}>
                        ✨ {product.recommendation_reason}
                    </div>
                )}

                {flashRemaining && (
                    <div
                        className={styles['flash-timer-bar']}
                        title={
                            product.flash_sale_ends_at
                                ? `Ends ${new Date(product.flash_sale_ends_at).toLocaleString('en-KE')}`
                                : "Today's Flash Deal"
                        }
                    >
                        <span className={styles['flash-timer-label']}>
                            <span className="material-symbols-outlined">timer</span>
                            <span>{product.flash_sale ? 'Ends in' : 'Deal ends'}</span>
                        </span>
                        <span className={styles['flash-timer-clock']}>
                            {flashRemaining.days > 0 ? `${flashRemaining.days}d ` : ''}
                            {flashRemaining.hrs}:{flashRemaining.mins}:{flashRemaining.secs}
                        </span>
                    </div>
                )}

                <div className={styles['footer']}>
                    <div className={styles['price-block']}>
                        {discountPct > 0 ? (
                            <span className={styles['old-price']}>
                                KES {formatKES(originalPrice)}
                            </span>
                        ) : (
                            <span className={styles['price-label']}>Price</span>
                        )}
                        <div className={styles['price']}>
                            <span className={styles['currency']}>KES</span>
                            {formatKES(effectivePrice)}
                        </div>
                    </div>

                    {!product.stock ? (
                        <div className={styles['unavailable']}>Unavailable</div>
                    ) : quantityInCart > 0 ? (
                        <div className={styles['qty-stepper']} onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={handleDecrement}
                                className={styles['step-btn']}
                                aria-label="Decrease quantity"
                            >
                                <span className="material-symbols-outlined">remove</span>
                            </button>
                            <span className={styles['step-count']}>{quantityInCart}</span>
                            <button
                                type="button"
                                onClick={handleIncrement}
                                disabled={product.stock && quantityInCart >= product.stock}
                                className={styles['step-btn']}
                                aria-label="Increase quantity"
                            >
                                <span className="material-symbols-outlined">add</span>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleInitialAdd}
                            className={styles['add-to-cart']}
                        >
                            <span className="material-symbols-outlined">add_shopping_cart</span>
                            <span>Add</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
