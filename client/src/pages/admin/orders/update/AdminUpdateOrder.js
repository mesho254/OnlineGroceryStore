import styles from './adminUpdateOrder.module.css';
import {useEffect, useState} from "react";
import {useDispatch} from "react-redux";
import {Link, useLocation} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {fetchOrder, updateOrder} from "../../../../actions/orders";
import * as api from "../../../../api";
import AdminLayout from "../../../../components/admin-layout/AdminLayout";
import OrderStatusTimeline from "../../../../components/order-timeline/OrderStatusTimeline";
import Loading from "../../../../components/loading/Loading";
import Error from "../../../../components/feedback/error/Error";
import {formatKES} from "../../../../utils/pricing";
import {
    ADMIN_SELECTABLE_STATUSES,
    getStatusMeta,
    normalizeStatusKey,
} from "../../../../utils/orderStatuses";

const STATUS_DESCRIPTIONS = ADMIN_SELECTABLE_STATUSES.map((key) => {
    const meta = getStatusMeta(key);
    return {
        id: key,
        label: meta.label,
        desc: meta.desc,
        icon: meta.icon,
    };
});

const AdminUpdateOrder = () => {
    const dispatch = useDispatch();
    const location = useLocation();

    const [id, setId] = useState('');
    const [order, setOrder] = useState(null);
    const [status, setStatus] = useState('PENDING_CONFIRMATION');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const {data: recentData} = useQuery({
        queryKey: ['adminOrdersQuickList'],
        queryFn: async () => {
            const res = await api.fetchOrders(1);
            return res.data?.orders || [];
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const recentOrders = Array.isArray(recentData) ? recentData.slice(0, 10) : [];

    const lookupOrderById = (orderIdToFind) => {
        const cleaned = String(orderIdToFind || '')
            .trim()
            .replace(/^#/, '')
            .toUpperCase();
        if (!cleaned) return setError('Please enter a 6-character Order ID.');
        setLoading(true);
        setError('');
        setSuccessMsg('');

        dispatch(
            fetchOrder(
                cleaned,
                (foundOrder) => {
                    setOrder(foundOrder);
                    setStatus(normalizeStatusKey(foundOrder.status));
                    setId(cleaned);
                    setLoading(false);
                },
                (err) => {
                    setLoading(false);
                    setError(err?.message || `Order #${cleaned} was not found.`);
                }
            )
        );
    };

    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const queryId = query.get('id');
        if (queryId) {
            setId(queryId.toUpperCase());
            lookupOrderById(queryId);
        }
    }, [location.search]);

    const handleConfirmUpdate = (overrideStatus) => {
        if (!order?.order_id) return;
        const targetStatus =
            typeof overrideStatus === 'string' && overrideStatus ? overrideStatus : status;
        if (targetStatus !== status) setStatus(targetStatus);
        setLoading(true);
        setError('');
        setSuccessMsg('');

        dispatch(
            updateOrder(
                order.order_id,
                targetStatus,
                (updated) => {
                    setLoading(false);
                    setOrder((prev) => ({
                        ...prev,
                        ...(updated && typeof updated === 'object' ? updated : {}),
                        status: targetStatus,
                    }));
                    setSuccessMsg(
                        `✓ Order & Shipment #${order.order_id} unified status synced to ${getStatusMeta(targetStatus).label}.`
                    );
                },
                (err) => {
                    setLoading(false);
                    setError(err?.message || 'Failed to update order status.');
                }
            )
        );
    };

    return (
        <AdminLayout
            title="Update Order Status"
            subtitle="Look up any order by ID or pick from recent orders on the right to update its fulfillment stage."
            actions={
                <Link to="/admin/orders" className={styles['back-btn']}>
                    ← View All Orders Table
                </Link>
            }
        >
            {error && <Error error={error} setError={setError}/>}
            {loading && <Loading text="Updating Order Database" overlay={true}/>}
            {successMsg && <div className={styles['success-banner']}>{successMsg}</div>}

            <div className={styles['grid']}>
                {/* Left Column: Search & Active Order Status Editor */}
                <div className={styles['main-col']}>
                    <div className={styles['card']}>
                        <h3>1. Find Order by 6-Character ID</h3>
                        <form
                            className={styles['search-row']}
                            onSubmit={(e) => {
                                e.preventDefault();
                                lookupOrderById(id);
                            }}
                        >
                            <input
                                type="text"
                                value={id}
                                maxLength={7}
                                onChange={(e) => setId(e.target.value.toUpperCase())}
                                placeholder="Enter Order ID (e.g. BGOX5U)"
                            />
                            <button type="submit" className="btn1">
                                <span>Find Order</span>
                                <span className="material-symbols-outlined">search</span>
                            </button>
                        </form>
                    </div>

                    {order ? (
                        <div className={styles['card']}>
                            <div className={styles['order-head']}>
                                <div>
                                    <span className={styles['badge']}>LOADED ORDER</span>
                                    <h2>Order #{order.order_id}</h2>
                                    <p>
                                        Customer:{' '}
                                        <strong>
                                            {[order.name?.first, order.name?.last]
                                                .filter(Boolean)
                                                .join(' ') || order.email}
                                        </strong>{' '}
                                        • Total: <strong>{formatKES(order.total)} KES</strong>
                                    </p>
                                </div>
                                <Link
                                    to={`/orders/${order.order_id}`}
                                    className={styles['receipt-btn']}
                                >
                                    Open Receipt ↗
                                </Link>
                            </div>

                            <div className={styles['sync-banner']}>
                                <span className="material-symbols-outlined">sync_lock</span>
                                <span>
                                    <strong>Unified Fulfillment Sync:</strong> Updating the status here
                                    atomically updates both the <strong>Order Receipt</strong> and{' '}
                                    <strong>Live Shipment Tracker</strong> together so they never go
                                    out of sync.
                                </span>
                            </div>

                            {Array.isArray(order.seller_updates) &&
                                order.seller_updates.length > 0 && (
                                    <div className={styles['seller-updates-panel']}>
                                        <div className={styles['seller-updates-head']}>
                                            <span className="material-symbols-outlined">store</span>
                                            <strong>
                                                Seller Fulfillment Updates (Not Yet Visible to
                                                Customer Until Admin Applies)
                                            </strong>
                                        </div>
                                        <div className={styles['seller-updates-list']}>
                                            {order.seller_updates.map((upd, idx) => {
                                                const pMeta = getStatusMeta(upd.proposed_status);
                                                return (
                                                    <div
                                                        key={`${upd.seller_id || idx}-${idx}`}
                                                        className={`${styles['seller-update-row']} ${
                                                            upd.admin_acknowledged
                                                                ? styles['seller-update-done']
                                                                : ''
                                                        }`}
                                                    >
                                                        <div>
                                                            <strong>
                                                                {upd.seller_name || 'Seller'} →{' '}
                                                                {pMeta.label}
                                                            </strong>
                                                            {upd.note && <p>"{upd.note}"</p>}
                                                            <small>
                                                                {upd.admin_acknowledged
                                                                    ? '✓ Applied / Acknowledged by Admin'
                                                                    : '⏳ Pending Admin Confirmation'}
                                                            </small>
                                                        </div>
                                                        {!upd.admin_acknowledged && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleConfirmUpdate(
                                                                        upd.proposed_status
                                                                    )
                                                                }
                                                                className={styles['apply-seller-btn']}
                                                            >
                                                                Apply {pMeta.shortLabel} to Customer ✓
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                            <h3>2. Select New Order Status</h3>
                            <div className={styles['status-cards']}>
                                {STATUS_DESCRIPTIONS.map((item) => {
                                    const active = status === item.id;
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setStatus(item.id)}
                                            className={`${styles['status-option']} ${
                                                active ? styles['status-option-active'] : ''
                                            }`}
                                        >
                                            <span className="material-symbols-outlined">
                                                {item.icon}
                                            </span>
                                            <div>
                                                <strong>{item.label}</strong>
                                                <small>{item.desc}</small>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                type="button"
                                onClick={handleConfirmUpdate}
                                className={`btn1 ${styles['confirm-btn']}`}
                            >
                                <span>Save Status as {getStatusMeta(status).label}</span>
                                <span className="material-symbols-outlined">check_circle</span>
                            </button>

                            <OrderStatusTimeline order={{...order, status}}/>
                        </div>
                    ) : (
                        <div className={styles['empty-prompt']}>
                            <span className="material-symbols-outlined">Touch_app</span>
                            <p>
                                Enter an Order ID above or click any order from the{' '}
                                <strong>Quick-Select Recent Orders</strong> list on the right.
                            </p>
                        </div>
                    )}
                </div>

                {/* Right Column: Quick-Select Recent Orders */}
                <aside className={styles['card']}>
                    <h3>Quick-Select Recent Orders</h3>
                    <p className={styles['sub-note']}>
                        Click any recent order below to load it immediately.
                    </p>

                    <div className={styles['quick-list']}>
                        {recentOrders.map((ord) => (
                            <button
                                key={ord.order_id}
                                type="button"
                                onClick={() => lookupOrderById(ord.order_id)}
                                className={`${styles['quick-item']} ${
                                    order?.order_id === ord.order_id
                                        ? styles['quick-item-active']
                                        : ''
                                }`}
                            >
                                <div>
                                    <strong>
                                        #{ord.order_id}
                                        {(ord.seller_updates || []).some(
                                            (u) => !u.admin_acknowledged
                                        ) && (
                                            <span className={styles['quick-seller-tag']}>
                                                🏪 Seller Update
                                            </span>
                                        )}
                                    </strong>
                                    <span>
                                        {[ord.name?.first, ord.name?.last]
                                            .filter(Boolean)
                                            .join(' ') || ord.email}
                                    </span>
                                </div>
                                <div className={styles['quick-right']}>
                                    <strong>{formatKES(ord.total)} KES</strong>
                                    <small>{getStatusMeta(ord.status).shortLabel}</small>
                                </div>
                            </button>
                        ))}
                    </div>
                </aside>
            </div>
        </AdminLayout>
    );
};

export default AdminUpdateOrder;
