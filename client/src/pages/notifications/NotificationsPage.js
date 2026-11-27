import styles from './notificationsPage.module.css';
import {useEffect, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../api";
import {queryClient} from "../../index";
import Loading from "../../components/loading/Loading";
import TablePagination from "../../components/table-pagination/TablePagination";
import DeliveryReviewModal from "../../components/review-modal/DeliveryReviewModal";

const formatRelativeAndExact = (val) => {
    if (!val) return 'Just now';
    const d = new Date(val);
    if (isNaN(d.getTime())) return 'Recent';
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    let rel = '';
    if (diffMin < 1) rel = 'Just now';
    else if (diffMin < 60) rel = `${diffMin}m ago`;
    else if (diffMin < 1440) rel = `${Math.floor(diffMin / 60)}h ago`;
    else rel = `${Math.floor(diffMin / 1440)}d ago`;

    const exact = d.toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    return `${rel} • ${exact}`;
};

const getNotifIcon = (type) => {
    if (type === 'DELIVERY_REVIEW') return '⭐';
    if (type === 'OUT_OF_STOCK' || type === 'SELLER_OUT_OF_STOCK') return '🚨';
    if (type === 'LOW_STOCK' || type === 'SELLER_LOW_STOCK') return '⚠️';
    if (type === 'SELLER_APPLICATION') return '🏪';
    if (type === 'SELLER_APPROVAL') return '🎉';
    if (type === 'SELLER_ORDER_UPDATE') return '📦';
    if (type === 'PRODUCT_APPROVAL_REQUEST') return '📝';
    if (type === 'PRODUCT_EDIT_REQUEST') return '✏️';
    if (type === 'PRODUCT_APPROVAL_RESULT') return '✅';
    if (type === 'SHIPMENT_UPDATE') return '🚚';
    return '🛍️';
};

const getNotifCta = (notif) => {
    if (notif.type === 'DELIVERY_REVIEW') {
        return notif.is_mine === false
            ? {label: 'View Customer Order →', tone: 'neutral'}
            : {label: '★ Rate Products & Seller', tone: 'amber'};
    }
    if (notif.type === 'OUT_OF_STOCK') return {label: 'Restock Sold Out →', tone: 'danger'};
    if (notif.type === 'LOW_STOCK') return {label: 'Restock in Inventory →', tone: 'amber'};
    if (notif.type === 'SELLER_OUT_OF_STOCK') {
        return notif.is_mine === false
            ? {label: 'View in Inventory →', tone: 'danger'}
            : {label: 'Restock in Seller Portal ↗', tone: 'danger'};
    }
    if (notif.type === 'SELLER_LOW_STOCK') {
        return notif.is_mine === false
            ? {label: 'View in Inventory →', tone: 'amber'}
            : {label: 'Restock in Seller Portal ↗', tone: 'amber'};
    }
    if (notif.type === 'SELLER_APPLICATION') return {label: 'Review Seller Request →', tone: 'green'};
    if (notif.type === 'SELLER_APPROVAL') {
        return notif.is_mine === false
            ? {label: 'Manage Sellers →', tone: 'green'}
            : {label: 'Open Seller Portal ↗', tone: 'green'};
    }
    if (notif.type === 'SELLER_ORDER_UPDATE') return {label: 'Review & Apply to Order →', tone: 'amber'};
    if (notif.type === 'PRODUCT_APPROVAL_REQUEST') return {label: 'Approve Product →', tone: 'amber'};
    if (notif.type === 'PRODUCT_EDIT_REQUEST') return {label: 'Review Product Edits →', tone: 'amber'};
    if (notif.type === 'PRODUCT_APPROVAL_RESULT') {
        return notif.is_mine === false
            ? {label: 'View in Inventory →', tone: 'green'}
            : {label: 'Open Seller Catalog ↗', tone: 'green'};
    }
    if (notif.order_id) return {label: `Open Order #${notif.order_id} →`, tone: 'neutral'};
    return null;
};

const TYPE_GROUPS = [
    {id: 'ALL', label: 'All Types'},
    {id: 'ORDERS', label: 'Orders & Delivery'},
    {id: 'SELLERS', label: 'Sellers & Products'},
    {id: 'STOCK', label: 'Stock Alerts'},
];

const matchesTypeGroup = (type, group) => {
    if (group === 'ALL') return true;
    if (group === 'ORDERS') {
        return ['ORDER_CONFIRMED', 'DELIVERY_REVIEW', 'SHIPMENT_UPDATE'].includes(type);
    }
    if (group === 'SELLERS') {
        return [
            'SELLER_APPLICATION',
            'SELLER_APPROVAL',
            'SELLER_ORDER_UPDATE',
            'PRODUCT_APPROVAL_REQUEST',
            'PRODUCT_EDIT_REQUEST',
            'PRODUCT_APPROVAL_RESULT',
        ].includes(type);
    }
    if (group === 'STOCK') {
        return ['LOW_STOCK', 'OUT_OF_STOCK', 'SELLER_LOW_STOCK', 'SELLER_OUT_OF_STOCK'].includes(
            type
        );
    }
    return true;
};

const NotificationsPage = () => {
    const navigate = useNavigate();
    const user = useSelector((state) => state.authentication.user);
    const isAdmin = user?.role === 'ADMIN';

    const [scope, setScope] = useState(isAdmin ? 'all' : 'mine');
    const [readFilter, setReadFilter] = useState('ALL'); // 'ALL' | 'UNREAD' | 'READ'
    const [typeGroup, setTypeGroup] = useState('ALL');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(5);
    const [busyMarkAll, setBusyMarkAll] = useState(false);
    const [activeReviewModalNotif, setActiveReviewModalNotif] = useState(null);

    useEffect(() => {
        if (!isAdmin && scope !== 'mine') {
            setScope('mine');
        }
    }, [isAdmin, scope]);

    useEffect(() => {
        setPage(1);
    }, [scope, readFilter, typeGroup, search, rowsPerPage]);

    const effectiveScope = isAdmin ? scope : 'mine';

    const {data, isPending, refetch, isFetching} = useQuery({
        queryKey: ['notificationsPage', effectiveScope],
        queryFn: async () => {
            const res = await api.fetchNotifications(effectiveScope, 200);
            return res.data;
        },
        staleTime: 10000,
        placeholderData: (prev) => prev,
        refetchOnWindowFocus: true,
    });

    const notifications = data?.notifications || [];
    const unreadCount = data?.unread_count || 0;
    const allCount = data?.all_count ?? notifications.length;
    const mineCount = data?.mine_count ?? notifications.length;
    const allUnreadCount = data?.all_unread_count ?? unreadCount;
    const mineUnreadCount = data?.mine_unread_count ?? unreadCount;

    const filtered = notifications.filter((n) => {
        if (readFilter === 'UNREAD' && n.read) return false;
        if (readFilter === 'READ' && !n.read) return false;
        if (!matchesTypeGroup(n.type, typeGroup)) return false;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            return (
                String(n.title || '').toLowerCase().includes(q) ||
                String(n.message || '').toLowerCase().includes(q) ||
                String(n.order_id || '').toLowerCase().includes(q) ||
                String(n.recipient_name || '').toLowerCase().includes(q) ||
                String(n.recipient_email || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const paginated = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const handleMarkAllRead = async () => {
        setBusyMarkAll(true);
        try {
            await api.markAllNotificationsRead(effectiveScope);
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['notificationsPage']});
        } catch {
            // ignore
        } finally {
            setBusyMarkAll(false);
        }
    };

    const handleMarkSingleRead = async (e, notif) => {
        e.stopPropagation();
        if (notif.read || !notif._id) return;
        try {
            await api.markNotificationRead(notif._id);
            queryClient.invalidateQueries({queryKey: ['notifications']});
            queryClient.invalidateQueries({queryKey: ['notificationsPage']});
        } catch {
            // ignore
        }
    };

    const handleOpenNotification = async (notif) => {
        if (!notif.read && notif._id) {
            api.markNotificationRead(notif._id)
                .then(() => {
                    queryClient.invalidateQueries({queryKey: ['notifications']});
                    queryClient.invalidateQueries({queryKey: ['notificationsPage']});
                })
                .catch(() => {});
        }
        if (notif.type === 'DELIVERY_REVIEW' && notif.is_mine !== false) {
            setActiveReviewModalNotif(notif);
        } else if (notif.link && notif.link.startsWith('/seller')) {
            window.open(notif.link, '_blank', 'noopener,noreferrer');
        } else if (notif.link) {
            navigate(notif.link);
        }
    };

    return (
        <div className={styles['page-shell']}>
            <div className={styles['page-head']}>
                <div>
                    <span className={styles['eyebrow']}>
                        {isAdmin ? 'ADMIN & PERSONAL ACTIVITY FEED' : 'YOUR ACTIVITY & ALERTS'}
                    </span>
                    <h1>
                        {isAdmin && effectiveScope === 'all'
                            ? 'All Platform Notifications'
                            : 'My Notifications'}
                    </h1>
                    <p>
                        {isAdmin
                            ? 'Monitor every customer order, seller submission, stock alert, and your own personal notifications in one place.'
                            : 'Stay updated on your orders, deliveries, pending reviews, and seller updates.'}
                    </p>
                </div>

                <div className={styles['head-actions']}>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className={styles['outline-btn']}
                    >
                        <span className="material-symbols-outlined">refresh</span>
                        <span>{isFetching ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            disabled={busyMarkAll}
                            className="btn1"
                        >
                            <span className="material-symbols-outlined">done_all</span>
                            <span>
                                {busyMarkAll
                                    ? 'Marking...'
                                    : isAdmin && effectiveScope === 'all'
                                    ? `Mark All Read (${unreadCount})`
                                    : `Mark Mine Read (${unreadCount})`}
                            </span>
                        </button>
                    )}
                    {isAdmin && (
                        <Link to="/admin" className={styles['outline-btn']}>
                            <span className="material-symbols-outlined">admin_panel_settings</span>
                            <span>Admin Console</span>
                        </Link>
                    )}
                </div>
            </div>

            {/* Admin Scope Switcher: All Notifications vs My Notifications */}
            {isAdmin && (
                <div className={styles['scope-bar']}>
                    <button
                        type="button"
                        onClick={() => setScope('all')}
                        className={`${styles['scope-pill']} ${
                            effectiveScope === 'all' ? styles['scope-pill-active'] : ''
                        }`}
                    >
                        <span className="material-symbols-outlined">public</span>
                        <span>All Notifications ({allCount})</span>
                        {allUnreadCount > 0 && (
                            <span className={styles['scope-badge']}>{allUnreadCount} unread</span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setScope('mine')}
                        className={`${styles['scope-pill']} ${
                            effectiveScope === 'mine' ? styles['scope-pill-active'] : ''
                        }`}
                    >
                        <span className="material-symbols-outlined">person</span>
                        <span>Mine Only ({mineCount})</span>
                        {mineUnreadCount > 0 && (
                            <span className={styles['scope-badge']}>{mineUnreadCount} unread</span>
                        )}
                    </button>
                </div>
            )}

            <div className={styles['card']}>
                {/* Search + Filter Controls */}
                <div className={styles['toolbar']}>
                    <div className={styles['search-box']}>
                        <span className="material-symbols-outlined">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={
                                isAdmin
                                    ? 'Search by user name, email, Order ID, or notification message...'
                                    : 'Search by Order ID or notification message...'
                            }
                        />
                    </div>

                    <div className={styles['filter-group']}>
                        {[
                            {id: 'ALL', label: `All (${notifications.length})`},
                            {
                                id: 'UNREAD',
                                label: `Unread (${notifications.filter((n) => !n.read).length})`,
                            },
                            {
                                id: 'READ',
                                label: `Read (${notifications.filter((n) => n.read).length})`,
                            },
                        ].map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setReadFilter(f.id)}
                                className={`${styles['pill']} ${
                                    readFilter === f.id ? styles['pill-active'] : ''
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>

                    <select
                        value={typeGroup}
                        onChange={(e) => setTypeGroup(e.target.value)}
                        className={styles['type-select']}
                    >
                        {TYPE_GROUPS.filter((g) => isAdmin || g.id !== 'STOCK').map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.label}
                            </option>
                        ))}
                    </select>
                </div>

                {isPending ? (
                    <Loading/>
                ) : filtered.length === 0 ? (
                    <div className={styles['empty-state']}>
                        <span className="material-symbols-outlined">notifications_off</span>
                        <h3>No matching notifications</h3>
                        <p>
                            {search || readFilter !== 'ALL' || typeGroup !== 'ALL'
                                ? 'Try adjusting your search or filters.'
                                : 'You are all caught up! Order, review, and store alerts will appear here.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className={styles['feed']}>
                            {paginated.map((notif) => {
                                const cta = getNotifCta(notif);
                                return (
                                    <div
                                        key={notif._id}
                                        onClick={() => handleOpenNotification(notif)}
                                        className={`${styles['row']} ${
                                            !notif.read ? styles['row-unread'] : ''
                                        }`}
                                    >
                                        <div className={styles['row-icon']}>
                                            {getNotifIcon(notif.type)}
                                        </div>

                                        <div className={styles['row-body']}>
                                            <div className={styles['row-top']}>
                                                <div className={styles['row-title-cluster']}>
                                                    <strong>{notif.title}</strong>
                                                    {isAdmin && effectiveScope === 'all' && (
                                                        <span
                                                            className={
                                                                notif.is_mine
                                                                    ? styles['tag-mine']
                                                                    : styles['tag-user']
                                                            }
                                                        >
                                                            {notif.is_mine
                                                                ? 'For Admin (You)'
                                                                : `👤 ${notif.recipient_name || 'User'}${
                                                                      notif.recipient_email
                                                                          ? ` • ${notif.recipient_email}`
                                                                          : ''
                                                                  }`}
                                                        </span>
                                                    )}
                                                </div>
                                                <small className={styles['timestamp']}>
                                                    {formatRelativeAndExact(notif.created_at)}
                                                </small>
                                            </div>

                                            <p className={styles['row-msg']}>{notif.message}</p>

                                            <div className={styles['row-footer']}>
                                                {cta && (
                                                    <span
                                                        className={`${styles['cta-chip']} ${
                                                            styles[`cta-${cta.tone}`] || ''
                                                        }`}
                                                    >
                                                        {cta.label}
                                                    </span>
                                                )}
                                                {!notif.read && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) =>
                                                            handleMarkSingleRead(e, notif)
                                                        }
                                                        className={styles['mark-one-btn']}
                                                    >
                                                        ✓ Mark read
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {!notif.read && <span className={styles['unread-dot']}/>}
                                    </div>
                                );
                            })}
                        </div>

                        <TablePagination
                            totalItems={filtered.length}
                            currentPage={page}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setPage}
                            onRowsPerPageChange={setRowsPerPage}
                            itemLabel="notifications"
                        />
                    </>
                )}
            </div>

            {activeReviewModalNotif && (
                <DeliveryReviewModal
                    notification={activeReviewModalNotif}
                    onClose={() => setActiveReviewModalNotif(null)}
                />
            )}
        </div>
    );
};

export default NotificationsPage;
