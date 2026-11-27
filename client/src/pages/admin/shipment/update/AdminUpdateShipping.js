import styles from '../../orders/update/adminUpdateOrder.module.css';
import {useEffect, useState} from "react";
import {useDispatch} from "react-redux";
import {Link, useLocation} from "react-router-dom";
import {useQuery} from "@tanstack/react-query";
import {fetchShipment, updateShipment} from "../../../../actions/shipping";
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

const SHIPMENT_DESCRIPTIONS = ADMIN_SELECTABLE_STATUSES.map((key) => {
    const meta = getStatusMeta(key);
    return {
        id: key,
        label: meta.label,
        desc: meta.desc,
        icon: meta.icon,
    };
});

const AdminUpdateShipping = () => {
    const dispatch = useDispatch();
    const location = useLocation();

    const [id, setId] = useState('');
    const [shipment, setShipment] = useState(null);
    const [status, setStatus] = useState('PENDING_CONFIRMATION');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const {data: recentData} = useQuery({
        queryKey: ['adminShipmentsQuickList'],
        queryFn: async () => {
            const res = await api.fetchShipments(1);
            return res.data?.shipments || [];
        },
        staleTime: 0,
        refetchOnMount: 'always',
    });

    const recentShipments = Array.isArray(recentData) ? recentData.slice(0, 10) : [];

    const lookupShipmentById = (shipmentIdToFind) => {
        const cleaned = String(shipmentIdToFind || '')
            .trim()
            .replace(/^#/, '')
            .toUpperCase();
        if (!cleaned) return setError('Please enter a 6-character Order / Shipment ID.');
        setLoading(true);
        setError('');
        setSuccessMsg('');

        dispatch(
            fetchShipment(
                cleaned,
                (foundShipment) => {
                    setShipment(foundShipment);
                    setStatus(normalizeStatusKey(foundShipment.status));
                    setId(cleaned);
                    setLoading(false);
                },
                (err) => {
                    setLoading(false);
                    setError(err?.message || `Shipment #${cleaned} was not found.`);
                }
            )
        );
    };

    useEffect(() => {
        const query = new URLSearchParams(location.search);
        const queryId = query.get('id');
        if (queryId) {
            setId(queryId.toUpperCase());
            lookupShipmentById(queryId);
        }
    }, [location.search]);

    const handleConfirmUpdate = (overrideStatus) => {
        if (!shipment?.order_id) return;
        const targetStatus =
            typeof overrideStatus === 'string' && overrideStatus ? overrideStatus : status;
        if (targetStatus !== status) setStatus(targetStatus);
        setLoading(true);
        setError('');
        setSuccessMsg('');

        dispatch(
            updateShipment(
                shipment.order_id,
                targetStatus,
                (updated) => {
                    setLoading(false);
                    setShipment((prev) => ({
                        ...prev,
                        ...(updated && typeof updated === 'object' ? updated : {}),
                        status: targetStatus,
                        seller_updates: Array.isArray(prev?.seller_updates)
                            ? prev.seller_updates.map((u) => ({...u, admin_acknowledged: true}))
                            : [],
                    }));
                    setSuccessMsg(
                        targetStatus === 'DELIVERED'
                            ? `✓ Order & Shipment #${shipment.order_id} synced to DELIVERED! Customer review notification and email have been sent.`
                            : `✓ Order & Shipment #${shipment.order_id} unified status synced to ${getStatusMeta(targetStatus).label}.`
                    );
                },
                (err) => {
                    setLoading(false);
                    setError(err?.message || 'Failed to update shipping status.');
                }
            )
        );
    };

    return (
        <AdminLayout
            title="Update Shipping & Dispatch Status"
            subtitle="Look up any shipment by Order ID or pick from recent dispatches on the right."
            actions={
                <Link to="/admin/shipping" className={styles['back-btn']}>
                    ← View All Shipments Table
                </Link>
            }
        >
            {error && <Error error={error} setError={setError}/>}
            {loading && <Loading text="Updating Shipment Database" overlay={true}/>}
            {successMsg && <div className={styles['success-banner']}>{successMsg}</div>}

            <div className={styles['grid']}>
                <div className={styles['main-col']}>
                    <div className={styles['card']}>
                        <h3>1. Find Shipment by 6-Character Order ID</h3>
                        <form
                            className={styles['search-row']}
                            onSubmit={(e) => {
                                e.preventDefault();
                                lookupShipmentById(id);
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
                                <span>Find Shipment</span>
                                <span className="material-symbols-outlined">local_shipping</span>
                            </button>
                        </form>
                    </div>

                    {shipment ? (
                        <div className={styles['card']}>
                            <div className={styles['order-head']}>
                                <div>
                                    <span className={styles['badge']}>LOADED SHIPMENT</span>
                                    <h2>Shipment #{shipment.order_id}</h2>
                                    <p>
                                        Destination:{' '}
                                        <strong>
                                            {shipment.address?.pickup_station?.name ||
                                                [
                                                    shipment.address?.street,
                                                    shipment.address?.area,
                                                    shipment.address?.city,
                                                ]
                                                    .filter(Boolean)
                                                    .join(', ') ||
                                                'Doorstep Delivery'}
                                        </strong>{' '}
                                        • Total: <strong>{formatKES(shipment.total)} KES</strong>
                                    </p>
                                </div>
                                <Link
                                    to={`/shipping/${shipment.order_id}`}
                                    className={styles['receipt-btn']}
                                >
                                    Open Live Tracker ↗
                                </Link>
                            </div>

                            <div className={styles['sync-banner']}>
                                <span className="material-symbols-outlined">sync_lock</span>
                                <span>
                                    <strong>Unified Fulfillment Sync:</strong> Updating dispatch status
                                    here atomically syncs both the{' '}
                                    <strong>Live Shipment Tracker</strong> and{' '}
                                    <strong>Order Receipt</strong> in a single transaction.
                                </span>
                            </div>

                            {Array.isArray(shipment.seller_updates) &&
                                shipment.seller_updates.length > 0 && (
                                    <div className={styles['seller-updates-panel']}>
                                        <div className={styles['seller-updates-head']}>
                                            <span className="material-symbols-outlined">store</span>
                                            <strong>
                                                Seller Fulfillment Updates (Visible Only to Admin
                                                Until Applied)
                                            </strong>
                                        </div>
                                        <div className={styles['seller-updates-list']}>
                                            {shipment.seller_updates.map((upd, idx) => {
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

                            <h3>2. Select New Dispatch Status</h3>
                            <div className={styles['status-cards']}>
                                {SHIPMENT_DESCRIPTIONS.map((item) => {
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
                                <span>Save Dispatch Status as {getStatusMeta(status).label}</span>
                                <span className="material-symbols-outlined">check_circle</span>
                            </button>

                            <OrderStatusTimeline order={{...shipment, status}}/>
                        </div>
                    ) : (
                        <div className={styles['empty-prompt']}>
                            <span className="material-symbols-outlined">local_shipping</span>
                            <p>
                                Enter an Order ID above or click any shipment from the{' '}
                                <strong>Quick-Select Recent Shipments</strong> list on the right.
                            </p>
                        </div>
                    )}
                </div>

                <aside className={styles['card']}>
                    <h3>Quick-Select Recent Shipments</h3>
                    <p className={styles['sub-note']}>
                        Click any recent shipment below to load and update its dispatch status.
                    </p>

                    <div className={styles['quick-list']}>
                        {recentShipments.map((sh) => (
                            <button
                                key={sh.order_id}
                                type="button"
                                onClick={() => lookupShipmentById(sh.order_id)}
                                className={`${styles['quick-item']} ${
                                    shipment?.order_id === sh.order_id
                                        ? styles['quick-item-active']
                                        : ''
                                }`}
                            >
                                <div>
                                    <strong>
                                        #{sh.order_id}
                                        {(sh.seller_updates || []).some(
                                            (u) => !u.admin_acknowledged
                                        ) && (
                                            <span className={styles['quick-seller-tag']}>
                                                🏪 Seller Update
                                            </span>
                                        )}
                                    </strong>
                                    <span>
                                        {sh.address?.pickup_station?.name ||
                                            sh.address?.area ||
                                            sh.address?.city ||
                                            'Doorstep'}
                                    </span>
                                </div>
                                <div className={styles['quick-right']}>
                                    <strong>{formatKES(sh.total)} KES</strong>
                                    <small>{getStatusMeta(sh.status).shortLabel}</small>
                                </div>
                            </button>
                        ))}
                    </div>
                </aside>
            </div>
        </AdminLayout>
    );
};

export default AdminUpdateShipping;
