import styles from './shipment.module.css';
import {useState} from "react";
import {useDispatch} from "react-redux";
import {Link, useNavigate} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import Error from "../../components/feedback/error/Error";
import {fetchShipment} from "../../actions/shipping";
import * as api from "../../api";
import {formatKES} from "../../utils/pricing";
import {
    ADMIN_SELECTABLE_STATUSES,
    buildMilestoneCards,
    getStatusMeta,
    isDeliveredStatus,
    isTerminalGreyStatus,
    normalizeStatusKey,
} from "../../utils/orderStatuses";

const getStatusBadgeInfo = (shipmentStatus, orderStatus) => {
    const meta = getStatusMeta(shipmentStatus || orderStatus);
    const tone =
        meta.tone === 'green'
            ? 'delivered'
            : meta.tone === 'grey'
            ? 'cancelled'
            : meta.tone === 'amber'
            ? 'shipped'
            : 'created';
    return {
        label: meta.label,
        tone,
        icon: meta.icon || 'schedule',
    };
};

const formatOrderDate = (dateVal) => {
    if (!dateVal) return 'Just now';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const Shipment = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [trackingCode, setTrackingCode] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    const {data: myShipments = [], isPending} = useQuery({
        queryKey: ['myShipments'],
        queryFn: async () => {
            const res = await api.fetchMyShipments();
            return Array.isArray(res.data) ? res.data : [];
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    const {data: pendingReviewsData} = useQuery({
        queryKey: ['pendingReviews'],
        queryFn: async () => {
            const res = await api.fetchPendingReviews();
            return res.data;
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });
    const pendingReviewItems = pendingReviewsData?.pending || [];

    const handleFetch = (e) => {
        if (e) e.preventDefault();
        const cleaned = trackingCode.trim().replace(/^#/, '').toUpperCase();
        if (cleaned.length !== 6) {
            return setError('Please enter a valid 6-character Order / Shipment ID (e.g. BGOX5U).');
        }

        const onSuccess = (shipment) => {
            navigate(`/shipping/${shipment.order_id}`);
        };

        const onError = (err) => {
            setError(err?.message || 'Could not find a shipment with that ID.');
        };

        dispatch(fetchShipment(cleaned, onSuccess, onError));
    };

    const filteredShipments = myShipments.filter((item) => {
        const sStatus = normalizeStatusKey(item.shipment_status || item.status || item.order_status);
        if (statusFilter === 'ALL') return true;
        return sStatus === statusFilter;
    });

    const statusCounts = myShipments.reduce((acc, item) => {
        const s = normalizeStatusKey(item.shipment_status || item.status || item.order_status);
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    const totalOrders = myShipments.length;
    const activeOrdersCount = myShipments.filter((item) => {
        const s = normalizeStatusKey(item.shipment_status || item.status || item.order_status);
        return !isDeliveredStatus(s) && !isTerminalGreyStatus(s);
    }).length;
    const deliveredOrdersCount = myShipments.filter((item) => {
        const s = normalizeStatusKey(item.shipment_status || item.status || item.order_status);
        return isDeliveredStatus(s);
    }).length;

    return (
        <div className={styles['wrapper']}>
            {error && <Error error={error} setError={setError}/>}

            {/* Hero Header + Quick Tracking Lookup Bar */}
            <section className={styles['hero-banner']}>
                <div className={styles['hero-text']}>
                    <span className={styles['eyebrow']}>LIVE DELIVERY & SHIPMENT HUB</span>
                    <h1>Track Your Orders & Shipments</h1>
                    <p>
                        View real-time dispatch progress for all your recent orders below, or look up any shipment by its 6-character Order ID.
                    </p>
                </div>

                <form className={styles['lookup-form']} onSubmit={handleFetch}>
                    <div className={styles['lookup-input-wrap']}>
                        <span className="material-symbols-outlined">local_shipping</span>
                        <input
                            type="text"
                            value={trackingCode}
                            onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                            placeholder="Enter 6-character Order ID (e.g. BGOX5U)"
                            maxLength={7}
                        />
                    </div>
                    <button type="submit" className={styles['lookup-btn']}>
                        <span>Track Shipment</span>
                        <span className="material-symbols-outlined">arrow_forward</span>
                    </button>
                </form>
            </section>

            {/* Quick Stats Strip */}
            <div className={styles['stats-row']}>
                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles['icon-emerald']}`}>
                        <span className="material-symbols-outlined">receipt_long</span>
                    </div>
                    <div>
                        <small>Total Orders</small>
                        <strong>{totalOrders}</strong>
                    </div>
                </div>

                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles['icon-amber']}`}>
                        <span className="material-symbols-outlined">delivery_dining</span>
                    </div>
                    <div>
                        <small>Active / In Transit</small>
                        <strong>{activeOrdersCount}</strong>
                    </div>
                </div>

                <div className={styles['stat-card']}>
                    <div className={`${styles['stat-icon']} ${styles['icon-blue']}`}>
                        <span className="material-symbols-outlined">task_alt</span>
                    </div>
                    <div>
                        <small>Completed Deliveries</small>
                        <strong>{deliveredOrdersCount}</strong>
                    </div>
                </div>
            </div>

            {/* Your Orders & Shipments Section */}
            <section className={styles['orders-section']}>
                <div className={styles['section-head']}>
                    <div>
                        <h2>Your Orders & Shipments ({filteredShipments.length})</h2>
                        <p>Click any order to view live rider progress, delivery map, and itemized receipt.</p>
                    </div>

                    <div className={styles['filter-tabs']}>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('ALL')}
                            className={`${styles['filter-tab']} ${
                                statusFilter === 'ALL' ? styles['filter-tab-active'] : ''
                            }`}
                        >
                            All ({totalOrders})
                        </button>
                        {ADMIN_SELECTABLE_STATUSES.map((stKey) => {
                            const meta = getStatusMeta(stKey);
                            const count = statusCounts[stKey] || 0;
                            return (
                                <button
                                    key={stKey}
                                    type="button"
                                    onClick={() => setStatusFilter(stKey)}
                                    className={`${styles['filter-tab']} ${
                                        statusFilter === stKey ? styles['filter-tab-active'] : ''
                                    }`}
                                >
                                    {meta.shortLabel}
                                    {count > 0 ? ` (${count})` : ''}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {isPending ? (
                    <div className={styles['empty-box']}>
                        <span className="material-symbols-outlined">hourglass_top</span>
                        <h3>Loading your orders & shipments...</h3>
                    </div>
                ) : filteredShipments.length === 0 ? (
                    <div className={styles['empty-box']}>
                        <div className={styles['empty-icon']}>
                            <span className="material-symbols-outlined">inventory_2</span>
                        </div>
                        <h3>No matching orders or shipments found</h3>
                        <p>
                            {totalOrders === 0
                                ? "You haven't placed any grocery orders yet. Start shopping and track your 20-minute express delivery right here!"
                                : 'No orders match the selected status filter.'}
                        </p>
                        {totalOrders === 0 ? (
                            <Link to="/products" className="btn1">
                                <span>Explore Fresh Aisles</span>
                                <span className="material-symbols-outlined">storefront</span>
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setStatusFilter('ALL')}
                                className={styles['reset-filter-btn']}
                            >
                                Show All Orders
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles['orders-list']}>
                        {filteredShipments.map((item) => {
                            const sStatus = item.shipment_status || item.status || item.order_status || 'ORDER_PLACED';
                            const oStatus = item.order_status || sStatus;
                            const badge = getStatusBadgeInfo(sStatus, oStatus);
                            const isDelivered = isDeliveredStatus(sStatus) || isDeliveredStatus(oStatus);
                            const isPickup = item.address?.delivery_method === 'PICKUP_STATION';
                            const products = Array.isArray(item.products) ? item.products : [];
                            const totalItemsCount = products.reduce(
                                (sum, p) => sum + (Number(p.quantity) || 1),
                                0
                            );
                            const firstProductId = products[0]?.product_id;

                            const destinationText = isPickup
                                ? `${item.address?.pickup_station?.name || item.address?.street || 'FreshMart Pickup Station'} (${item.address?.area || ''}, ${item.address?.city || 'Nairobi'})`
                                : [item.address?.street, item.address?.area, item.address?.city]
                                      .filter(Boolean)
                                      .join(', ') || 'Doorstep Delivery';

                            const milestones = buildMilestoneCards(item, isPickup);

                            return (
                                <article key={item.order_id} className={styles['order-card']}>
                                    {/* Top Bar */}
                                    <div className={styles['card-top']}>
                                        <div className={styles['order-meta']}>
                                            <Link
                                                to={`/shipping/${item.order_id}`}
                                                className={styles['order-id-pill']}
                                            >
                                                #{item.order_id}
                                            </Link>
                                            <span className={styles['order-date']}>
                                                <span className="material-symbols-outlined">calendar_today</span>
                                                {formatOrderDate(item.ordered_at)}
                                            </span>
                                            <span className={styles['delivery-mode-chip']}>
                                                <span className="material-symbols-outlined">
                                                    {isPickup ? 'storefront' : 'delivery_dining'}
                                                </span>
                                                {isPickup ? 'Pickup Station' : 'Doorstep Delivery'}
                                            </span>
                                        </div>

                                        <div className={styles['top-right']}>
                                            <span
                                                className={`${styles['status-pill']} ${
                                                    styles[`tone-${badge.tone}`]
                                                }`}
                                            >
                                                <span className="material-symbols-outlined">
                                                    {badge.icon}
                                                </span>
                                                {badge.label}
                                            </span>
                                            <div className={styles['order-total']}>
                                                <small>Total</small>
                                                <strong>{formatKES(item.total)} KES</strong>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Granular Visual Status Stepper Track */}
                                    <div className={styles['stepper-track']}>
                                        {milestones.map((step, idx) => {
                                            const isDone =
                                                step.state === 'completed' ||
                                                step.state === 'delivered';
                                            const isActive = step.state === 'active';
                                            const isDeliveredStep = step.state === 'delivered';
                                            const isTerminal = step.state === 'terminal';
                                            return (
                                                <div
                                                    key={`${step.id}-${idx}`}
                                                    className={`${styles['step-node']} ${
                                                        isDone ? styles['step-completed'] : ''
                                                    } ${isActive ? styles['step-current'] : ''} ${
                                                        isDeliveredStep ? styles['step-delivered'] : ''
                                                    } ${isTerminal ? styles['step-terminal'] : ''}`}
                                                >
                                                    <div className={styles['step-dot']}>
                                                        {isTerminal
                                                            ? '!'
                                                            : isDone || isActive
                                                            ? '✓'
                                                            : idx + 1}
                                                    </div>
                                                    <span>{step.shortLabel}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Middle: Products Preview & Destination */}
                                    <div className={styles['card-body']}>
                                        <div className={styles['products-preview']}>
                                            <div className={styles['thumbs-row']}>
                                                {products.slice(0, 5).map((prod, i) => (
                                                    <Link
                                                        key={prod.product_id || i}
                                                        to={`/products/${prod.product_id}`}
                                                        className={styles['thumb-item']}
                                                        title={`${prod.quantity}× ${prod.name}`}
                                                    >
                                                        {prod.image ? (
                                                            <img src={prod.image} alt={prod.name}/>
                                                        ) : (
                                                            <span className="material-symbols-outlined">
                                                                nutrition
                                                            </span>
                                                        )}
                                                        <span className={styles['thumb-qty']}>
                                                            {prod.quantity}×
                                                        </span>
                                                    </Link>
                                                ))}
                                                {products.length > 5 && (
                                                    <div className={styles['thumb-more']}>
                                                        +{products.length - 5}
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles['product-names']}>
                                                <strong>
                                                    {totalItemsCount}{' '}
                                                    {totalItemsCount === 1 ? 'Item' : 'Items'}:
                                                </strong>{' '}
                                                {products
                                                    .map((p) => `${p.quantity}× ${p.name}`)
                                                    .join(', ') || 'Grocery Order'}
                                            </div>
                                        </div>

                                        <div className={styles['destination-box']}>
                                            <span className="material-symbols-outlined">location_on</span>
                                            <div>
                                                <small>
                                                    {isPickup ? 'Pickup Hub' : 'Delivery Address'}
                                                </small>
                                                <p>{destinationText}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom Actions */}
                                    <div className={styles['card-footer']}>
                                        <div className={styles['footer-left']}>
                                            {isDelivered && firstProductId && (() => {
                                                const orderPending = pendingReviewItems.filter(
                                                    (p) => p.order_id === item.order_id
                                                );
                                                if (pendingReviewsData && orderPending.length === 0) {
                                                    return (
                                                        <Link
                                                            to="/profile?tab=reviews"
                                                            className={styles['reviewed-btn']}
                                                        >
                                                            <span className="material-symbols-outlined">
                                                                verified
                                                            </span>
                                                            <span>Order Reviewed</span>
                                                        </Link>
                                                    );
                                                }
                                                const targetProdId =
                                                    orderPending[0]?.product_id || firstProductId;
                                                return (
                                                    <Link
                                                        to={`/products/${targetProdId}?review=true&order=${item.order_id}`}
                                                        className={styles['rate-btn']}
                                                    >
                                                        <span className="material-symbols-outlined">
                                                            star
                                                        </span>
                                                        <span>
                                                            Rate Products & Seller
                                                            {orderPending.length > 0
                                                                ? ` (${orderPending.length})`
                                                                : ''}
                                                        </span>
                                                    </Link>
                                                );
                                            })()}
                                        </div>

                                        <div className={styles['footer-actions']}>
                                            <Link
                                                to={`/orders/${item.order_id}`}
                                                className={styles['secondary-btn']}
                                            >
                                                <span className="material-symbols-outlined">
                                                    receipt
                                                </span>
                                                <span>Order Receipt</span>
                                            </Link>
                                            <Link
                                                to={`/shipping/${item.order_id}`}
                                                className={styles['primary-btn']}
                                            >
                                                <span className="material-symbols-outlined">
                                                    near_me
                                                </span>
                                                <span>Track Shipment</span>
                                            </Link>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};

export default Shipment;
