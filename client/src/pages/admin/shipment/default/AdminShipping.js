import styles from '../../orders/default/adminOrders.module.css';
import {useEffect, useState} from "react";
import {useDispatch} from "react-redux";
import {Link} from "react-router-dom";
import {useInfiniteQuery} from "@tanstack/react-query";
import * as api from "../../../../api";
import {SHIPPING_FETCH_ALL} from "../../../../constants/actions/shipping";
import {queryClient} from "../../../../index";
import AdminLayout from "../../../../components/admin-layout/AdminLayout";
import TablePagination from "../../../../components/table-pagination/TablePagination";
import Loading from "../../../../components/loading/Loading";
import {formatKES} from "../../../../utils/pricing";
import {
    ADMIN_SELECTABLE_STATUSES,
    getStatusMeta,
    isDeliveredStatus,
    isTerminalGreyStatus,
    normalizeStatusKey,
} from "../../../../utils/orderStatuses";

const SHIPMENT_STATUSES = ADMIN_SELECTABLE_STATUSES;
const SHIPMENT_FILTERS = [
    {id: 'ALL', label: 'All'},
    {id: 'SELLER_UPDATES', label: 'Seller Updates'},
    ...ADMIN_SELECTABLE_STATUSES.map((key) => ({
        id: key,
        label: getStatusMeta(key).shortLabel,
    })),
];

const getPendingSellerUpdates = (sh) =>
    (Array.isArray(sh?.seller_updates) ? sh.seller_updates : []).filter(
        (u) => !u.admin_acknowledged
    );

