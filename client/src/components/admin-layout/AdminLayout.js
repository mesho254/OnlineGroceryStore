import styles from './adminLayout.module.css';
import {Link, useLocation} from "react-router-dom";
import {useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "../../api";

const NAV_SECTIONS = [
    {
        group: 'ANALYTICS & INSIGHTS',
        items: [
            {
                id: 'overview',
                to: '/admin',
                tab: 'overview',
                icon: 'monitoring',
                label: 'Analytics Dashboard',
            },
            {
                id: 'logs',
                to: '/admin?tab=logs',
                tab: 'logs',
                icon: 'terminal',
                label: 'Audit & Activity Logs',
            },
            {
                id: 'notifications',
                to: '/notifications',
                icon: 'notifications',
                label: 'All Notifications',
            },
        ],
    },
    {
        group: 'ORDER & DISPATCH OPS',
        items: [
            {
                id: 'orders',
                to: '/admin/orders',
                icon: 'receipt_long',
                label: 'All Orders',
            },
            {
                id: 'orders-update',
                to: '/admin/orders/update',
                icon: 'edit_note',
                label: 'Update Order Status',
            },
            {
                id: 'shipping',
                to: '/admin/shipping',
                icon: 'local_shipping',
                label: 'All Shipments',
            },
            {
                id: 'shipping-update',
                to: '/admin/shipping/update',
                icon: 'published_with_changes',
                label: 'Update Shipping Status',
            },
            {
                id: 'pickup-stations',
                to: '/admin/pickup-stations',
                icon: 'storefront',
                label: 'Pickup Stations',
            },
        ],
    },
    {
        group: 'CATALOG & PEOPLE',
        items: [
            {
                id: 'inventory',
                to: '/admin?tab=inventory',
                tab: 'inventory',
                icon: 'inventory_2',
                label: 'Inventory Manager',
            },
            {
                id: 'products-new',
                to: '/admin/products/new',
                icon: 'add_box',
                label: 'Add New Product',
            },
            {
                id: 'products-update',
                to: '/admin/products/update',
                icon: 'upload_file',
                label: 'Bulk CSV Update',
            },
            {
                id: 'sellers',
                to: '/admin?tab=sellers',
                tab: 'sellers',
                icon: 'store',
                label: 'Manage Sellers',
            },
            {
                id: 'users',
                to: '/admin?tab=users',
                tab: 'users',
                icon: 'group',
                label: 'User Management',
            },
            {
                id: 'trash',
                to: '/admin?tab=trash',
                tab: 'trash',
                icon: 'delete_sweep',
                label: 'Trash & GDPR',
            },
        ],
    },
];

const AdminLayout = ({
    title,
    eyebrow = 'KIJANIMART ADMIN OPERATIONS',
    subtitle,
    activeTab,
    actions,
    children,
}) => {
    const location = useLocation();
    const user = useSelector((state) => state.authentication.user);
    const searchParams = new URLSearchParams(location.search);
    const currentTab = activeTab || searchParams.get('tab') || 'overview';

    const isAdmin = user?.role === 'ADMIN';

    const {data: overview} = useQuery({
        queryKey: ['adminOverview'],
        queryFn: async () => {
            const res = await api.fetchAdminOverview();
            return res.data;
        },
        enabled: isAdmin,
        staleTime: 15000,
        refetchInterval: 30000,
    });

    const {data: notifData} = useQuery({
        queryKey: ['notifications', 'all'],
        queryFn: async () => {
            const res = await api.fetchNotifications('all', 30);
            return res.data;
        },
        enabled: isAdmin,
        staleTime: 15000,
        refetchInterval: 30000,
    });

    const kpis = overview?.kpis || {};
    const shipSummary = overview?.shipments_summary || {};
    const pendingInvApprovals =
        (kpis.pending_products_count || 0) + (kpis.pending_product_edits_count || 0);
    const lowOrOutStock = (kpis.out_of_stock_count || 0) + (kpis.low_stock_count || 0);
    const activeShipments = (shipSummary.CREATED || 0) + (shipSummary.SHIPPED || 0);
    const totalTrashed = (kpis.trashed_products_count || 0) + (kpis.trashed_users_count || 0);

    const getSidebarBadge = (itemId) => {
        if (itemId === 'notifications') {
            const count = notifData?.unread_count || 0;
            return count > 0
                ? {count, tone: 'danger', title: `${count} unread notification(s)`}
                : null;
        }
        if (itemId === 'orders') {
            const count = kpis.pending_orders || 0;
            return count > 0
                ? {count, tone: 'amber', title: `${count} pending order(s) in progress`}
                : null;
        }
        if (itemId === 'orders-update') {
            const count = kpis.pending_seller_order_updates || 0;
            return count > 0
                ? {
                      count,
                      tone: 'danger',
                      title: `${count} seller order status update(s) awaiting Admin review`,
                  }
                : null;
        }
        if (itemId === 'shipping') {
            return activeShipments > 0
                ? {
                      count: activeShipments,
                      tone: 'blue',
                      title: `${shipSummary.CREATED || 0} awaiting dispatch • ${
                          shipSummary.SHIPPED || 0
                      } in transit`,
                  }
                : null;
        }
        if (itemId === 'shipping-update') {
            const count = shipSummary.CREATED || 0;
            return count > 0
                ? {count, tone: 'amber', title: `${count} shipment(s) awaiting dispatch`}
                : null;
        }
        if (itemId === 'inventory') {
            if (pendingInvApprovals > 0) {
                return {
                    count: pendingInvApprovals,
                    tone: 'amber',
                    title: `${kpis.pending_products_count || 0} pending publish • ${
                        kpis.pending_product_edits_count || 0
                    } pending seller edit(s)`,
                };
            }
            if (lowOrOutStock > 0) {
                return {
                    count: lowOrOutStock,
                    tone: (kpis.out_of_stock_count || 0) > 0 ? 'danger' : 'amber',
                    title: `${kpis.out_of_stock_count || 0} sold out • ${
                        kpis.low_stock_count || 0
                    } low stock`,
                };
            }
            return null;
        }
        if (itemId === 'sellers') {
            const count = kpis.pending_sellers_count || 0;
            return count > 0
                ? {count, tone: 'amber', title: `${count} seller application(s) pending approval`}
                : null;
        }
        if (itemId === 'trash') {
            return totalTrashed > 0
                ? {
                      count: totalTrashed,
                      tone: 'neutral',
                      title: `${kpis.trashed_products_count || 0} trashed product(s) • ${
                          kpis.trashed_users_count || 0
                      } suspended GDPR user(s)`,
                  }
                : null;
        }
        return null;
    };

    const isItemActive = (item) => {
        if (location.pathname === '/admin') {
            return item.tab ? item.tab === currentTab : false;
        }
        if (item.id === 'inventory' && location.pathname.startsWith('/admin/products/edit/')) {
            return true;
        }
        if (item.to.startsWith('/admin?')) return false;
        if (item.to === '/admin/orders' && location.pathname.startsWith('/admin/orders/')) {
            return location.pathname !== '/admin/orders/update';
        }
        return location.pathname === item.to;
    };

    return (
        <div className={styles['shell']}>
            {/* Left Persistent Admin Sidebar */}
            <aside className={styles['sidebar']}>
                <div className={styles['sidebar-brand']}>
                    <div className={styles['brand-icon']}>
                        <span className="material-symbols-outlined">shield_person</span>
                    </div>
                    <div>
                        <strong>Admin Console</strong>
                        <small>
                            {user?.first_name
                                ? `${user.first_name} ${user.last_name || ''}`
                                : 'Supermarket Ops'}
                        </small>
                    </div>
                </div>

                <nav className={styles['sidebar-nav']}>
                    {NAV_SECTIONS.map((group) => (
                        <div key={group.group} className={styles['nav-group']}>
                            <span className={styles['group-label']}>{group.group}</span>
                            <div className={styles['group-items']}>
                                {group.items.map((item) => {
                                    const active = isItemActive(item);
                                    const badge = getSidebarBadge(item.id);
                                    return (
                                        <Link
                                            key={item.id}
                                            to={item.to}
                                            title={badge?.title || item.label}
                                            className={`${styles['nav-link']} ${
                                                active ? styles['nav-link-active'] : ''
                                            }`}
                                        >
                                            <span className="material-symbols-outlined">
                                                {item.icon}
                                            </span>
                                            <span className={styles['nav-label']}>{item.label}</span>
                                            {badge && (
                                                <span
                                                    className={`${styles['nav-badge']} ${
                                                        styles[`badge-${badge.tone}`] || ''
                                                    }`}
                                                >
                                                    {badge.count > 99 ? '99+' : badge.count}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className={styles['sidebar-footer']}>
                    <a
                        href="/seller"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles['seller-portal-btn']}
                    >
                        <span className="material-symbols-outlined">store</span>
                        <span>Seller Portal ↗</span>
                    </a>
                    <Link to="/products" className={styles['storefront-btn']}>
                        <span className="material-symbols-outlined">storefront</span>
                        <span>View Live Storefront</span>
                    </Link>
                </div>
            </aside>

            {/* Right Main Workspace */}
            <main className={styles['workspace']}>
                {/* Mobile / Compact Horizontal Quick-Nav Strip */}
                <div className={styles['mobile-tabs']}>
                    {NAV_SECTIONS.flatMap((g) => g.items).map((item) => {
                        const active = isItemActive(item);
                        const badge = getSidebarBadge(item.id);
                        return (
                            <Link
                                key={item.id}
                                to={item.to}
                                title={badge?.title || item.label}
                                className={`${styles['mobile-tab']} ${
                                    active ? styles['mobile-tab-active'] : ''
                                }`}
                            >
                                <span className="material-symbols-outlined">{item.icon}</span>
                                <span>{item.label}</span>
                                {badge && (
                                    <span
                                        className={`${styles['mobile-badge']} ${
                                            active
                                                ? styles['mobile-badge-on-active']
                                                : styles[`badge-${badge.tone}`] || ''
                                        }`}
                                    >
                                        {badge.count > 99 ? '99+' : badge.count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>

                {title && (
                    <header className={styles['page-header']}>
                        <div className={styles['header-left']}>
                            <span className={styles['eyebrow']}>{eyebrow}</span>
                            <h1>{title}</h1>
                            {subtitle && <p>{subtitle}</p>}
                        </div>
                        {actions && <div className={styles['header-actions']}>{actions}</div>}
                    </header>
                )}

                <div className={styles['content']}>{children}</div>
            </main>
        </div>
    );
};

export default AdminLayout;
