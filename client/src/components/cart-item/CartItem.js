import styles from './cartItem.module.css';
import {Link} from "react-router-dom";
import {
    formatKES,
    getDiscountPercent,
    getEffectivePrice,
    getOriginalPrice,
    getUnitSavings,
} from "../../utils/pricing";

const CartItem = ({
    product,
    updateQuantity,
    liveStockInfo = null,
    onSetQuantity = null,
    edit = true,
    id = false,
}) => {
    const qty = parseInt(product.quantity || 1, 10);
    const discountPct = getDiscountPercent(product);
    const originalUnitPrice = getOriginalPrice(product);
    const effectiveUnitPrice = getEffectivePrice(product);
    const unitSavings = getUnitSavings(product);

    const lineEffectiveTotal = (effectiveUnitPrice * qty).toFixed(2);
    const lineOriginalTotal = (originalUnitPrice * qty).toFixed(2);
    const lineSavings = (unitSavings * qty).toFixed(2);
    const totalWeight = (parseFloat(product.weight || 0) * qty).toFixed(2);

    const liveTotalStock =
        liveStockInfo !== null && liveStockInfo !== undefined
            ? Number(liveStockInfo.stock ?? 0)
            : product.stock !== undefined
            ? Number(product.stock)
            : null;
    const liveAvailableStock =
        liveStockInfo !== null && liveStockInfo !== undefined
            ? Number(liveStockInfo.available_stock ?? liveStockInfo.stock ?? 0)
            : liveTotalStock;
    const reservedByOthers = Number(liveStockInfo?.reserved_stock || 0);

    const isSoldOut = liveTotalStock !== null && liveTotalStock <= 0;
    const isReservedOut = !isSoldOut && liveAvailableStock !== null && liveAvailableStock <= 0 && reservedByOthers > 0;
    const isOverStock =
        !isSoldOut &&
        !isReservedOut &&
        liveAvailableStock !== null &&
        qty > liveAvailableStock;
    const isLowStock =
        !isSoldOut &&
        !isReservedOut &&
        !isOverStock &&
        liveAvailableStock !== null &&
        liveAvailableStock > 0 &&
        liveAvailableStock <= 5;

    const disableAdd = liveAvailableStock !== null && qty >= liveAvailableStock;

    return (
        <div
            className={`${styles['wrapper']} ${
                isSoldOut || isReservedOut
                    ? styles['wrapper-out']
                    : isOverStock
                    ? styles['wrapper-warn']
                    : ''
            }`}
        >
            <Link to={`/products/${product.product_id}`} className={styles['img-wrapper']}>
                <img src={product.image} alt={product.name}/>
            </Link>

            <div className={styles['info']}>
                <div className={styles['meta-row']}>
                    {product.category && (
                        <span className={styles['category-badge']}>{product.category}</span>
                    )}
                    {discountPct > 0 && (
                        <span className={styles['weight']} style={{background: '#fee2e2', color: '#dc2626'}}>
                            -{discountPct}% OFF
                        </span>
                    )}
                </div>

                <Link to={`/products/${product.product_id}`} className={styles['title']}>
                    {product.name}
                </Link>

                <div className={styles['meta-row']}>
                    <span className={styles['weight']}>
                        {totalWeight} {product.measurement}
                    </span>
                    {id && <span className={styles['id-chip']}>#{product.product_id}</span>}
                    {isLowStock && (
                        <span className={styles['low-stock-chip']}>
                            ⚡ Only {liveAvailableStock} left in stock
                        </span>
                    )}
                </div>

                {(isSoldOut || isReservedOut || isOverStock) && (
                    <div
                        className={`${styles['stock-alert']} ${
                            isOverStock ? styles['stock-alert-warn'] : styles['stock-alert-danger']
                        }`}
                    >
                        <span>
                            {isSoldOut
                                ? 'Sold out — another shopper purchased the last unit.'
                                : isReservedOut
                                ? "Currently reserved in another shopper's active checkout."
                                : `Only ${liveAvailableStock} left in stock (you have ${qty} in cart).`}
                        </span>
                        {edit && onSetQuantity && (
                            <button
                                type="button"
                                onClick={() =>
                                    onSetQuantity(
                                        product.product_id,
                                        isOverStock ? liveAvailableStock : 0
                                    )
                                }
                                className={styles['stock-fix-btn']}
                            >
                                {isOverStock ? `Adjust to ${liveAvailableStock}` : 'Remove Item'}
                            </button>
                        )}
                    </div>
                )}

                <div className={styles['quantity-wrapper']}>
                    {edit ? (
                        <div className={styles['stepper']}>
                            <button
                                type="button"
                                onClick={() => updateQuantity(product, 'REMOVE')}
                                className={`${styles['btn']} ${styles['remove']}`}
                                aria-label="Decrease quantity"
                            >
                                −
                            </button>
                            <span className={styles['qty-num']}>{qty}</span>
                            <button
                                type="button"
                                onClick={() =>
                                    updateQuantity(
                                        liveAvailableStock !== null
                                            ? {...product, stock: liveAvailableStock}
                                            : product,
                                        'ADD'
                                    )
                                }
                                disabled={disableAdd}
                                className={`${styles['btn']} ${styles['add']}`}
                                aria-label="Increase quantity"
                            >
                                +
                            </button>
                        </div>
                    ) : (
                        <div className={styles['quantity']}>
                            {product.quantity ? `Quantity: ${product.quantity}` : `Stock: ${product.stock}`}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles['price']}>
                <div className={styles['total-price']}>{formatKES(lineEffectiveTotal)} KES</div>
                {discountPct > 0 ? (
                    <>
                        <div className={styles['unit-price']} style={{textDecoration: 'line-through'}}>
                            {formatKES(lineOriginalTotal)} KES
                        </div>
                        <div className={styles['unit-price']} style={{color: '#059669', fontWeight: 700}}>
                            You save {formatKES(lineSavings)} KES
                        </div>
                    </>
                ) : (
                    <div className={styles['unit-price']}>
                        {formatKES(effectiveUnitPrice)} KES / {product.weight}{product.measurement}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CartItem;