const formatDateTime = (val) => {
    if (!val) return 'Recent';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const AdminShipping = () => {
    const dispatch = useDispatch();

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    const [updatingId, setUpdatingId] = useState(null);
    const [toast, setToast] = useState('');
    const [error, setError] = useState('');

    const {
        data,
        isPending,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['adminShipments'],
        queryFn: async ({pageParam = 1}) => {
            const res = await api.fetchShipments(pageParam);
            dispatch({type: SHIPPING_FETCH_ALL, data: res.data});
            return {...res.data, currentPage: pageParam};
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const totalPages = Number(lastPage?.total_pages || 0);
            const nextPage = Number(lastPage?.currentPage || 1) + 1;
            return nextPage <= totalPages ? nextPage : undefined;
        },
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
    });

    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, rowsPerPage]);

    const shipments = data?.pages?.flatMap((pageData) => pageData?.shipments || []) || [];

    const handleInlineStatusChange = async (orderId, nextStatus) => {
        setUpdatingId(orderId);
        setError('');
        try {
            await api.updateShipment(orderId, nextStatus);
            queryClient.invalidateQueries({queryKey: ['adminShipments']});
            queryClient.invalidateQueries({queryKey: ['adminShipmentsQuickList']});
            queryClient.invalidateQueries({queryKey: ['adminOrders']});
            queryClient.invalidateQueries({queryKey: ['adminOrdersQuickList']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['shipment']});
            queryClient.invalidateQueries({queryKey: ['order']});
            queryClient.invalidateQueries({queryKey: ['myShipments']});
            setToast(
                nextStatus === 'DELIVERED'
                    ? `✓ Order & Shipment #${orderId} synced to DELIVERED (customer review notification & email triggered).`
                    : `✓ Order & Shipment #${orderId} synced to ${getStatusMeta(nextStatus).label}.`
            );
            setTimeout(() => setToast(''), 4500);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update shipment status.');
        } finally {
            setUpdatingId(null);
        }
    };

    const shipmentStatusCounts = shipments.reduce((acc, s) => {
        const st = normalizeStatusKey(s.status);
        acc[st] = (acc[st] || 0) + 1;
        return acc;
    }, {});

    const pendingSellerUpdatesCount = shipments.filter(
        (s) => getPendingSellerUpdates(s).length > 0
    ).length;

    const filteredShipments = shipments.filter((s) => {
        const st = normalizeStatusKey(s.status);
        if (statusFilter === 'SELLER_UPDATES') {
            if (getPendingSellerUpdates(s).length === 0) return false;
        } else if (statusFilter !== 'ALL' && st !== statusFilter) {
            return false;
        }
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            return (
                String(s.order_id || '').toLowerCase().includes(q) ||
                String(s.address?.city || '').toLowerCase().includes(q) ||
                String(s.address?.area || '').toLowerCase().includes(q) ||
                String(s.address?.street || '').toLowerCase().includes(q) ||
                String(s.address?.pickup_station?.name || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const paginatedShipments = filteredShipments.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    return (
        <AdminLayout
            title="All Shipments & Express Dispatches"
            subtitle="Monitor rider deliveries, pickup hub arrivals, and transition dispatch statuses inline."
            actions={
                <Link to="/admin/shipping/update" className={styles['header-btn']}>
                    <span className="material-symbols-outlined">published_with_changes</span>
                    <span>Dispatch Lookup Tool</span>
                </Link>
            }
        >
            {toast && <div className={styles['toast-ok']}>{toast}</div>}
            {error && <div className={styles['toast-err']}>{error}</div>}

            {/* Summary Strip */}
            <div className={styles['summary-strip']}>
                <div className={styles['sum-box']}>
                    <small>Total Shipments</small>
                    <strong>{shipments.length}</strong>
                </div>
                <div className={styles['sum-box']}>
                    <small>Waiting / Queued</small>
                    <strong>
                        {
                            shipments.filter((s) => {
                                const k = normalizeStatusKey(s.status);
                                return (
                                    k === 'ORDER_PLACED' ||
                                    k === 'PENDING_CONFIRMATION' ||
                                    k === 'WAITING_TO_BE_SHIPPED'
                                );
                            }).length
                        }
                    </strong>
                </div>
                <div className={styles['sum-box']}>
                    <small>Shipped / Pickup Ready</small>
                    <strong>
                        {
                            shipments.filter((s) => {
                                const k = normalizeStatusKey(s.status);
                                return k === 'SHIPPED' || k === 'AVAILABLE_FOR_PICKUP';
                            }).length
                        }
                    </strong>
                </div>
                <div className={styles['sum-box']}>
                    <small>Delivered</small>
                    <strong>{shipments.filter((s) => isDeliveredStatus(s.status)).length}</strong>
                </div>
            </div>

            <div className={styles['card']}>
                <div className={styles['toolbar']}>
                    <div className={styles['search-input']}>
                        <span className="material-symbols-outlined">local_shipping</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by Order ID (#BGOX5U), pickup hub, street, area, or city..."
                        />
                    </div>

                    <div className={styles['filter-pills']}>
                        {SHIPMENT_FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setStatusFilter(f.id)}
                                className={`${styles['pill']} ${
                                    f.id === 'SELLER_UPDATES' && pendingSellerUpdatesCount > 0
                                        ? styles['pill-seller-alert']
                                        : ''
                                } ${statusFilter === f.id ? styles['pill-active'] : ''}`}
                            >
                                {f.id === 'ALL'
                                    ? `All (${shipments.length})`
                                    : f.id === 'SELLER_UPDATES'
                                    ? `🏪 Seller Updates (${pendingSellerUpdatesCount})`
                                    : `${f.label}${shipmentStatusCounts[f.id] ? ` (${shipmentStatusCounts[f.id]})` : ''}`}
                            </button>
                        ))}
                    </div>
                </div>

                {isPending ? (
                    <Loading/>
                ) : filteredShipments.length === 0 ? (
                    <div className={styles['empty']}>
                        <span className="material-symbols-outlined">local_shipping</span>
                        <h3>No matching shipments found</h3>
                        <p>Try clearing your search filter or status tab.</p>
                    </div>
                ) : (
                    <>
                        <div className={styles['table-wrap']}>
                            <table className={styles['table']}>
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Ordered Date</th>
                                        <th>Method</th>
                                        <th>Destination / Pickup Hub</th>
                                        <th>Total (KES)</th>
                                        <th>Status</th>
                                        <th>Quick Update</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedShipments.map((sh) => {
                                        const isPickup =
                                            sh.address?.delivery_method === 'PICKUP_STATION';
                                        const st = normalizeStatusKey(sh.status);
                                        const meta = getStatusMeta(st);
                                        const toneClass =
                                            meta.tone === 'green'
                                                ? styles['st-fulfilled']
                                                : meta.tone === 'grey'
                                                ? styles['st-cancelled']
                                                : meta.tone === 'amber'
                                                ? styles['st-processing']
                                                : styles['st-created'];

                                        const destLabel = isPickup
                                            ? sh.address?.pickup_station?.name ||
                                              sh.address?.street ||
                                              'Pickup Hub'
                                            : [
                                                  sh.address?.street,
                                                  sh.address?.area,
                                                  sh.address?.city,
                                              ]
                                                  .filter(Boolean)
                                                  .join(', ') || 'Doorstep';

                                        return (
                                            <tr key={sh.order_id}>
                                                <td>
                                                    <Link
                                                        to={`/shipping/${sh.order_id}`}
                                                        className={styles['id-badge']}
                                                    >
                                                        #{sh.order_id}
                                                    </Link>
                                                </td>
                                                <td className={styles['date-cell']}>
                                                    {formatDateTime(sh.ordered_at)}
                                                </td>
                                                <td>
                                                    <span className={styles['mode-chip']}>
                                                        {isPickup ? '🏪 Pickup' : '🛵 Doorstep'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className={styles['cust-cell']}>
                                                        <strong>{destLabel}</strong>
                                                        <small>
                                                            {sh.address?.area
                                                                ? `${sh.address.area}, ${
                                                                      sh.address.city || 'Nairobi'
                                                                  }`
                                                                : sh.address?.city || 'Kenya'}
                                                        </small>
                                                    </div>
                                                </td>
                                                <td>
                                                    <strong className={styles['price-text']}>
                                                        {formatKES(sh.total)} KES
                                                    </strong>
                                                </td>
                                                <td>
                                                    <div className={styles['status-stack']}>
                                                        <span
                                                            className={`${styles['status-badge']} ${toneClass}`}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                        {getPendingSellerUpdates(sh).map((upd, idx) => {
                                                            const pMeta = getStatusMeta(
                                                                upd.proposed_status
                                                            );
                                                            return (
                                                                <div
                                                                    key={`${upd.seller_id || idx}-${idx}`}
                                                                    className={styles['seller-prop-box']}
                                                                >
                                                                    <small>
                                                                        🏪{' '}
                                                                        <strong>
                                                                            {upd.seller_name || 'Seller'}
                                                                        </strong>{' '}
                                                                        reported:{' '}
                                                                        <b>{pMeta.shortLabel}</b>
                                                                    </small>
                                                                    {upd.note && (
                                                                        <span className={styles['seller-prop-note']}>
                                                                            "{upd.note}"
                                                                        </span>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        disabled={
                                                                            updatingId === sh.order_id
                                                                        }
                                                                        onClick={() =>
                                                                            handleInlineStatusChange(
                                                                                sh.order_id,
                                                                                upd.proposed_status
                                                                            )
                                                                        }
                                                                        className={styles['apply-prop-btn']}
                                                                    >
                                                                        Apply {pMeta.shortLabel} ✓
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td>
                                                    <select
                                                        value={st}
                                                        disabled={updatingId === sh.order_id}
                                                        onChange={(e) =>
                                                            handleInlineStatusChange(
                                                                sh.order_id,
                                                                e.target.value
                                                            )
                                                        }
                                                        className={styles['inline-select']}
                                                    >
                                                        {SHIPMENT_STATUSES.map((opt) => (
                                                            <option key={opt} value={opt}>
                                                                {getStatusMeta(opt).label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <div className={styles['actions-cell']}>
                                                        <Link
                                                            to={`/shipping/${sh.order_id}`}
                                                            className={styles['view-btn']}
                                                        >
                                                            Tracker
                                                        </Link>
                                                        <Link
                                                            to={`/admin/orders/${sh.order_id}`}
                                                            className={styles['track-btn']}
                                                        >
                                                            Order
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <TablePagination
                            totalItems={filteredShipments.length}
                            currentPage={currentPage}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setCurrentPage}
                            onRowsPerPageChange={setRowsPerPage}
                            itemLabel="shipments"
                        />
                    </>
                )}
            </div>
        </AdminLayout>
    );
};

export default AdminShipping;
