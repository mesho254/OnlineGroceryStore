import styles from './orderId.module.css';
import {useEffect, useState} from "react";
import {Link, useNavigate, useParams} from "react-router-dom";
import {useDispatch} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../../api";
import {ORDERS_FETCH} from "../../../constants/actions/orders";
import Loading from "../../../components/loading/Loading";
import OrderStatusTimeline from "../../../components/order-timeline/OrderStatusTimeline";
import OrderIcon from '../../../shared/assets/tracking/order.png';
import {formatKES, getEffectivePrice} from "../../../utils/pricing";
import {
    getStatusMeta,
    isDeliveredStatus,
    isTerminalGreyStatus,
} from "../../../utils/orderStatuses";

const formatOrderDate = (dateVal) => {
    if (!dateVal) return 'Just now';
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

const OrderId = () => {
    const {id} = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [downloadingPdf, setDownloadingPdf] = useState(false);

    const handleDownloadReceiptPdf = async () => {
        if (!id || downloadingPdf) return;
        setDownloadingPdf(true);
        try {
            const res = await api.downloadOrderReceiptPdf(id);
            const blob = new Blob([res.data], {type: 'application/pdf'});
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `KijaniMart-Receipt-${id}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('Receipt PDF download failed:', err);
        } finally {
            setDownloadingPdf(false);
        }
    };

    const {data: order, isPending, isError} = useQuery({
        queryKey: ['order', id],
        queryFn: async () => {
            const res = await api.fetchOrder(id);
            dispatch({type: ORDERS_FETCH, data: res.data});
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

    if (isPending || !order) return <Loading/>;

    const oStatus = order.status || order.shipment_status || 'ORDER_PLACED';
    const sStatus = order.shipment_status || order.status || 'ORDER_PLACED';
    const statusMeta = getStatusMeta(oStatus);
    const isCancelled = isTerminalGreyStatus(oStatus) || isTerminalGreyStatus(sStatus);
    const isDelivered = isDeliveredStatus(oStatus) || isDeliveredStatus(sStatus);
    const isPickup = order.address?.delivery_method === 'PICKUP_STATION';

    const getProgress = () => statusMeta.progress || 18;

    const products = Array.isArray(order.products) ? order.products : [];

    return (
        <div className={styles['wrapper']}>
            {/* Top Navigation Bar */}
            <div className={styles['top-bar']}>
                <Link to="/shipping" className={styles['back-link']}>
                    <span className="material-symbols-outlined">arrow_back</span>
                    <span>All Orders & Shipments</span>
                </Link>

                <div className={styles['top-actions']}>
                    <button
                        type="button"
                        onClick={handleDownloadReceiptPdf}
                        disabled={downloadingPdf}
                        className={styles['receipt-pdf-btn']}
                    >
                        <span className="material-symbols-outlined">receipt_long</span>
                        <span>
                            {downloadingPdf ? 'Generating POS PDF...' : 'Download POS Receipt (PDF)'}
                        </span>
                    </button>

                    <Link to={`/shipping/${order.order_id}`} className={styles['track-cta']}>
                        <span className="material-symbols-outlined">local_shipping</span>
                        <span>Track Live Shipment →</span>
                    </Link>
                </div>
            </div>

            {/* Order Confirmation & Progress Header Card */}
            <section className={styles['hero-card']}>
                <div className={styles['hero-top']}>
                    <div>
                        <span className={styles['eyebrow']}>ORDER RECEIPT & STATUS</span>
                        <h1>
                            Order <span>#{order.order_id}</span>
                        </h1>
                        <p className={styles['date-line']}>
                            Placed on {formatOrderDate(order.ordered_at)} •{' '}
                            {isPickup ? 'Pickup Station Order' : '20-Min Express Doorstep'}
                        </p>
                    </div>

                    <div className={styles['hero-right']}>
                        <span
                            className={`${styles['status-pill']} ${
                                isCancelled
                                    ? styles['tone-cancelled']
                                    : isDelivered
                                    ? styles['tone-delivered']
                                    : styles['tone-active']
                            }`}
                        >
                            {statusMeta.label}
                        </span>
                        <div className={styles['total-box']}>
                            <small>Total Paid</small>
                            <strong>{formatKES(order.total)} KES</strong>
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className={styles['progress-stage']}>
                    <div className={styles['full-progress']}>
                        <div
                            className={styles['progress']}
                            style={{width: `${getProgress()}%`}}
                        >
                            <img
                                className={styles['img']}
                                style={{transform: isCancelled ? 'scaleX(-1)' : ''}}
                                src={OrderIcon}
                                alt="Order Progress"
                            />
                        </div>
                    </div>
                </div>

                <div className={styles['status-note']}>
                    <div>
                        <strong>Order Status:</strong> <span>{statusMeta.label}</span> —{' '}
                        {statusMeta.detailMessage}
                    </div>
                    <Link to={`/shipping/${order.order_id}`} className={styles['inline-track']}>
                        Open Live Rider Map & Shipment Tracker →
                    </Link>
                </div>
            </section>

            {/* Vertical Chronological Status History Timeline */}
            <OrderStatusTimeline order={order}/>

            {/* Two-Column Receipt Body: Ordered Items + Customer/Delivery Summary */}
            <div className={styles['content-grid']}>
                <section className={styles['card']}>
                    <div className={styles['card-head']}>
                        <h2>Ordered Groceries ({products.length})</h2>
                        {isDelivered && products[0]?.product_id && (
                            pendingReviewsData && pendingItemsForThisOrder.length === 0 ? (
                                <Link to="/profile?tab=reviews" className={styles['reviewed-link']}>
                                    ✓ Order Reviewed
                                </Link>
                            ) : (
                                <Link
                                    to={`/products/${
                                        pendingItemsForThisOrder[0]?.product_id || products[0].product_id
                                    }?review=true&order=${order.order_id}`}
                                    className={styles['rate-link']}
                                >
                                    ★ Rate Products & Seller
                                </Link>
                            )
                        )}
                    </div>

                    <div className={styles['items-list']}>
                        {products.map((item, idx) => {
                            const qty = Number(item.quantity) || 1;
                            const unitPrice = Number(item.ordered_price) || getEffectivePrice(item);
                            return (
                                <div key={item.product_id || idx} className={styles['item-row']}>
                                    <Link
                                        to={`/products/${item.product_id}`}
                                        className={styles['item-thumb']}
                                    >
                                        <img src={item.image} alt={item.name}/>
                                    </Link>

                                    <div className={styles['item-main']}>
                                        <Link
                                            to={`/products/${item.product_id}`}
                                            className={styles['item-title']}
                                        >
                                            {item.name}
                                        </Link>
                                        <div className={styles['item-sub']}>
                                            <span>Quantity: {qty}</span>
                                            {item.weight && (
                                                <span>
                                                    • {item.weight} {item.measurement}
                                                </span>
                                            )}
                                            {unitPrice > 0 && (
                                                <span>• {formatKES(unitPrice)} KES each</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles['item-price']}>
                                        <strong>{formatKES(unitPrice * qty)} KES</strong>
                                        {isDelivered && (
                                            pendingReviewsData &&
                                            !pendingProductIdSet.has(item.product_id) ? (
                                                <Link
                                                    to={`/products/${item.product_id}?review=true&order=${order.order_id}`}
                                                    className={styles['mini-reviewed']}
                                                >
                                                    ✓ Reviewed
                                                </Link>
                                            ) : (
                                                <Link
                                                    to={`/products/${item.product_id}?review=true&order=${order.order_id}`}
                                                    className={styles['mini-rate']}
                                                >
                                                    ★ Rate
                                                </Link>
                                            )
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <aside className={styles['card']}>
                    <div className={styles['card-head']}>
                        <h2>Customer & Delivery Summary</h2>
                    </div>

                    <div className={styles['summary-list']}>
                        <div className={styles['summary-item']}>
                            <small>Customer</small>
                            <strong>
                                {[order.name?.first, order.name?.last].filter(Boolean).join(' ') ||
                                    'Valued Customer'}
                            </strong>
                            {order.email && <span>{order.email}</span>}
                            {order.phone_number && <span>{order.phone_number}</span>}
                        </div>

                        <div className={styles['summary-item']}>
                            <small>Delivery Mode</small>
                            <strong>
                                {isPickup ? '🏪 Pickup Station' : '🛵 20-Min Doorstep Delivery'}
                            </strong>
                        </div>

                        <div className={styles['summary-item']}>
                            <small>{isPickup ? 'Selected Pickup Hub' : 'Delivery Address'}</small>
                            <strong>
                                {isPickup
                                    ? order.address?.pickup_station?.name ||
                                      order.address?.street ||
                                      'KijaniMart Pickup Station'
                                    : [
                                          order.address?.street,
                                          order.address?.area,
                                          order.address?.city,
                                      ]
                                          .filter(Boolean)
                                          .join(', ') || 'Nairobi, Kenya'}
                            </strong>
                            {isPickup && order.address?.pickup_station?.opening_hours && (
                                <span>🕒 {order.address.pickup_station.opening_hours}</span>
                            )}
                        </div>
                    </div>

                    <div className={styles['total-footer']}>
                        <span>Total Paid</span>
                        <strong>{formatKES(order.total)} KES</strong>
                    </div>

                    <button
                        type="button"
                        onClick={handleDownloadReceiptPdf}
                        disabled={downloadingPdf}
                        className={styles['full-receipt-btn']}
                    >
                        <span className="material-symbols-outlined">download</span>
                        <span>
                            {downloadingPdf ? 'Preparing POS Receipt...' : 'Download POS Receipt (PDF)'}
                        </span>
                    </button>

                    <Link to={`/shipping/${order.order_id}`} className={`btn1 ${styles['full-track-btn']}`}>
                        <span>Track Live Shipment</span>
                        <span className="material-symbols-outlined">near_me</span>
                    </Link>
                </aside>
            </div>
        </div>
    );
};

export default OrderId;
