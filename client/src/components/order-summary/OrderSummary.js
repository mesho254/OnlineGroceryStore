import styles from './orderSummary.module.css';
import {useState} from "react";
import {Link} from "react-router-dom";
import * as api from "../../api";
import {queryClient} from "../../index";
import OrderStatusTimeline from "../order-timeline/OrderStatusTimeline";
import {
    ADMIN_SELECTABLE_STATUSES,
    getStatusMeta,
} from "../../utils/orderStatuses";
import {
    formatKES,
    getDiscountPercent,
    getEffectivePrice,
    getOriginalPrice,
} from "../../utils/pricing";

const ORDER_STATUSES = ADMIN_SELECTABLE_STATUSES;
const SHIPMENT_STATUSES = ADMIN_SELECTABLE_STATUSES;

const formatOrderDateTime = (val) => {
    if (!val) return 'Recent';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-KE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const OrderSummary = ({order, allowAdminActions = true}) => {
    const [orderStatus, setOrderStatus] = useState(order?.status || 'CREATED');
    const [shipmentStatus, setShipmentStatus] = useState(
        order?.shipment_status || order?.shipment?.status || 'CREATED'
    );
    const [savingOrder, setSavingOrder] = useState(false);
    const [savingShipment, setSavingShipment] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    if (!order) return null;

    const firstName = order.name?.first || '';
    const lastName = order.name?.last || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Valued Customer';
    const initials =
        `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase() || 'CU';

    const products = Array.isArray(order.products) ? order.products : [];
    const totalUnits = products.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0);

    // Calculate financial breakdown
    let originalSubtotal = 0;
    let effectiveSubtotal = 0;

    for (const item of products) {
        const qty = Number(item.quantity) || 1;
        const origPrice = getOriginalPrice(item);
        const effPrice = Number(item.ordered_price) || getEffectivePrice(item);
        originalSubtotal += origPrice * qty;
        effectiveSubtotal += effPrice * qty;
    }

    const paidTotal = Number(order.total) || effectiveSubtotal;
    const totalSavings = Math.max(0, Number((originalSubtotal - paidTotal).toFixed(2)));

    const isPickup = order.address?.delivery_method === 'PICKUP_STATION';
    const lat = order.address?.coordinates?.lat;
    const lng = order.address?.coordinates?.lng;
    const hasCoords = lat !== undefined && lng !== undefined && lat !== null && lng !== null;

    const mapQuery = hasCoords
        ? `${lat},${lng}`
        : [order.address?.street, order.address?.area, order.address?.city, 'Kenya']
              .filter(Boolean)
              .join(', ') || 'Nairobi, Kenya';

    const googleMapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
        mapQuery
    )}&z=15&output=embed`;

    const handleQuickOrderStatus = async (nextStatus) => {
        setOrderStatus(nextStatus);
        setShipmentStatus(nextStatus);
        setSavingOrder(true);
        setError('');
        try {
            await api.updateOrder(order.order_id, nextStatus);
            queryClient.invalidateQueries({queryKey: ['order', order.order_id]});
            queryClient.invalidateQueries({queryKey: ['shipment', order.order_id]});
            queryClient.invalidateQueries({queryKey: ['adminOrders']});
            queryClient.invalidateQueries({queryKey: ['adminShipments']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            setFeedback(
                `✓ Order & Shipment #${order.order_id} unified status synced to ${getStatusMeta(nextStatus).label}.`
            );
            setTimeout(() => setFeedback(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update order status.');
        } finally {
            setSavingOrder(false);
        }
    };

    const handleQuickShipmentStatus = async (nextStatus) => {
        setOrderStatus(nextStatus);
        setShipmentStatus(nextStatus);
        setSavingShipment(true);
        setError('');
        try {
            await api.updateShipment(order.order_id, nextStatus);
            queryClient.invalidateQueries({queryKey: ['order', order.order_id]});
            queryClient.invalidateQueries({queryKey: ['shipment', order.order_id]});
            queryClient.invalidateQueries({queryKey: ['adminOrders']});
            queryClient.invalidateQueries({queryKey: ['adminShipments']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            setFeedback(
                nextStatus === 'DELIVERED'
                    ? `✓ Shipment & Order #${order.order_id} marked DELIVERED (customer review notification & email sent).`
                    : `✓ Shipment & Order #${order.order_id} unified status synced to ${getStatusMeta(nextStatus).label}.`
            );
            setTimeout(() => setFeedback(''), 4500);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update shipment status.');
        } finally {
            setSavingShipment(false);
        }
    };

    return (
        <div className={styles['wrapper']}>
            {feedback && <div className={styles['toast-ok']}>{feedback}</div>}
            {error && <div className={styles['toast-err']}>{error}</div>}

            {/* Top Hero Dossier Banner */}
            <div className={styles['dossier-header']}>
                <div className={styles['customer-profile']}>
                    <div className={styles['avatar']}>{initials}</div>
                    <div className={styles['customer-info']}>
                        <div className={styles['meta-chips']}>
                            <span className={styles['order-id-chip']}>Order #{order.order_id}</span>
                            <span className={styles['mode-chip']}>
                                <span className="material-symbols-outlined">
                                    {isPickup ? 'storefront' : 'delivery_dining'}
                                </span>
                                {isPickup ? 'Pickup Station Order' : '20-Min Doorstep Delivery'}
                            </span>
                            <span className={styles['date-chip']}>
                                <span className="material-symbols-outlined">schedule</span>
                                {formatOrderDateTime(order.ordered_at)}
                            </span>
                        </div>

                        <h2 className={styles['customer-name']}>{fullName}</h2>

                        <div className={styles['contact-links']}>
                            {order.email && (
                                <a href={`mailto:${order.email}`} className={styles['contact-item']}>
                                    <span className="material-symbols-outlined">mail</span>
                                    <span>{order.email}</span>
                                </a>
                            )}
                            {order.phone_number && (
                                <a
                                    href={`tel:${order.phone_number}`}
                                    className={styles['contact-item']}
                                >
                                    <span className="material-symbols-outlined">call</span>
                                    <span>{order.phone_number}</span>
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Status & Total Summary */}
                <div className={styles['header-right']}>
                    {allowAdminActions ? (
                        <div className={styles['status-controls']}>
                            <div className={styles['control-box']}>
                                <label>Order Status</label>
                                <select
                                    value={orderStatus}
                                    disabled={savingOrder}
                                    onChange={(e) => handleQuickOrderStatus(e.target.value)}
                                >
                                    {ORDER_STATUSES.map((st) => (
                                        <option key={st} value={st}>
                                            {getStatusMeta(st).label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles['control-box']}>
                                <label>Shipment Dispatch</label>
                                <select
                                    value={shipmentStatus}
                                    disabled={savingShipment}
                                    onChange={(e) => handleQuickShipmentStatus(e.target.value)}
                                >
                                    {SHIPMENT_STATUSES.map((st) => (
                                        <option key={st} value={st}>
                                            {getStatusMeta(st).label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div className={styles['badges-row']}>
                            <span className={styles['status-pill']}>Order: {orderStatus}</span>
                            <span className={styles['status-pill']}>
                                Shipment: {shipmentStatus}
                            </span>
                        </div>
                    )}

                    <div className={styles['grand-total-pill']}>
                        <small>Grand Total Paid ({totalUnits} Units)</small>
                        <strong>{formatKES(paidTotal)} KES</strong>
                    </div>
                </div>
            </div>

            {/* Admin-Only Seller Order Status Proposals */}
            {allowAdminActions &&
                Array.isArray(order.seller_updates) &&
                order.seller_updates.length > 0 && (
                    <div
                        style={{
                            background: '#fffbeb',
                            border: '1.5px solid #fcd34d',
                            borderRadius: '18px',
                            padding: '1rem 1.25rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.65rem',
                        }}
                    >
                        <strong style={{color: '#92400e', fontSize: '0.88rem'}}>
                            🏪 Seller Fulfillment Status Updates (Admin Confirmation Required Before
                            Customer Sees Change)
                        </strong>
                        {order.seller_updates.map((upd, idx) => {
                            const pMeta = getStatusMeta(upd.proposed_status);
                            return (
                                <div
                                    key={`${upd.seller_id || idx}-${idx}`}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #fde68a',
                                        borderRadius: '12px',
                                        padding: '0.75rem 1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '0.75rem',
                                    }}
                                >
                                    <div>
                                        <strong style={{display: 'block', fontSize: '0.86rem', color: '#0f172a'}}>
                                            {upd.seller_name || 'Seller'} reported: {pMeta.label}
                                        </strong>
                                        {upd.note && (
                                            <div style={{fontSize: '0.78rem', color: '#475569', fontStyle: 'italic'}}>
                                                "{upd.note}"
                                            </div>
                                        )}
                                        <small
                                            style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: upd.admin_acknowledged ? '#059669' : '#b45309',
                                            }}
                                        >
                                            {upd.admin_acknowledged
                                                ? '✓ Applied / Acknowledged by Admin'
                                                : '⏳ Pending Admin Confirmation'}
                                        </small>
                                    </div>
                                    {!upd.admin_acknowledged && (
                                        <button
                                            type="button"
                                            disabled={savingOrder}
                                            onClick={() =>
                                                handleQuickOrderStatus(upd.proposed_status)
                                            }
                                            className="btn1"
                                            style={{padding: '0.45rem 0.9rem', fontSize: '0.78rem'}}
                                        >
                                            Apply {pMeta.shortLabel} to Customer ✓
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

            {/* Vertical Chronological Status History Timeline */}
            <OrderStatusTimeline order={{...order, status: orderStatus}}/>

            {/* Two-Column Body: Itemized Groceries + Logistics & Map */}
            <div className={styles['dossier-grid']}>
                {/* Left Column: Itemized Groceries & Financial Receipt */}
                <div className={styles['card']}>
                    <div className={styles['card-head']}>
                        <div>
                            <h3>
                                Ordered Products ({products.length}{' '}
                                {products.length === 1 ? 'Line Item' : 'Line Items'} • {totalUnits}{' '}
                                {totalUnits === 1 ? 'Unit' : 'Units'})
                            </h3>
                            <p>Complete itemized breakdown with unit pricing, discounts, and SKU metadata</p>
                        </div>
                    </div>

                    <div className={styles['items-list']}>
                        {products.map((product, i) => {
                            const qty = Number(product.quantity) || 1;
                            const discountPct = getDiscountPercent(product);
                            const origUnit = getOriginalPrice(product);
                            const effUnit =
                                Number(product.ordered_price) || getEffectivePrice(product);
                            const lineOrigTotal = origUnit * qty;
                            const lineEffTotal = effUnit * qty;
                            const lineSaved = Math.max(0, lineOrigTotal - lineEffTotal);

                            return (
                                <div
                                    key={product.product_id || i}
                                    className={styles['product-row']}
                                >
                                    <Link
                                        to={`/products/${product.product_id}`}
                                        className={styles['product-img']}
                                    >
                                        <img src={product.image} alt={product.name}/>
                                        <span className={styles['qty-badge']}>{qty}×</span>
                                    </Link>

                                    <div className={styles['product-details']}>
                                        <div className={styles['prod-tags']}>
                                            {product.category && (
                                                <span className={styles['cat-tag']}>
                                                    {product.category}
                                                </span>
                                            )}
                                            {product.product_id && (
                                                <span className={styles['sku-tag']}>
                                                    ID: #{product.product_id}
                                                </span>
                                            )}
                                            {product.sku && (
                                                <span className={styles['sku-tag']}>
                                                    SKU: {product.sku}
                                                </span>
                                            )}
                                            {discountPct > 0 && (
                                                <span className={styles['disc-tag']}>
                                                    -{discountPct}% OFF
                                                </span>
                                            )}
                                        </div>

                                        <Link
                                            to={`/products/${product.product_id}`}
                                            className={styles['product-name']}
                                        >
                                            {product.name}
                                        </Link>

                                        <div className={styles['prod-submeta']}>
                                            {product.weight && (
                                                <span>
                                                    Pack Size: {product.weight}{' '}
                                                    {product.measurement}
                                                </span>
                                            )}
                                            {(product.seller?.name || product.brand) && (
                                                <span>
                                                    • Seller: {product.seller?.name || product.brand}
                                                </span>
                                            )}
                                            {product.stock !== undefined && (
                                                <span>
                                                    • Warehouse Stock: {product.stock} left
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles['product-pricing']}>
                                        <strong className={styles['line-total']}>
                                            {formatKES(lineEffTotal)} KES
                                        </strong>
                                        <span className={styles['unit-calc']}>
                                            {qty} × {formatKES(effUnit)} KES
                                        </span>
                                        {lineSaved > 0 && (
                                            <div className={styles['savings-stack']}>
                                                <span className={styles['old-price']}>
                                                    {formatKES(lineOrigTotal)} KES
                                                </span>
                                                <span className={styles['saved-pill']}>
                                                    Saved {formatKES(lineSaved)} KES
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Financial Receipt Breakdown Footer */}
                    <div className={styles['financial-summary']}>
                        <div className={styles['fin-row']}>
                            <span>Original Items Subtotal ({totalUnits} units)</span>
                            <strong>{formatKES(originalSubtotal)} KES</strong>
                        </div>

                        {totalSavings > 0 && (
                            <div className={`${styles['fin-row']} ${styles['fin-discount']}`}>
                                <span>Promotional & Flash Discount Savings</span>
                                <strong>− {formatKES(totalSavings)} KES</strong>
                            </div>
                        )}

                        <div className={styles['fin-row']}>
                            <span>
                                {isPickup
                                    ? 'Pickup Hub Collection Fee'
                                    : '20-Minute Express Delivery Fee'}
                            </span>
                            <span className={styles['free-badge']}>FREE (0.00 KES)</span>
                        </div>

                        {order.stripe_session_id && (
                            <div className={styles['fin-row']}>
                                <span>Payment Gateway Verification</span>
                                <span className={styles['stripe-badge']}>
                                    ✓ Stripe Paid ({order.stripe_session_id.slice(0, 18)}...)
                                </span>
                            </div>
                        )}

                        <div className={styles['fin-total']}>
                            <span>Total Paid</span>
                            <strong>{formatKES(paidTotal)} KES</strong>
                        </div>
                    </div>
                </div>

                {/* Right Column: Delivery / Pickup Logistics & Map */}
                <aside className={styles['card']}>
                    <div className={styles['card-head']}>
                        <div>
                            <h3>
                                {isPickup
                                    ? '🏪 Pickup Station Logistics'
                                    : '📍 Doorstep Delivery Logistics'}
                            </h3>
                            <p>Destination address, coordinates, and live dispatch map</p>
                        </div>
                        <Link
                            to={`/shipping/${order.order_id}`}
                            className={styles['live-track-link']}
                        >
                            Live Tracker ↗
                        </Link>
                    </div>

                    <div className={styles['logistics-list']}>
                        <div className={styles['log-row']}>
                            <small>Fulfillment Mode</small>
                            <strong>
                                {isPickup
                                    ? 'Customer Pickup at KijaniMart Hub'
                                    : 'Express Rider Doorstep Delivery'}
                            </strong>
                        </div>

                        {isPickup && order.address?.pickup_station ? (
                            <>
                                <div className={styles['log-row']}>
                                    <small>Pickup Hub Name</small>
                                    <strong>{order.address.pickup_station.name}</strong>
                                </div>
                                {order.address.pickup_station.landmark && (
                                    <div className={styles['log-row']}>
                                        <small>Landmark / Location</small>
                                        <span>{order.address.pickup_station.landmark}</span>
                                    </div>
                                )}
                                {order.address.pickup_station.opening_hours && (
                                    <div className={styles['log-row']}>
                                        <small>Hub Operating Hours</small>
                                        <span>🕒 {order.address.pickup_station.opening_hours}</span>
                                    </div>
                                )}
                                {order.address.pickup_station.phone && (
                                    <div className={styles['log-row']}>
                                        <small>Hub Contact Phone</small>
                                        <span>📞 {order.address.pickup_station.phone}</span>
                                    </div>
                                )}
                            </>
                        ) : null}

                        <div className={styles['log-row']}>
                            <small>Street & Neighborhood</small>
                            <strong>
                                {[
                                    order.address?.street,
                                    order.address?.area,
                                    order.address?.city,
                                    order.address?.country || 'Kenya',
                                ]
                                    .filter(Boolean)
                                    .join(', ')}
                            </strong>
                        </div>

                        {!isPickup &&
                            (order.address?.building_number ||
                                order.address?.floor ||
                                order.address?.apartment_number) && (
                                <div className={styles['log-row']}>
                                    <small>Building / Floor / Apartment</small>
                                    <span>
                                        {[
                                            order.address?.building_number &&
                                                `Building: ${order.address.building_number}`,
                                            order.address?.floor && `Floor: ${order.address.floor}`,
                                            order.address?.apartment_number &&
                                                `Apt: ${order.address.apartment_number}`,
                                        ]
                                            .filter(Boolean)
                                            .join(' • ')}
                                    </span>
                                </div>
                            )}

                        {hasCoords && (
                            <div className={styles['log-row']}>
                                <small>Pinned GPS Coordinates</small>
                                <code>
                                    Lat: {Number(lat).toFixed(6)}, Lng: {Number(lng).toFixed(6)}
                                </code>
                            </div>
                        )}
                    </div>

                    <div className={styles['map-card']}>
                        <div className={styles['map-bar']}>
                            <span>📍 Destination Pin</span>
                            <a
                                href={
                                    order.address?.google_maps_url ||
                                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                        mapQuery
                                    )}`
                                }
                                target="_blank"
                                rel="noreferrer"
                            >
                                Open in Google Maps ↗
                            </a>
                        </div>
                        <iframe
                            title={`Order #${order.order_id} Map`}
                            src={googleMapEmbedUrl}
                            width="100%"
                            height="220"
                            style={{border: 0}}
                            loading="lazy"
                        />
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default OrderSummary;
