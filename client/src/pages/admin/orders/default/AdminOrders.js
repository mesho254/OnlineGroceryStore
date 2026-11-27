import styles from './adminOrders.module.css';
import {useEffect, useState} from "react";
import {useDispatch} from "react-redux";
import {Link} from "react-router-dom";
import {useInfiniteQuery} from "@tanstack/react-query";
import * as api from "../../../../api";
import {ORDERS_FETCH_ALL} from "../../../../constants/actions/orders";
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

const ORDER_STATUSES = ADMIN_SELECTABLE_STATUSES;
const QUICK_FILTERS = [
    {id: 'ALL', label: 'All'},
    {id: 'SELLER_UPDATES', label: 'Seller Updates'},
    ...ADMIN_SELECTABLE_STATUSES.map((key) => ({
        id: key,
        label: getStatusMeta(key).shortLabel,
    })),
];

const getPendingSellerUpdates = (ord) =>
    (Array.isArray(ord?.seller_updates) ? ord.seller_updates : []).filter(
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

const AdminOrders = () => {
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
        queryKey: ['adminOrders'],
        queryFn: async ({pageParam = 1}) => {
            const res = await api.fetchOrders(pageParam);
            dispatch({type: ORDERS_FETCH_ALL, data: res.data});
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

    // Automatically fetch any remaining server pages so client-side rows-per-page pagination has full dataset
    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [search, statusFilter, rowsPerPage]);

    const orders = data?.pages?.flatMap((pageData) => pageData?.orders || []) || [];

    const handleInlineStatusChange = async (orderId, nextStatus) => {
        setUpdatingId(orderId);
        setError('');
        try {
            await api.updateOrder(orderId, nextStatus);
            queryClient.invalidateQueries({queryKey: ['adminOrders']});
            queryClient.invalidateQueries({queryKey: ['adminOrdersQuickList']});
            queryClient.invalidateQueries({queryKey: ['adminShipments']});
            queryClient.invalidateQueries({queryKey: ['adminShipmentsQuickList']});
            queryClient.invalidateQueries({queryKey: ['adminOverview']});
            queryClient.invalidateQueries({queryKey: ['order']});
            queryClient.invalidateQueries({queryKey: ['shipment']});
            queryClient.invalidateQueries({queryKey: ['myShipments']});
            setToast(
                `✓ Order & Shipment #${orderId} synced to ${getStatusMeta(nextStatus).label}.`
            );
            setTimeout(() => setToast(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update order status.');
        } finally {
            setUpdatingId(null);
        }
    };

    const orderStatusCounts = orders.reduce((acc, o) => {
        const st = normalizeStatusKey(o.status);
        acc[st] = (acc[st] || 0) + 1;
        return acc;
    }, {});

    const pendingSellerUpdateOrdersCount = orders.filter(
        (o) => getPendingSellerUpdates(o).length > 0
    ).length;

    const filteredOrders = orders.filter((o) => {
        const st = normalizeStatusKey(o.status);
        if (statusFilter === 'SELLER_UPDATES') {
            if (getPendingSellerUpdates(o).length === 0) return false;
        } else if (statusFilter !== 'ALL' && st !== statusFilter) {
            return false;
        }
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            const fullName = `${o.name?.first || ''} ${o.name?.last || ''}`.toLowerCase();
            return (
                String(o.order_id || '').toLowerCase().includes(q) ||
                fullName.includes(q) ||
                String(o.email || '').toLowerCase().includes(q) ||
                String(o.address?.city || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const paginatedOrders = filteredOrders.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const totalRevenue = orders
        .filter((o) => !isTerminalGreyStatus(o.status))
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    return (
        <AdminLayout
            title="All Customer Orders"
            subtitle="Search, inspect, and transition order statuses inline or view full itemized receipts."
            actions={
                <Link to="/admin/orders/update" className={styles['header-btn']}>
                    <span className="material-symbols-outlined">edit_note</span>
                    <span>Status Lookup Tool</span>
                </Link>
            }
        >
            {toast && <div className={styles['toast-ok']}>{toast}</div>}
            {error && <div className={styles['toast-err']}>{error}</div>}

            {/* Summary Strip */}
            <div className={styles['summary-strip']}>
                <div className={styles['sum-box']}>
                    <small>Total Orders</small>
                    <strong>{orders.length}</strong>
                </div>
                <div className={styles['sum-box']}>
                    <small>Active Revenue</small>
                    <strong>{formatKES(totalRevenue)} KES</strong>
                </div>
                <div className={styles['sum-box']}>
                    <small>Active / In Progress</small>
                    <strong>
                        {
                            orders.filter(
                                (o) =>
                                    !isDeliveredStatus(o.status) && !isTerminalGreyStatus(o.status)
                            ).length
                        }
                    </strong>
                </div>
                <div className={styles['sum-box']}>
                    <small>Delivered</small>
                    <strong>{orders.filter((o) => isDeliveredStatus(o.status)).length}</strong>
                </div>
            </div>

            <div className={styles['card']}>
                {/* Search & Status Filter Toolbar */}
                <div className={styles['toolbar']}>
                    <div className={styles['search-input']}>
                        <span className="material-symbols-outlined">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by Order ID (#BGOX5U), customer name, email, or city..."
                        />
                    </div>

                    <div className={styles['filter-pills']}>
                        {QUICK_FILTERS.map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setStatusFilter(f.id)}
                                className={`${styles['pill']} ${
                                    f.id === 'SELLER_UPDATES' && pendingSellerUpdateOrdersCount > 0
                                        ? styles['pill-seller-alert']
                                        : ''
                                } ${statusFilter === f.id ? styles['pill-active'] : ''}`}
                            >
                                {f.id === 'ALL'
                                    ? `All (${orders.length})`
                                    : f.id === 'SELLER_UPDATES'
                                    ? `🏪 Seller Updates (${pendingSellerUpdateOrdersCount})`
                                    : `${f.label}${orderStatusCounts[f.id] ? ` (${orderStatusCounts[f.id]})` : ''}`}
                            </button>
                        ))}
                    </div>
                </div>

                {isPending ? (
                    <Loading/>
                ) : filteredOrders.length === 0 ? (
                    <div className={styles['empty']}>
                        <span className="material-symbols-outlined">receipt_long</span>
                        <h3>No matching orders found</h3>
                        <p>Try clearing your search filter or status tab.</p>
                    </div>
                ) : (
                    <>
                        <div className={styles['table-wrap']}>
                            <table className={styles['table']}>
                                <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Placed Date</th>
                                        <th>Customer</th>
                                        <th>Mode</th>
                                        <th>Items</th>
                                        <th>Total (KES)</th>
                                        <th>Status</th>
                                        <th>Quick Update</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedOrders.map((ord) => {
                                        const isPickup =
                                            ord.address?.delivery_method === 'PICKUP_STATION';
                                        const itemCount = (ord.products || []).reduce(
                                            (s, p) => s + (Number(p.quantity) || 1),
                                            0
                                        );
                                        const st = normalizeStatusKey(ord.status);
                                        const meta = getStatusMeta(st);
                                        const toneClass =
                                            meta.tone === 'green'
                                                ? styles['st-fulfilled']
                                                : meta.tone === 'grey'
                                                ? styles['st-cancelled']
                                                : meta.tone === 'amber'
                                                ? styles['st-processing']
                                                : styles['st-created'];
                                        return (
                                            <tr key={ord.order_id}>
                                                <td>
                                                    <Link
                                                        to={`/admin/orders/${ord.order_id}`}
                                                        className={styles['id-badge']}
                                                    >
                                                        #{ord.order_id}
                                                    </Link>
                                                </td>
                                                <td className={styles['date-cell']}>
                                                    {formatDateTime(ord.ordered_at)}
                                                </td>
                                                <td>
                                                    <div className={styles['cust-cell']}>
                                                        <strong>
                                                            {[ord.name?.first, ord.name?.last]
                                                                .filter(Boolean)
                                                                .join(' ') || 'Customer'}
                                                        </strong>
                                                        <small>{ord.email || ord.phone_number}</small>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={styles['mode-chip']}>
                                                        {isPickup ? '🏪 Pickup' : '🛵 Doorstep'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <strong>{itemCount}</strong>
                                                </td>
                                                <td>
                                                    <strong className={styles['price-text']}>
                                                        {formatKES(ord.total)} KES
                                                    </strong>
                                                </td>
                                                <td>
                                                    <div className={styles['status-stack']}>
                                                        <span
                                                            className={`${styles['status-badge']} ${toneClass}`}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                        {getPendingSellerUpdates(ord).map((upd, idx) => {
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
                                                                            updatingId === ord.order_id
                                                                        }
                                                                        onClick={() =>
                                                                            handleInlineStatusChange(
                                                                                ord.order_id,
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
                                                        disabled={updatingId === ord.order_id}
                                                        onChange={(e) =>
                                                            handleInlineStatusChange(
                                                                ord.order_id,
                                                                e.target.value
                                                            )
                                                        }
                                                        className={styles['inline-select']}
                                                    >
                                                        {ORDER_STATUSES.map((opt) => (
                                                            <option key={opt} value={opt}>
                                                                {getStatusMeta(opt).label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <div className={styles['actions-cell']}>
                                                        <Link
                                                            to={`/admin/orders/${ord.order_id}`}
                                                            className={styles['view-btn']}
                                                        >
                                                            View
                                                        </Link>
                                                        <Link
                                                            to={`/shipping/${ord.order_id}`}
                                                            className={styles['track-btn']}
                                                        >
                                                            Shipment
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
                            totalItems={filteredOrders.length}
                            currentPage={currentPage}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setCurrentPage}
                            onRowsPerPageChange={setRowsPerPage}
                            itemLabel="orders"
                        />
                    </>
                )}
            </div>
        </AdminLayout>
    );
};

export default AdminOrders;
