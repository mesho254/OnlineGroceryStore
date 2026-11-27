import styles from './shipmentId.module.css';
import {useEffect} from "react";
import {Link, useNavigate, useParams} from "react-router-dom";
import {useDispatch} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../../api";
import {SHIPPING_FETCH} from "../../../constants/actions/shipping";
import Loading from "../../../components/loading/Loading";
import OrderStatusTimeline from "../../../components/order-timeline/OrderStatusTimeline";
import Delivery from '../../../shared/assets/tracking/delivery.png';
import {formatKES, getEffectivePrice} from "../../../utils/pricing";
import {
    buildMilestoneCards,
    getStatusMeta,
    isDeliveredStatus,
    isTerminalGreyStatus,
} from "../../../utils/orderStatuses";

const formatOrderDate = (dateVal) => {
    if (!dateVal) return 'Recent';
    const d = new Date(dateVal);
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

const ShipmentId = () => {
    const {id} = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const {data: shipment, isPending, isError} = useQuery({
        queryKey: ['shipment', id],
        queryFn: async () => {
            const res = await api.fetchShipment(id);
            dispatch({type: SHIPPING_FETCH, data: res.data});
            return res.data;
        },
        enabled: Boolean(id),
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
    const pendingItemsForThisOrder = (pendingReviewsData?.pending || []).filter(
        (p) => p.order_id === id
    );
    const pendingProductIdSet = new Set(pendingItemsForThisOrder.map((p) => p.product_id));

    useEffect(() => {
        if (isError) {
            navigate('/404');
        }
    }, [isError, navigate]);

    if (isPending || !shipment) return <Loading/>;

    const sStatus = shipment.status || shipment.order_status || 'ORDER_PLACED';
    const statusMeta = getStatusMeta(sStatus);
    const isPickup = shipment.address?.delivery_method === 'PICKUP_STATION';
    const isDelivered = isDeliveredStatus(sStatus);
    const isReturned = isTerminalGreyStatus(sStatus);

    const getProgress = () => statusMeta.progress || 15;

    const summary = {
        badge: statusMeta.label,
        tone:
            statusMeta.tone === 'green'
                ? 'delivered'
                : statusMeta.tone === 'grey'
                ? 'cancelled'
                : statusMeta.tone === 'amber'
                ? 'shipped'
                : 'created',
        headline: statusMeta.shortLabel,
        subtext: statusMeta.detailMessage,
    };
    const products = Array.isArray(shipment.products) ? shipment.products : [];
    const lat = shipment.address?.coordinates?.lat;
    const lng = shipment.address?.coordinates?.lng;
    const hasCoords = lat !== undefined && lng !== undefined && lat !== null && lng !== null;

    const mapQuery = hasCoords
        ? `${lat},${lng}`
        : [shipment.address?.street, shipment.address?.area, shipment.address?.city, 'Kenya']
              .filter(Boolean)
              .join(', ') || 'Nairobi, Kenya';

    const googleMapEmbedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
        mapQuery
    )}&z=15&output=embed`;

    const milestones = buildMilestoneCards(shipment, isPickup);

    return (
        <div className={styles['wrapper']}>
            {/* Top Navigation Bar */}
            <div className={styles['top-bar']}>
                <Link to="/shipping" className={styles['back-link']}>
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span>All Orders & Shipments</span>
                </Link>

                <div className={styles['top-actions']}>
                    <Link to={`/orders/${shipment.order_id}`} className={styles['receipt-link']}>
                        <span className="material-symbols-outlined">receipt</span>
                        <span>View Order Receipt #{shipment.order_id}</span>
                    </Link>
                </div>
            </div>

            {/* Main Live Tracking Hero Card */}
            <section className={styles['tracker-card']}>
                <div className={styles['tracker-head']}>
                    <div>
                        <span className={styles['eyebrow']}>LIVE SHIPMENT TRACKING</span>
                        <h1>
                            Order <span>#{shipment.order_id}</span>
                        </h1>
                        <p className={styles['placed-time']}>
                            Placed on {formatOrderDate(shipment.ordered_at)} •{' '}
                            {isPickup ? 'Pickup Station Delivery' : '20-Min Express Doorstep'}
                        </p>
                    </div>

                    <div className={styles['head-right']}>
                        <span className={`${styles['status-badge']} ${styles[`tone-${summary.tone}`]}`}>
                            {summary.badge}
                        </span>
                        <div className={styles['total-pill']}>
                            <small>Order Total</small>
                            <strong>{formatKES(shipment.total)} KES</strong>
                        </div>
                    </div>
                </div>

                {/* Animated Scooter Progress Bar */}
                <div className={styles['scooter-stage']}>
                    <div className={styles['full-progress']}>
                        <div
                            className={styles['progress']}
                            style={{width: `${getProgress()}%`}}
                        >
                            <img
                                className={styles['img']}
                                style={{
                                    transform: isReturned ? 'scaleX(-1)' : '',
                                }}
                                src={Delivery}
                                alt="Delivery Rider"
                            />
                        </div>
                    </div>
                </div>

                {/* Dynamic Granular Milestone Cards */}
                <div className={styles['milestones-grid']}>
                    {milestones.map((m, idx) => {
                        const isDone = m.state === 'completed';
                        const isActive = m.state === 'active';
                        const isDeliveredStep = m.state === 'delivered';
                        const isTerminal = m.state === 'terminal';
                        return (
                            <div
                                key={`${m.id}-${idx}`}
                                className={`${styles['milestone-card']} ${
                                    isDone ? styles['milestone-done'] : ''
                                } ${isActive ? styles['milestone-active'] : ''} ${
                                    isDeliveredStep ? styles['milestone-delivered'] : ''
                                } ${isTerminal ? styles['milestone-terminal'] : ''}`}
                            >
                                <div className={styles['milestone-icon']}>
                                    <span className="material-symbols-outlined">{m.icon}</span>
                                </div>
                                <div>
                                    <strong>{m.shortLabel}</strong>
                                    <small>{m.desc}</small>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Status Callout Banner */}
                <div
                    className={`${styles['status-banner']} ${
                        isReturned
                            ? styles['banner-terminal']
                            : !isDelivered && statusMeta.tone === 'amber'
                            ? styles['banner-amber']
                            : !isDelivered
                            ? styles['banner-blue']
                            : ''
                    }`}
                >
                    <span className="material-symbols-outlined">
                        {isDelivered ? 'task_alt' : isReturned ? 'info' : statusMeta.icon || 'bolt'}
                    </span>
                    <div>
                        <strong>{summary.headline}</strong>
                        <p>{summary.subtext}</p>
                    </div>
                </div>
            </section>

            {/* Vertical Chronological Status Timeline */}
            <OrderStatusTimeline order={shipment}/>

            {/* Bottom 2-Column Details Grid: Products List + Destination & Map */}
            <div className={styles['details-grid']}>
                {/* Left Column: Shipment Items */}
                <section className={styles['items-card']}>
                    <div className={styles['card-title-row']}>
                        <h2>Items in This Shipment ({products.length})</h2>
                        {isDelivered && products[0]?.product_id && (
                            pendingReviewsData && pendingItemsForThisOrder.length === 0 ? (
                                <Link
                                    to="/profile?tab=reviews"
                                    className={styles['reviewed-all-btn']}
                                >
                                    ✓ All Items Reviewed
                                </Link>
                            ) : (
                                <Link
                                    to={`/products/${
                                        pendingItemsForThisOrder[0]?.product_id || products[0].product_id
                                    }?review=true&order=${shipment.order_id}`}
                                    className={styles['rate-all-btn']}
                                >
                                    ★ Rate Delivered Products
                                </Link>
                            )
                        )}
                    </div>

                    {products.length === 0 ? (
                        <p className={styles['empty-note']}>
                            Item details are available on the Order Receipt page.
                        </p>
                    ) : (
                        <div className={styles['items-list']}>
                            {products.map((item, idx) => {
                                const qty = Number(item.quantity) || 1;
                                const unitPrice = getEffectivePrice(item);
                                return (
                                    <div
                                        key={item.product_id || idx}
                                        className={styles['item-row']}
                                    >
                                        <Link
                                            to={`/products/${item.product_id}`}
                                            className={styles['item-img']}
                                        >
                                            <img src={item.image} alt={item.name}/>
                                        </Link>

                                        <div className={styles['item-info']}>
                                            <Link
                                                to={`/products/${item.product_id}`}
                                                className={styles['item-name']}
                                            >
                                                {item.name}
                                            </Link>
                                            <div className={styles['item-meta']}>
                                                <span>Qty: {qty}</span>
                                                {item.weight && (
                                                    <span>
                                                        • {item.weight} {item.measurement}
                                                    </span>
                                                )}
                                                {item.seller?.name && (
                                                    <span>• {item.seller.name}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className={styles['item-right']}>
                                            {unitPrice > 0 && (
                                                <strong>
                                                    {formatKES(unitPrice * qty)} KES
                                                </strong>
                                            )}
                                            {isDelivered && (
                                                pendingReviewsData &&
                                                !pendingProductIdSet.has(item.product_id) ? (
                                                    <Link
                                                        to={`/products/${item.product_id}?review=true&order=${shipment.order_id}`}
                                                        className={styles['item-reviewed-link']}
                                                    >
                                                        ✓ Reviewed
                                                    </Link>
                                                ) : (
                                                    <Link
                                                        to={`/products/${item.product_id}?review=true&order=${shipment.order_id}`}
                                                        className={styles['item-rate-link']}
                                                    >
                                                        ★ Rate Item
                                                    </Link>
                                                )
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Right Column: Destination & Live Map */}
                <aside className={styles['destination-card']}>
                    <h2>
                        {isPickup ? '🏪 Pickup Station Details' : '📍 Delivery Destination'}
                    </h2>

                    <div className={styles['dest-info']}>
                        {isPickup && shipment.address?.pickup_station ? (
                            <>
                                <div className={styles['dest-row']}>
                                    <small>Station Name</small>
                                    <strong>{shipment.address.pickup_station.name}</strong>
                                </div>
                                {shipment.address.pickup_station.landmark && (
                                    <div className={styles['dest-row']}>
                                        <small>Landmark</small>
                                        <span>{shipment.address.pickup_station.landmark}</span>
                                    </div>
                                )}
                                {shipment.address.pickup_station.opening_hours && (
                                    <div className={styles['dest-row']}>
                                        <small>Opening Hours</small>
                                        <span>{shipment.address.pickup_station.opening_hours}</span>
                                    </div>
                                )}
                                {shipment.address.pickup_station.phone && (
                                    <div className={styles['dest-row']}>
                                        <small>Station Contact</small>
                                        <span>{shipment.address.pickup_station.phone}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className={styles['dest-row']}>
                                    <small>Address</small>
                                    <strong>
                                        {[
                                            shipment.address?.street,
                                            shipment.address?.area,
                                            shipment.address?.city,
                                        ]
                                            .filter(Boolean)
                                            .join(', ') || 'Nairobi, Kenya'}
                                    </strong>
                                </div>
                                {(shipment.address?.building_number ||
                                    shipment.address?.floor ||
                                    shipment.address?.apartment_number) && (
                                    <div className={styles['dest-row']}>
                                        <small>Building / Floor / Apt</small>
                                        <span>
                                            {[
                                                shipment.address?.building_number,
                                                shipment.address?.floor,
                                                shipment.address?.apartment_number,
                                            ]
                                                .filter(Boolean)
                                                .join(' • ')}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}

                        {(shipment.name?.first || shipment.phone_number) && (
                            <div className={styles['dest-row']}>
                                <small>Recipient</small>
                                <span>
                                    {[shipment.name?.first, shipment.name?.last]
                                        .filter(Boolean)
                                        .join(' ')}
                                    {shipment.phone_number ? ` (${shipment.phone_number})` : ''}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className={styles['map-box']}>
                        <div className={styles['map-head']}>
                            <span>Delivery Pin</span>
                            <a
                                href={
                                    shipment.address?.google_maps_url ||
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
                            title="Shipment Location Map"
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

export default ShipmentId;
