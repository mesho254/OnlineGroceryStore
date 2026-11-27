import styles from './cart.module.css';
import CartItem from "../../components/cart-item/CartItem";
import {Link, useNavigate, useSearchParams} from "react-router-dom";
import {useDispatch} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import {validateCart} from "../../actions/products";
import {useContext, useEffect, useRef, useState} from "react";
import Error from "../../components/feedback/error/Error";
import * as api from "../../api";
import {CartContext} from "../../App";
import {formatKES, getEffectivePrice, getOriginalPrice} from "../../utils/pricing";

const Cart = ({cart, cartCount, updateQuantity}) => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [searchParams, setSearchParams] = useSearchParams();
    const {setCartItemQuantity} = useContext(CartContext);
    const [error, setError] = useState('');
    const [validating, setValidating] = useState(false);
    const isValidatingRef = useRef(false);

    // If user clicked Back/Cancel on Stripe Checkout, release their temporary stock hold immediately
    useEffect(() => {
        const canceledOrderId = searchParams.get('canceled_order');
        if (canceledOrderId) {
            api.cancelPendingCheckout(canceledOrderId).catch(() => {});
            searchParams.delete('canceled_order');
            setSearchParams(searchParams, {replace: true});
        }
    }, [searchParams, setSearchParams]);

    const cartProductIds = Array.from(
        new Set((cart || []).map((item) => item.product_id).filter(Boolean))
    );
    const stockKey = cartProductIds.join(',');

    // Poll live MongoDB stock (minus active checkouts by other users) so sold-out items are flagged immediately
    const {data: liveStockMap = {}, refetch: refetchLiveStock} = useQuery({
        queryKey: ['cartLiveStock', stockKey],
        queryFn: async () => {
            const res = await api.checkProductsStock(cartProductIds);
            const list = res.data?.products || [];
            return list.reduce((acc, p) => {
                acc[p.product_id] = p;
                return acc;
            }, {});
        },
        enabled: cartProductIds.length > 0,
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: 10000,
    });

    const stockIssues = (cart || []).reduce((issues, item) => {
        const live = liveStockMap[item.product_id];
        if (!live) return issues;
        const qty = Number(item.quantity || 1);
        const totalStock = Number(live.stock || 0);
        const avail = Number(live.available_stock ?? totalStock);
        const reserved = Number(live.reserved_stock || 0);

        if (totalStock <= 0) {
            issues.push({
                product_id: item.product_id,
                name: live.name || item.name,
                reason: 'SOLD_OUT',
                message: `"${live.name || item.name}" sold out (0 left).`,
            });
        } else if (avail <= 0 && reserved > 0) {
            issues.push({
                product_id: item.product_id,
                name: live.name || item.name,
                reason: 'RESERVED',
                message: `"${live.name || item.name}" is currently reserved in another shopper's active checkout.`,
            });
        } else if (qty > avail) {
            issues.push({
                product_id: item.product_id,
                name: live.name || item.name,
                reason: 'INSUFFICIENT',
                available: avail,
                message: `Only ${avail} left of "${live.name || item.name}" (you have ${qty} in cart).`,
            });
        }
        return issues;
    }, []);

    const hasStockConflict = stockIssues.length > 0;

    const getOriginalTotal = () => {
        let total = 0;
        for (const item of cart) {
            total += getOriginalPrice(item) * Number(item.quantity || 1);
        }
        return Number(total.toFixed(2));
    };

    const getEffectiveTotal = () => {
        let total = 0;
        for (const item of cart) {
            total += getEffectivePrice(item) * Number(item.quantity || 1);
        }
        return Number(total.toFixed(2));
    };

    const handleCheckout = () => {
        if (isValidatingRef.current || validating) return;
        if (hasStockConflict) {
            setError(stockIssues[0].message);
            return;
        }
        isValidatingRef.current = true;
        setValidating(true);
        setError('');

        const onSuccess = (token) => {
            isValidatingRef.current = false;
            setValidating(false);
            navigate(`/checkout?token=${token}&total=${getEffectiveTotal()}`);
        };

        const onError = (e) => {
            isValidatingRef.current = false;
            setValidating(false);
            refetchLiveStock();
            setError(e?.message || "Failed to validate cart items.");
        };

        dispatch(validateCart(cart, onSuccess, onError));
    };

    if (cart && !cart.length) {
        return (
            <div className={styles['wrapper']}>
                <div className={styles['empty-card']}>
                    <div className={styles['empty-icon']}>
                        <span className="material-symbols-outlined">shopping_bag</span>
                    </div>
                    <h1 className={styles['empty-title']}>Your shopping cart is empty</h1>
                    <p className={styles['empty-sub']}>
                        Looks like you haven&apos;t added any farm-fresh groceries yet. Explore our aisles and fill your basket!
                    </p>
                    <Link to={'/products'} className={'btn1'}>
                        <span>Start Shopping</span>
                        <span className="material-symbols-outlined">storefront</span>
                    </Link>
                </div>
            </div>
        );
    }

    const originalSubtotal = getOriginalTotal();
    const discountedSubtotal = getEffectiveTotal();
    const totalDiscountSavings = Number(Math.max(0, originalSubtotal - discountedSubtotal).toFixed(2));

    return (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}

            <div className={styles['page-head']}>
                <div>
                    <span className={styles['eyebrow']}>YOUR GROCERY BASKET</span>
                    <h1 className={styles['page-title']}>Shopping Cart</h1>
                </div>
                <Link to={'/products'} className={styles['continue-link']}>
                    ← Continue Shopping
                </Link>
            </div>

            <div className={styles['cart-grid']}>
                <div className={styles['products-wrapper']}>
                    {cart.map((product, i) => (
                        <CartItem
                            product={product}
                            updateQuantity={updateQuantity}
                            liveStockInfo={liveStockMap[product.product_id] || null}
                            onSetQuantity={setCartItemQuantity}
                            key={product.product_id || i}
                        />
                    ))}
                </div>

                <aside className={styles['summary-card']}>
                    <h2 className={styles['summary-title']}>Order Summary</h2>

                    <div className={styles['summary-rows']}>
                        <div className={styles['summary-row']}>
                            <span>Original Price ({cartCount} Items)</span>
                            <strong>{formatKES(originalSubtotal)} KES</strong>
                        </div>
                        {totalDiscountSavings > 0 && (
                            <div className={styles['summary-row']} style={{color: '#059669'}}>
                                <span>Discount Savings</span>
                                <strong style={{color: '#059669'}}>
                                    − {formatKES(totalDiscountSavings)} KES
                                </strong>
                            </div>
                        )}
                        <div className={styles['summary-row']}>
                            <span>Express 20-Min Delivery</span>
                            <span className={styles['free-pill']}>FREE</span>
                        </div>
                    </div>

                    <div className={styles['summary-total']}>
                        <span>Payable Total</span>
                        <strong>{formatKES(discountedSubtotal)} KES</strong>
                    </div>

                    {totalDiscountSavings > 0 && (
                        <div
                            style={{
                                background: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                color: '#047857',
                                padding: '0.55rem 0.85rem',
                                borderRadius: '12px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                textAlign: 'center',
                            }}
                        >
                            🎉 You are saving {formatKES(totalDiscountSavings)} KES on this order!
                        </div>
                    )}

                    {hasStockConflict && (
                        <div className={styles['stock-block-banner']}>
                            <strong>⚠ Stock Updated — Action Needed</strong>
                            <ul>
                                {stockIssues.map((issue) => (
                                    <li key={issue.product_id}>{issue.message}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleCheckout}
                        disabled={validating || hasStockConflict}
                        className={`btn1 ${styles['checkout-btn']}`}
                    >
                        <span>
                            {validating
                                ? 'Checking Live Stock...'
                                : hasStockConflict
                                ? 'Resolve Stock Issues to Checkout'
                                : 'Proceed to Checkout'}
                        </span>
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>

                    <div className={styles['trust-list']}>
                        <div>
                            <span className="material-symbols-outlined">verified_user</span>
                            <span>Secure Stripe Checkout</span>
                        </div>
                        <div>
                            <span className="material-symbols-outlined">bolt</span>
                            <span>20-Minute Express Dispatch</span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default Cart;
